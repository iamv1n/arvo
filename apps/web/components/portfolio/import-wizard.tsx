'use client';

import { InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Empty, Row, Select, Skeleton, Space, Table, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { useState } from 'react';
import { api, apiUpload, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useHoldings, usePortfolioImport, usePortfolioImports, usePortfolioMutation } from '../../lib/queries';
import type { PortfolioImportRow, PortfolioImportSource, PortfolioImportSummary } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, Stamp, type StampTone } from '../planning';
import { TRANSACTION_LABELS } from './shared';

const SOURCE_LABELS: Record<PortfolioImportSource, string> = {
  CAS_PDF: 'CAS statement',
  BROKER_CSV: 'Broker CSV',
  AMFI_NAV: 'AMFI NAV file',
  BENCHMARK_CSV: 'Index series',
  FUND_DISCLOSURE_CSV: 'Fund disclosure',
};

const ROW_TONES: Record<PortfolioImportRow['status'], StampTone> = {
  NEW: 'positive',
  DUPLICATE: 'neutral',
  ERROR: 'negative',
  COMMITTED: 'positive',
  SKIPPED: 'neutral',
};

/**
 * Upload → review → commit, the same shape as the statement importer. Reference files (a NAV
 * list, an index series, a fund's disclosure) have nothing to review, so they apply on upload
 * and say what they changed.
 */
