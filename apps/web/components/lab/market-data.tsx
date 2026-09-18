'use client';

import { DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Empty, Input, Modal, Row, Skeleton, Space, Table, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import { api, apiUpload, errorMessage } from '../../lib/api';
import { useBarImport, useBarImports, useBarSeries, useLabMutation, type BarImportBatch } from '../../lib/lab';
import { Eyebrow } from '../planning';
import { LabNote, Muted } from './shared';

/*
 * The market data wizard: upload, review, commit.
 *
 * The review step is not ceremony. A price file that parses is not the same as a price file
 * that is right, and the two things that go wrong most often — minute bars read as daily, and
 * a date format guessed the wrong way round — are both visible in the first and last twenty
 * rows. So that is what the review screen shows.
 *
 * No network is involved at any point: the file is read in the browser, posted to Arvo, and
 * parsed there.
 */

export function MarketDataWizard() {
  const { message } = App.useApp();
  const series = useBarSeries();
  const imports = useBarImports();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');
  const [uploading, setUploading] = useState(false);
  const active = useBarImport(activeId);

  const commit = useLabMutation((id: string) => api<{ inserted: number }>(`/lab/market-data/imports/${id}/commit`, { method: 'POST' }));
  const removeBatch = useLabMutation((id: string) => api(`/lab/market-data/imports/${id}`, { method: 'DELETE' }));
  const removeSeries = useLabMutation(({ symbol: name, timeframe }: { symbol: string; timeframe: string }) =>
    api(`/lab/market-data?symbol=${encodeURIComponent(name)}&timeframe=${timeframe}`, { method: 'DELETE' }),
  );

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      if (symbol.trim()) body.append('symbol', symbol.trim().toUpperCase());
      const batch = await apiUpload<BarImportBatch>('/lab/market-data/imports', body);
      setActiveId(batch.id);
      await imports.refetch();
      message.success(`${batch.rowCount.toLocaleString('en-IN')} bars read from ${batch.filename}`);
    } catch (problem) {
      message.error(errorMessage(problem));
    } finally {
      setUploading(false);
    }
    return false;
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={9}>
        <Card size="small" title="Import price data">
          <Input
            size="small"
            placeholder="Symbol (optional — read from the file otherwise)"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            style={{ marginBottom: 12 }}
          />
          <Upload.Dragger accept=".csv,.tsv,.txt,.xlsx,.xls" showUploadList={false} beforeUpload={upload} disabled={uploading}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drop an OHLCV file here</p>
            <p className="ant-upload-hint">
              CSV or XLSX with date, open, high, low, close and ideally volume. Daily or minute bars; the timeframe is read from the data. Up to 25 MB.
            </p>
          </Upload.Dragger>
          <LabNote text="Arvo never fetches prices. Everything here comes from a file you export from your broker or data vendor." />
        </Card>

        <Card size="small" title="Series you have" style={{ marginTop: 16 }}>
          {series.isPending && <Skeleton active paragraph={{ rows: 3 }} />}
          {series.data?.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing imported yet" />}
          {(series.data?.length ?? 0) > 0 && (
            <Table
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              rowKey={(row) => `${row.symbol}|${row.timeframe}`}
              dataSource={series.data}
              columns={[
                { title: 'Symbol', dataIndex: 'symbol' },
                { title: 'Bars', dataIndex: 'timeframe', render: (value: string) => <Tag>{value === 'DAY' ? 'Daily' : 'Minute'}</Tag> },
                { title: 'Count', dataIndex: 'bars', align: 'right' as const, render: (value: number) => value.toLocaleString('en-IN') },
                { title: 'From', dataIndex: 'from' },
                { title: 'To', dataIndex: 'to' },
                {
                  title: '',
                  align: 'right' as const,
                  render: (_: unknown, row) => (
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        Modal.confirm({
                          title: `Delete every ${row.timeframe === 'DAY' ? 'daily' : 'minute'} bar for ${row.symbol}?`,
                          content: 'Backtests already stored keep their results; new runs will have nothing to run against.',
                          okText: 'Delete',
                          okButtonProps: { danger: true },
                          onOk: () => removeSeries.mutateAsync({ symbol: row.symbol, timeframe: row.timeframe }),
                        })
                      }
                    />
                  ),
                },
              ]}
            />
          )}
        </Card>
      </Col>

      <Col xs={24} lg={15}>
        <Card size="small" title="Review and commit">
          {!activeId && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Upload a file, or pick one below, to review it before it is committed." />}
          {active.isPending && activeId && <Skeleton active paragraph={{ rows: 6 }} />}
          {active.data && (
            <>
              <Space wrap style={{ marginBottom: 12 }}>
                <Tag color="blue">{active.data.batch.symbol}</Tag>
                <Tag>{active.data.batch.timeframe === 'DAY' ? 'Daily bars' : 'Minute bars'}</Tag>
                <Muted>
                  {active.data.batch.rowCount.toLocaleString('en-IN')} bars · {active.data.batch.from} to {active.data.batch.to}
                </Muted>
                <Tag color={active.data.batch.status === 'COMMITTED' ? 'green' : 'gold'}>{active.data.batch.status}</Tag>
              </Space>

              {active.data.batch.warnings.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <LabNote
                    type="warning"
                    text={
                      <>
                        <b>
                          {active.data.batch.warnings.length} thing{active.data.batch.warnings.length === 1 ? '' : 's'} to know about this file.
                        </b>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {active.data.batch.warnings.slice(0, 8).map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </>
                    }
                  />
                </div>
              )}

              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Eyebrow>First bars</Eyebrow>
                  <BarTable bars={active.data.head} />
                </Col>
                <Col xs={24} md={12}>
                  <Eyebrow>Last bars</Eyebrow>
                  <BarTable bars={active.data.tail} />
                </Col>
              </Row>

              {active.data.batch.status === 'READY' && (
                <Space style={{ marginTop: 16 }}>
                  <Button
                    type="primary"
                    loading={commit.isPending}
                    onClick={async () => {
                      const result = await commit.mutateAsync(active.data!.batch.id);
                      message.success(
                        result.inserted === 0
                          ? 'Nothing new — every bar in this file was already stored.'
                          : `${result.inserted.toLocaleString('en-IN')} bars added.`,
                      );
                    }}
                  >
                    Commit these bars
                  </Button>
                  <Button danger onClick={() => removeBatch.mutate(active.data!.batch.id)}>
                    Discard
                  </Button>
                </Space>
              )}
              <div style={{ marginTop: 12 }}>
                <Muted>Re-importing a file that overlaps one you already committed adds only the bars that were missing.</Muted>
              </div>
            </>
          )}
        </Card>

        {(imports.data?.length ?? 0) > 0 && (
          <Card size="small" title="Recent uploads" style={{ marginTop: 16 }}>
            <Table
              size="small"
              rowKey="id"
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 6, hideOnSinglePage: true }}
              dataSource={imports.data}
              onRow={(row) => ({ onClick: () => setActiveId(row.id), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'File', dataIndex: 'filename' },
                { title: 'Symbol', dataIndex: 'symbol' },
                { title: 'Bars', dataIndex: 'rowCount', align: 'right' as const, render: (value: number) => value.toLocaleString('en-IN') },
                { title: 'Status', dataIndex: 'status', render: (value: string) => <Tag color={value === 'COMMITTED' ? 'green' : 'gold'}>{value}</Tag> },
              ]}
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}

function BarTable({ bars }: { bars: { date: string; time: string | null; open: number; high: number; low: number; close: number; volume: number }[] }) {
  return (
    <Table
      size="small"
      pagination={false}
      scroll={{ y: 220 }}
      rowKey={(row) => `${row.date}${row.time ?? ''}`}
      dataSource={bars}
      columns={[
        { title: 'When', render: (_: unknown, row) => `${row.date}${row.time ? ` ${row.time}` : ''}` },
        { title: 'O', dataIndex: 'open', align: 'right' as const },
        { title: 'H', dataIndex: 'high', align: 'right' as const },
        { title: 'L', dataIndex: 'low', align: 'right' as const },
        { title: 'C', dataIndex: 'close', align: 'right' as const },
        { title: 'Vol', dataIndex: 'volume', align: 'right' as const, render: (value: number) => value.toLocaleString('en-IN') },
      ]}
    />
  );
}

export { Typography };
