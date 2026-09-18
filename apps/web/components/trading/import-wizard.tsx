'use client';

import { InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Empty, Input, Row, Select, Skeleton, Space, Table, Typography, Upload } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';
import { api, apiUpload, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useTradeImport, useTradeImports, useTradingMutation } from '../../lib/queries';
import type { TradeImportRow, TradeImportSource, TradeImportSummary } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, Stamp, type StampTone } from '../planning';
import { SEGMENT_LABELS, SIDE_TONES, Muted } from './shared';

const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;

  > div {
    min-width: 0;
  }
`;

const SOURCE_LABELS: Record<TradeImportSource, string> = {
  TRADEBOOK_CSV: 'Tradebook CSV',
  PNL_CSV: 'P&L CSV',
  CONTRACT_NOTE_PDF: 'Contract note PDF',
};

const ROW_TONES: Record<TradeImportRow['status'], StampTone> = {
  NEW: 'positive',
  DUPLICATE: 'neutral',
  ERROR: 'negative',
  COMMITTED: 'positive',
  SKIPPED: 'neutral',
};

/**
 * Upload → review → commit, the same shape as the statement and portfolio importers. Duplicate
 * fills are marked before anything is written, so a monthly file overlapping a quarterly one
 * cannot double a year's turnover.
 */
export function TradeImportWizard() {
  const money = useMoney();
  const { message } = App.useApp();
  const batches = useTradeImports();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [source, setSource] = useState<TradeImportSource | undefined>();
  const [broker, setBroker] = useState('');
  const [uploading, setUploading] = useState(false);
  const active = useTradeImport(activeId);

  const commit = useTradingMutation((id: string) => api<TradeImportSummary>(`/trades/imports/${id}/commit`, { method: 'POST' }));
  const decide = useTradingMutation(({ id, rowId, include }: { id: string; rowId: string; include: boolean }) =>
    api(`/trades/imports/${id}/rows/${rowId}`, { method: 'PATCH', body: { include } }),
  );
  const remove = useTradingMutation((id: string) => api(`/trades/imports/${id}`, { method: 'DELETE' }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      if (source) body.append('source', source);
      if (broker.trim()) body.append('broker', broker.trim());
      const summary = await apiUpload<TradeImportSummary>('/trades/imports', body);
      setActiveId(summary.batch.id);
      await batches.refetch();
      message.success(`${summary.counts.total} fills read from ${summary.batch.filename}`);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const summary = active.data;
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={9}>
        <Card title="Import a tradebook">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Upload.Dragger
              accept=".csv,.xlsx,.xls,.pdf"
              multiple={false}
              showUploadList={false}
              disabled={uploading}
              beforeUpload={(file) => {
                void upload(file as unknown as File);
                return false;
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Drop a tradebook or P&amp;L file here</p>
              <p className="ant-upload-hint">
                Zerodha Console, Upstox, Groww, Angel One, Dhan and Fyers exports, any CSV with a date, symbol, buy/sell, quantity and price, or a
                text-based contract note PDF. Up to 15 MB.
              </p>
            </Upload.Dragger>

            {/* Two fields in an auto-fit grid: side by side when the card is wide, stacked at 375px. */}
            <Fields>
              <div>
                <Eyebrow>File type</Eyebrow>
                <Select
                  allowClear
                  value={source}
                  onChange={setSource}
                  placeholder="Detect from the file"
                  style={{ width: '100%', marginTop: 6 }}
                  options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div>
                <Eyebrow>Broker name</Eyebrow>
                <Input
                  value={broker}
                  onChange={(event) => setBroker(event.target.value)}
                  placeholder="Recognised from the layout"
                  style={{ marginTop: 6 }}
                  maxLength={60}
                />
              </div>
            </Fields>
            <Muted>Only needed when the layout is not one Arvo knows. It sets which brokerage plan is applied.</Muted>
          </Space>
        </Card>

        <Card title="Previous imports" style={{ marginTop: 16 }}>
          {batches.isPending ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : (batches.data ?? []).length === 0 ? (
            <Empty description="Nothing imported yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            (batches.data ?? []).map((batch) => (
              <div
                key={batch.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(batch.id)}
                onKeyDown={(event) => event.key === 'Enter' && setActiveId(batch.id)}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid rgba(128,128,128,0.12)',
                  cursor: 'pointer',
                  opacity: activeId === batch.id ? 1 : 0.85,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Typography.Text ellipsis style={{ minWidth: 0 }}>
                    {batch.filename}
                  </Typography.Text>
                  <Stamp $tone={batch.status === 'COMMITTED' ? 'positive' : batch.status === 'FAILED' ? 'negative' : 'warning'}>{batch.status}</Stamp>
                </div>
                <Eyebrow>
                  {SOURCE_LABELS[batch.source]} · {batch.broker} · {batch.profile} · {formatDate(batch.createdAt.slice(0, 10))}
                </Eyebrow>
                {batch.error && <Muted style={{ display: 'block' }}>{batch.error}</Muted>}
              </div>
            ))
          )}
        </Card>
      </Col>

      <Col xs={24} lg={15}>
        {!summary ? (
          <Card>
            <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Upload a file, or pick an earlier import, to review it." />
          </Card>
        ) : (
          <Card
            title={summary.batch.filename}
            extra={
              <Space>
                <Button danger size="small" onClick={() => remove.mutate(summary.batch.id, { onSuccess: () => setActiveId(null) })}>
                  Delete
                </Button>
                <Button
                  type="primary"
                  size="small"
                  disabled={summary.batch.status !== 'READY' || summary.counts.new === 0}
                  loading={commit.isPending}
                  onClick={() =>
                    commit.mutate(summary.batch.id, {
                      onSuccess: () => message.success('Fills added to your journal'),
                      onError: (error) => message.error(errorMessage(error)),
                    })
                  }
                >
                  Import {summary.counts.new} fills
                </Button>
              </Space>
            }
          >
            <Space wrap size={8} style={{ marginBottom: 12 }}>
              <Stamp $tone="neutral">{summary.counts.total} rows</Stamp>
              <Stamp $tone="positive">{summary.counts.new} new</Stamp>
              {summary.counts.duplicate > 0 && <Stamp $tone="neutral">{summary.counts.duplicate} already imported</Stamp>}
              {summary.counts.skipped > 0 && <Stamp $tone="neutral">{summary.counts.skipped} skipped</Stamp>}
              {summary.counts.committed > 0 && <Stamp $tone="positive">{summary.counts.committed} imported</Stamp>}
            </Space>

            {summary.batch.warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Worth checking"
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {summary.batch.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                }
              />
            )}

            <Table<TradeImportRow>
              rowKey="id"
              size="small"
              dataSource={summary.rows}
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              columns={[
                { key: 'date', title: 'Date', render: (_, row) => `${formatDate(row.parsed.date)}${row.parsed.time ? ` ${row.parsed.time}` : ''}` },
                {
                  key: 'symbol',
                  title: 'Contract',
                  render: (_, row) => (
                    <div>
                      <div>{row.parsed.symbol}</div>
                      <Eyebrow>{SEGMENT_LABELS[row.parsed.segment]}</Eyebrow>
                    </div>
                  ),
                },
                { key: 'side', title: 'Side', render: (_, row) => <Stamp $tone={SIDE_TONES[row.parsed.side]}>{row.parsed.side}</Stamp> },
                { key: 'quantity', title: 'Qty', align: 'right', render: (_, row) => row.parsed.quantity },
                { key: 'price', title: 'Price', align: 'right', render: (_, row) => money(row.parsed.price, 'INR') },
                { key: 'amount', title: 'Value', align: 'right', render: (_, row) => money(row.parsed.amount, 'INR') },
                {
                  key: 'status',
                  title: 'Status',
                  render: (_, row) => (
                    <div>
                      <Stamp $tone={ROW_TONES[row.status]}>{row.status}</Stamp>
                      {row.message && <Eyebrow>{row.message}</Eyebrow>}
                    </div>
                  ),
                },
                {
                  key: 'decide',
                  title: '',
                  render: (_, row) =>
                    summary.batch.status === 'READY' && row.status !== 'DUPLICATE' && row.status !== 'ERROR' ? (
                      <Button
                        size="small"
                        type="link"
                        onClick={() => decide.mutate({ id: summary.batch.id, rowId: row.id, include: row.status === 'SKIPPED' })}
                      >
                        {row.status === 'SKIPPED' ? 'Include' : 'Skip'}
                      </Button>
                    ) : null,
                },
              ]}
            />
            <Muted style={{ display: 'block', marginTop: 10 }}>
              Charges are settled when you import: whatever the file stated is kept, and the rest is worked out per order from the statutory rates.
            </Muted>
          </Card>
        )}
      </Col>
    </Row>
  );
}