export function PortfolioImportWizard() {
  const money = useMoney();
  const { message } = App.useApp();
  const batches = usePortfolioImports();
  const holdings = useHoldings();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [source, setSource] = useState<PortfolioImportSource | undefined>();
  const [holdingId, setHoldingId] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const active = usePortfolioImport(activeId);

  const invalidate = usePortfolioMutation(async () => undefined);
  const commit = usePortfolioMutation((id: string) => api<PortfolioImportSummary>(`/portfolio/imports/${id}/commit`, { method: 'POST' }));
  const decide = usePortfolioMutation(({ id, rowId, status }: { id: string; rowId: string; status: 'NEW' | 'SKIPPED' }) =>
    api(`/portfolio/imports/${id}/rows/${rowId}`, { method: 'PATCH', body: { status } }),
  );
  const remove = usePortfolioMutation((id: string) => api(`/portfolio/imports/${id}`, { method: 'DELETE' }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      if (source) body.append('source', source);
      if (holdingId) body.append('holdingId', holdingId);
      const payload = await apiUpload<PortfolioImportSummary>('/portfolio/imports', body);
      await invalidate.mutateAsync(undefined);
      setActiveId(payload.batch.id);
      message.success(
        payload.batch.status === 'COMMITTED'
          ? `${SOURCE_LABELS[payload.batch.source]} applied`
          : `${payload.counts.new} row${payload.counts.new === 1 ? '' : 's'} ready to review`,
      );
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
        <Card title="Upload a file" styles={{ body: { minHeight: 300 } }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Eyebrow>File type</Eyebrow>
              <Select
                allowClear
                style={{ width: '100%', marginTop: 4 }}
                placeholder="Detect from the file"
                value={source}
                onChange={setSource}
                options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
            {source === 'FUND_DISCLOSURE_CSV' && (
              <div>
                <Eyebrow>Which fund it describes</Eyebrow>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  showSearch
                  optionFilterProp="label"
                  popupMatchSelectWidth={false}
                  placeholder="Pick the fund"
                  value={holdingId}
                  onChange={setHoldingId}
                  loading={holdings.isPending}
                  options={(holdings.data ?? []).filter((h) => h.kind === 'MUTUAL_FUND' || h.kind === 'ETF').map((h) => ({ value: h.id, label: h.name }))}
                />
              </div>
            )}
            <Upload.Dragger
              accept=".pdf,.csv,.txt"
              maxCount={1}
              showUploadList={false}
              disabled={uploading}
              beforeUpload={(file: UploadFile & File) => {
                void upload(file);
                return false;
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Drop a file here, or click to choose</p>
              <p className="ant-upload-hint">Up to 15 MB</p>
            </Upload.Dragger>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
              <strong>CAMS/KFintech CAS</strong> — the detailed statement as a PDF. If yours is password-protected, open it, save an unlocked copy and upload
              that. Scanned statements are not readable.
              <br />
              <strong>Broker CSV</strong> — Zerodha Console holdings or tradebook, Groww, Upstox or Angel One exports.
              <br />
              <strong>AMFI NAVAll.txt</strong> — prices every fund that has a scheme code.
              <br />
              <strong>Index CSV</strong> — a Nifty 50 or Nifty 500 TRI series with Date and Close columns.
              <br />
              <strong>Fund disclosure CSV</strong> — a fund&apos;s monthly portfolio, for overlap.
            </Typography.Paragraph>
          </Space>
        </Card>

        <Card title="Recent imports" style={{ marginTop: 16 }} styles={{ body: { padding: 0, maxHeight: 320, overflowY: 'auto' } }} loading={batches.isPending}>
          {(batches.data ?? []).length === 0 ? (
            <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing imported yet" />
          ) : (
            <Table
              rowKey="id"
              size="small"
              showHeader={false}
              pagination={false}
              dataSource={batches.data}
              onRow={(row) => ({ onClick: () => setActiveId(row.id), style: { cursor: 'pointer' } })}
              columns={[
                {
                  key: 'file',
                  render: (_, row) => (
                    <div>
                      <div>{row.filename}</div>
                      <Eyebrow>
                        {SOURCE_LABELS[row.source]} · {formatDate(row.createdAt.slice(0, 10))}
                      </Eyebrow>
                    </div>
                  ),
                },
                {
                  key: 'status',
                  align: 'right',
                  render: (_, row) => (
                    <Stamp $tone={row.status === 'COMMITTED' ? 'positive' : row.status === 'FAILED' ? 'negative' : 'warning'}>{row.status}</Stamp>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </Col>

      <Col xs={24} lg={15}>
        <Card
          title={summary ? summary.batch.filename : 'Review'}
          styles={{ body: { minHeight: 420, padding: summary && summary.rows.length > 0 ? 0 : undefined } }}
          extra={
            summary && (
              <Space>
                <Button danger onClick={() => remove.mutateAsync(summary.batch.id).then(() => setActiveId(null))}>
                  Discard
                </Button>
                {summary.counts.new > 0 && (
                  <Button
                    type="primary"
                    loading={commit.isPending}
                    onClick={() =>
                      commit
                        .mutateAsync(summary.batch.id)
                        .then(() => message.success('Added to your holdings'))
                        .catch((e) => message.error(errorMessage(e)))
                    }
                  >
                    Import {summary.counts.new} row{summary.counts.new === 1 ? '' : 's'}
                  </Button>
                )}
              </Space>
            )
          }
        >
          {active.isPending && activeId ? (
            <Skeleton active />
          ) : !summary ? (
            <Empty style={{ padding: '80px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Upload a file, or pick a recent import to review it." />
          ) : (
            <>
              {summary.batch.warnings.map((warning) => (
                <Alert key={warning} type="info" showIcon message={warning} style={{ margin: 12 }} />
              ))}
              {summary.batch.error && <Alert type="error" showIcon message={summary.batch.error} style={{ margin: 12 }} />}
              {summary.rows.length === 0 ? (
                <Empty
                  style={{ padding: '48px 0' }}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={summary.applied > 0 ? `${summary.applied} record${summary.applied === 1 ? '' : 's'} applied. Nothing to review.` : 'Nothing to review.'}
                />
              ) : (
                <Table<PortfolioImportRow>
                  rowKey="id"
                  size="small"
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 25, size: 'small' }}
                  dataSource={summary.rows}
                  columns={[
                    {
                      key: 'instrument',
                      title: 'Instrument',
                      render: (_, row) => (
                        <div style={{ maxWidth: 260 }}>
                          <div>{row.parsed.instrumentName}</div>
                          <Eyebrow>{[row.parsed.isin, row.parsed.folio, row.parsed.symbol].filter(Boolean).join(' · ') || '—'}</Eyebrow>
                        </div>
                      ),
                    },
                    { key: 'date', title: 'Date', render: (_, row) => formatDate(row.parsed.date) },
                    { key: 'type', title: 'Type', render: (_, row) => TRANSACTION_LABELS[row.parsed.type] },
                    {
                      key: 'units',
                      title: 'Units',
                      align: 'right',
                      render: (_, row) => (row.parsed.units ? Number(row.parsed.units).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'),
                    },
                    { key: 'amount', title: 'Amount', align: 'right', render: (_, row) => money(row.parsed.amount) },
                    {
                      key: 'status',
                      title: 'Status',
                      render: (_, row) => (
                        <div>
                          <Stamp $tone={ROW_TONES[row.status]}>{row.status}</Stamp>
                          {row.message && (
                            <div style={{ maxWidth: 220, whiteSpace: 'normal' }}>
                              <Eyebrow>{row.message}</Eyebrow>
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'actions',
                      title: '',
                      align: 'right',
                      render: (_, row) =>
                        row.status === 'COMMITTED' ? null : (
                          <Button
                            size="small"
                            type="link"
                            onClick={() =>
                              decide
                                .mutateAsync({ id: summary.batch.id, rowId: row.id, status: row.status === 'SKIPPED' ? 'NEW' : 'SKIPPED' })
                                .catch((e) => message.error(errorMessage(e)))
                            }
                          >
                            {row.status === 'SKIPPED' ? 'Bring back' : 'Skip'}
                          </Button>
                        ),
                    },
                  ]}
                />
              )}
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}
