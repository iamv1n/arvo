'use client';

import { Alert, Button, Card, Col, Empty, InputNumber, Row, Skeleton, Slider, Space, Table, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { usePortfolioAllocation } from '../../lib/queries';
import type { AssetClass, RebalanceResult } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, Stamp } from '../planning';
import { ASSET_CLASS_LABELS, NotAdvice } from './shared';

const CLASSES: AssetClass[] = ['EQUITY', 'DEBT', 'GOLD', 'REAL_ESTATE', 'CASH', 'OTHER'];

/**
 * Target sliders in, minimum trades out. The percentages must add up to 100 before the
 * server will do the arithmetic, which is also the point at which the answer means anything.
 */
export function RebalanceTool({ asOf }: { asOf?: string }) {
  const money = useMoney();
  const allocation = usePortfolioAllocation(asOf);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [result, setResult] = useState<RebalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const present = useMemo(() => {
    const held = new Set((allocation.data?.assetClass ?? []).map((slice) => slice.key as AssetClass));
    return CLASSES.filter((assetClass) => held.has(assetClass) || (targets[assetClass] ?? 0) > 0);
  }, [allocation.data, targets]);

  // Start from where the portfolio already is, so the first move the user makes is a decision
  // rather than a set-up chore.
  useEffect(() => {
    if (!allocation.data || Object.keys(targets).length > 0) return;
    const start: Record<string, number> = {};
    for (const slice of allocation.data.assetClass) start[slice.key] = Math.round(slice.percent);
    const total = Object.values(start).reduce((sum, value) => sum + value, 0);
    const first = Object.keys(start)[0];
    if (first && total !== 100) start[first] += 100 - total;
    setTargets(start);
  }, [allocation.data, targets]);

  const total = Object.values(targets).reduce((sum, value) => sum + value, 0);
  const currency = allocation.data?.currency ?? 'INR';

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      setResult(
        await api<RebalanceResult>('/portfolio/rebalance', {
          method: 'POST',
          body: { asOf, targets: Object.entries(targets).map(([assetClass, percent]) => ({ assetClass, percent: String(percent) })) },
        }),
      );
    } catch (e) {
      setResult(null);
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  if (allocation.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }
  if (!allocation.data || allocation.data.holdings.length === 0) {
    return (
      <Card>
        <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Add holdings before setting a target allocation." />
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card title="Target allocation">
          {present.map((assetClass) => {
            const current = allocation.data!.assetClass.find((slice) => slice.key === assetClass)?.percent ?? 0;
            return (
              <div key={assetClass} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <Typography.Text strong>{ASSET_CLASS_LABELS[assetClass]}</Typography.Text>
                  <Space>
                    <Eyebrow>now {current}%</Eyebrow>
                    <InputNumber
                      size="small"
                      min={0}
                      max={100}
                      value={targets[assetClass] ?? 0}
                      onChange={(value) => setTargets({ ...targets, [assetClass]: value ?? 0 })}
                      suffix="%"
                      style={{ width: 84 }}
                    />
                  </Space>
                </div>
                <Slider min={0} max={100} value={targets[assetClass] ?? 0} onChange={(value) => setTargets({ ...targets, [assetClass]: value })} />
              </div>
            );
          })}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <Stamp $tone={total === 100 ? 'positive' : 'warning'}>{total}% allocated</Stamp>
            <Button type="primary" disabled={total !== 100} loading={pending} onClick={() => void run()}>
              Work out the trades
            </Button>
          </div>
          {total !== 100 && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              The target has to add up to 100% before the trades mean anything.
            </Typography.Text>
          )}
        </Card>
      </Col>

      <Col xs={24} lg={14}>
        <Card title="Trades to get there" styles={{ body: { minHeight: 240 } }}>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
          {!result ? (
            <Empty
              style={{ padding: '48px 0' }}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Set a target and Arvo will work out the smallest set of moves, with the tax a sale would realise."
            />
          ) : (
            <>
              <Table
                rowKey="assetClass"
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
                style={{ marginBottom: 16 }}
                dataSource={result.classes}
                columns={[
                  { key: 'class', title: 'Class', render: (_, row) => ASSET_CLASS_LABELS[row.assetClass] },
                  { key: 'now', title: 'Now', align: 'right', render: (_, row) => `${row.currentPercent}%` },
                  { key: 'target', title: 'Target', align: 'right', render: (_, row) => `${row.targetPercent}%` },
                  {
                    key: 'difference',
                    title: 'Move',
                    align: 'right',
                    render: (_, row) =>
                      row.withinBand ? <Eyebrow>within band</Eyebrow> : `${Number(row.difference) > 0 ? '+' : '−'}${money(Math.abs(Number(row.difference)), currency)}`,
                  },
                ]}
              />
              {result.trades.length === 0 ? (
                <Alert type="success" showIcon message={`Nothing to do — every class is inside the ${result.driftBandPercent}% drift band.`} />
              ) : (
                <Table
                  rowKey={(row) => `${row.holdingId}-${row.action}`}
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  dataSource={result.trades}
                  expandable={{
                    rowExpandable: (row) => row.warnings.length > 0,
                    expandedRowRender: (row) => (
                      <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                        {row.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ),
                  }}
                  columns={[
                    { key: 'action', title: '', render: (_, row) => <Stamp $tone={row.action === 'SELL' ? 'warning' : 'positive'}>{row.action}</Stamp> },
                    { key: 'name', title: 'Holding', dataIndex: 'holdingName' },
                    { key: 'amount', title: 'Amount', align: 'right', render: (_, row) => money(row.amount, currency) },
                    { key: 'units', title: 'Units', align: 'right', render: (_, row) => (row.units ? Number(row.units).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—') },
                    { key: 'tax', title: 'Est. tax', align: 'right', render: (_, row) => money(row.estimatedTax, currency) },
                  ]}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={4}>
                        Estimated tax on the whole move
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        {money(result.estimatedTaxTotal, currency)}
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              )}
              {result.warnings.map((warning) => (
                <Alert key={warning} type="warning" showIcon message={warning} style={{ marginTop: 12 }} />
              ))}
              <NotAdvice text={result.disclaimer} style={{ marginTop: 16 }} />
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}
