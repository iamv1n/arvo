'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Skeleton, Space, Table, Tabs, Typography } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '../../../../components/page-header';
import { Eyebrow, Stamp } from '../../../../components/planning';
import { HoldingFormModal, HoldingTransactionModal } from '../../../../components/portfolio/holding-form-modal';
import { ASSET_CLASS_LABELS, KIND_LABELS, NotAdvice, ReturnPercent, TRANSACTION_LABELS } from '../../../../components/portfolio/shared';
import { ResultStrip } from '../../../../components/result-strip';
import { StatCard } from '../../../../components/stat-card';
import { api, errorMessage } from '../../../../lib/api';
import { formatDate } from '../../../../lib/format';
import { useHolding, usePortfolioMutation } from '../../../../lib/queries';
import { useMoney } from '../../../../lib/use-money';

/** One holding: its position, every event, the open FIFO lots and what has been realised. */
export default function HoldingPage() {
  const money = useMoney();
  const router = useRouter();
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const detail = useHolding(id);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);

  const removeHolding = usePortfolioMutation(() => api(`/holdings/${id}`, { method: 'DELETE' }));
  const removeTransaction = usePortfolioMutation((transactionId: string) => api(`/holdings/${id}/transactions/${transactionId}`, { method: 'DELETE' }));

  if (detail.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }
  if (!detail.data) {
    return (
      <Card>
        <Empty description="This holding no longer exists.">
          <Link href="/portfolio">Back to the portfolio</Link>
        </Empty>
      </Card>
    );
  }

  const { holding, position, transactions, asOf } = detail.data;
  const currency = holding.currency;

  return (
    <>
      <PageHeader
        title={holding.name}
        subtitle={
          <span>
            {KIND_LABELS[holding.kind]} · {ASSET_CLASS_LABELS[holding.assetClass]}
            {holding.folio ? ` · folio ${holding.folio}` : ''} · valued {formatDate(asOf)}
          </span>
        }
        extra={
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setRecording(true)}>
              Record a transaction
            </Button>
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Popconfirm
              title="Delete this holding?"
              description="Its transactions go with it. This cannot be undone."
              onConfirm={() =>
                removeHolding
                  .mutateAsync(undefined)
                  .then(() => router.push('/portfolio'))
                  .catch((e) => message.error(errorMessage(e)))
              }
            >
              <Button danger icon={<DeleteOutlined />} aria-label="Delete" />
            </Popconfirm>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <StatCard
            variant="hero"
            label="Value"
            value={money(position.value, currency)}
            hint={
              position.valueSource === 'PRICE'
                ? `${Number(position.units).toLocaleString('en-IN', { maximumFractionDigits: 5 })} units at ${money(position.price ?? '0', currency)}`
                : position.valueSource === 'STATED'
                  ? `Stated value${position.priceDate ? ` on ${formatDate(position.priceDate)}` : ''}`
                  : 'No price recorded — shown at cost'
            }
          />
        </Col>
        <Col xs={24} lg={16}>
          {/* Three money figures in quarter-width stat cards clipped on anything narrower than a
              desktop, so the supporting figures read as a ruled strip beside the headline. */}
          <ResultStrip
            items={[
              { label: 'Invested', value: money(position.invested, currency), caveat: `${money(position.withdrawn, currency)} taken out` },
              {
                label: 'Unrealised gain',
                value: money(position.unrealisedGain, currency),
                tone: Number(position.unrealisedGain) < 0 ? 'negative' : 'positive',
                caveat: `Cost basis ${money(position.costBasis, currency)}`,
              },
              {
                label: 'XIRR',
                value: <ReturnPercent value={position.xirrPercent} />,
                caveat: `${money(position.income, currency)} of dividends and interest`,
              },
            ]}
          />
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'transactions',
            label: `Transactions (${transactions.length})`,
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                {transactions.length === 0 ? (
                  <Empty style={{ padding: '48px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="No transactions yet." />
                ) : (
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    dataSource={[...transactions].reverse()}
                    columns={[
                      { key: 'date', title: 'Date', render: (_, row) => formatDate(row.date) },
                      {
                        key: 'type',
                        title: 'Type',
                        render: (_, row) => (
                          <div>
                            <div>{TRANSACTION_LABELS[row.type]}</div>
                            {row.note && <Eyebrow>{row.note}</Eyebrow>}
                          </div>
                        ),
                      },
                      { key: 'units', title: 'Units', align: 'right', render: (_, row) => (row.units ? Number(row.units).toLocaleString('en-IN', { maximumFractionDigits: 5 }) : '—') },
                      { key: 'price', title: 'Price', align: 'right', render: (_, row) => (row.price ? money(row.price, currency) : '—') },
                      { key: 'amount', title: 'Amount', align: 'right', render: (_, row) => money(row.amount, currency) },
                      { key: 'charges', title: 'Charges', align: 'right', render: (_, row) => money(row.charges, currency) },
                      { key: 'source', title: 'Source', render: (_, row) => <Stamp $tone="neutral">{row.externalRef ? 'Imported' : 'Manual'}</Stamp> },
                      {
                        key: 'actions',
                        title: '',
                        align: 'right',
                        render: (_, row) => (
                          <Popconfirm
                            title="Delete this transaction?"
                            onConfirm={() => removeTransaction.mutateAsync(row.id).catch((e) => message.error(errorMessage(e)))}
                          >
                            <Button type="text" size="small" icon={<DeleteOutlined />} aria-label="Delete" />
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'lots',
            label: `Open lots (${position.lots.length})`,
            children: (
              <Card styles={{ body: { padding: position.lots.length === 0 ? undefined : 0 } }}>
                {position.lots.length === 0 ? (
                  <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing held right now." />
                ) : (
                  <Table
                    rowKey={(row) => `${row.date}-${row.units}`}
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    dataSource={position.lots}
                    columns={[
                      { key: 'date', title: 'Bought', render: (_, row) => formatDate(row.date) },
                      { key: 'units', title: 'Units', align: 'right', render: (_, row) => Number(row.units).toLocaleString('en-IN', { maximumFractionDigits: 5 }) },
                      { key: 'cost', title: 'Cost', align: 'right', render: (_, row) => money(row.cost, currency) },
                    ]}
                  />
                )}
                <Typography.Paragraph type="secondary" style={{ margin: 12, fontSize: 12 }}>
                  Sales are matched first-in, first-out, which is what decides the holding period, the lock-in and any exit load.
                </Typography.Paragraph>
              </Card>
            ),
          },
          {
            key: 'realised',
            label: `Realised (${position.realised.length})`,
            children: (
              <Card styles={{ body: { padding: position.realised.length === 0 ? undefined : 0 } }}>
                {position.realised.length === 0 ? (
                  <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing sold yet." />
                ) : (
                  <Table
                    rowKey={(row) => `${row.buyDate}-${row.sellDate}-${row.units}`}
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    dataSource={position.realised}
                    columns={[
                      { key: 'buy', title: 'Bought', render: (_, row) => formatDate(row.buyDate) },
                      { key: 'sell', title: 'Sold', render: (_, row) => formatDate(row.sellDate) },
                      { key: 'held', title: 'Held', align: 'right', render: (_, row) => `${row.heldDays} days` },
                      { key: 'units', title: 'Units', align: 'right', render: (_, row) => Number(row.units).toLocaleString('en-IN', { maximumFractionDigits: 5 }) },
                      { key: 'cost', title: 'Cost', align: 'right', render: (_, row) => money(row.cost, currency) },
                      { key: 'proceeds', title: 'Proceeds', align: 'right', render: (_, row) => money(row.proceeds, currency) },
                      { key: 'gain', title: 'Gain', align: 'right', render: (_, row) => money(row.gain, currency) },
                    ]}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'details',
            label: 'Details',
            children: (
              <Card>
                <Descriptions column={{ xs: 1, md: 2, xl: 3 }} size="small" bordered>
                  <Descriptions.Item label="ISIN">{holding.isin ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Scheme code">{holding.schemeCode ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Symbol">{holding.symbol ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Folio">{holding.folio ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="AMC">{holding.amc ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Sector">{holding.sector ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Market cap">{holding.marketCap ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Plan">{holding.plan ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Expense ratio">{holding.expenseRatio ? `${Number(holding.expenseRatio)}%` : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Direct plan ratio">{holding.directExpenseRatio ? `${Number(holding.directExpenseRatio)}%` : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Exit load window">{holding.exitLoadDays ? `${holding.exitLoadDays} days` : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Lock-in">{holding.lockInMonths ? `${holding.lockInMonths} months` : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Notes" span={3}>
                    {holding.notes ?? '—'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
        ]}
      />

      {position.warnings.length > 0 && <NotAdvice text={position.warnings.join(' ')} storageKey="arvo.portfolio.holding.notice" style={{ marginTop: 16 }} />}

      <HoldingFormModal open={editing} holding={holding} onClose={() => setEditing(false)} />
      <HoldingTransactionModal open={recording} holdingId={holding.id} kind={holding.kind} onClose={() => setRecording(false)} />
    </>
  );
}
