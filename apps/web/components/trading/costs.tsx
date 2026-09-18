'use client';

import { Coins, Receipt, Scissors } from '@phosphor-icons/react';
import { Card, Col, Empty, Row, Skeleton, Table, Tooltip } from 'antd';
import { useTradingMetrics, usePositions, type TradeFilters } from '../../lib/queries';
import type { ChargeBreakdown, TradePosition } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow } from '../planning';
import { Panel } from '../panel';
import { StatCard } from '../stat-card';
import { EdgeBars } from './charts';
import { CHARGE_LABELS, ChargesSourceTag, Muted, NotAdvice, Pnl, SEGMENT_LABELS, num } from './shared';

/**
 * What the trading cost to do. Charges are the part of a result a trader controls most
 * directly and notices least, so they get a screen of their own rather than a column.
 */
export function CostsView({ asOf, filters }: { asOf: string; filters: TradeFilters }) {
  const money = useMoney();
  const metrics = useTradingMetrics(asOf, filters);
  const positions = usePositions(asOf, filters);
  const currency = 'INR';

  if (metrics.isPending || positions.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }
  const data = metrics.data;
  const rows = positions.data?.items ?? [];
  if (!data || rows.length === 0) {
    return (
      <Card>
        <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="No trades to cost yet." />
      </Card>
    );
  }

  const totals = sumCharges(rows);
  const sources = new Set(rows.map((row) => row.charges.source));
  const overallSource = sources.size === 1 ? [...sources][0] : 'MIXED';

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <StatCard
            variant="hero"
            label="Total charges"
            icon={<Receipt size={16} weight="duotone" />}
            value={money(data.totalCharges, currency)}
            hint={`Across ${rows.length} position${rows.length === 1 ? '' : 's'}`}
          />
        </Col>
        <Col xs={12} md={8}>
          <StatCard
            label="Charges of gross profit"
            icon={<Scissors size={17} weight="duotone" />}
            iconTone="warning"
            value={data.chargesPercentOfGross === null ? '—' : `${data.chargesPercentOfGross}%`}
            hint={`${money(data.grossPnl, currency)} gross before them`}
          />
        </Col>
        <Col xs={12} md={8}>
          <StatCard
            label="Net after charges"
            icon={<Coins size={17} weight="duotone" />}
            tone={num(data.netPnl) < 0 ? 'negative' : 'positive'}
            value={money(data.netPnl, currency)}
            hint={<ChargesSourceTag source={overallSource} />}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Panel height={340} title="The breakdown" extra={<Eyebrow>Every component</Eyebrow>}>
            {CHARGE_LABELS.map(([key, label]) => {
              const value = totals[key];
              const share = num(totals.total) === 0 ? 0 : Math.round((value / num(totals.total)) * 100);
              return (
                <div key={key} style={{ padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(value, currency)}</span>
                  </div>
                  <Muted>{share}% of what you paid</Muted>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 600 }}>
              <span>Total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(totals.total, currency)}</span>
            </div>
          </Panel>
        </Col>
        <Col xs={24} lg={14}>
          <Panel height={340} title="Where the charges land" extra={<Eyebrow>Net of charges, by segment</Eyebrow>}>
            <EdgeBars rows={data.bySegment} currency={currency} height={280} />
          </Panel>
        </Col>

        <Col span={24}>
          <Card title="Cost per segment">
            <Table<SegmentCost>
              rowKey="segment"
              dataSource={bySegment(rows)}
              pagination={false}
              size="small"
              columns={[
                { key: 'segment', title: 'Segment', render: (_, row) => SEGMENT_LABELS[row.segment as keyof typeof SEGMENT_LABELS] ?? row.segment },
                { key: 'trades', title: 'Positions', align: 'right', render: (_, row) => row.trades },
                { key: 'turnover', title: 'Turnover', align: 'right', render: (_, row) => money(row.turnover, currency) },
                { key: 'charges', title: 'Charges', align: 'right', render: (_, row) => money(row.charges, currency) },
                {
                  key: 'ratio',
                  title: 'Charges of turnover',
                  align: 'right',
                  render: (_, row) => (
                    <Tooltip title="How much of the money that changed hands went in charges.">
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.turnover === 0 ? '—' : `${((row.charges / row.turnover) * 100).toFixed(3)}%`}</span>
                    </Tooltip>
                  ),
                },
                { key: 'net', title: 'Net P&L', align: 'right', render: (_, row) => <Pnl $value={row.net}>{money(row.net, currency)}</Pnl> },
              ]}
            />
          </Card>
        </Col>
        <Col span={24}>
          <NotAdvice text="Charges are estimated from the statutory rates in force on each trade date and your broker plan, unless the imported file stated them. Each position says which it is. They can differ from a contract note by a few paise, and small levies such as the investor protection fund are not modelled." />
        </Col>
      </Row>
    </>
  );
}

interface SegmentCost {
  segment: string;
  trades: number;
  turnover: number;
  charges: number;
  net: number;
}

function sumCharges(rows: TradePosition[]): Record<keyof ChargeBreakdown, number> & { total: number } {
  const totals = {} as Record<string, number>;
  for (const [key] of CHARGE_LABELS) totals[key] = rows.reduce((sum, row) => sum + num(row.charges[key] as string), 0);
  totals.total = rows.reduce((sum, row) => sum + num(row.charges.total), 0);
  return totals as Record<keyof ChargeBreakdown, number> & { total: number };
}

function bySegment(rows: TradePosition[]): SegmentCost[] {
  const groups = new Map<string, SegmentCost>();
  for (const row of rows) {
    const entry = groups.get(row.segment) ?? { segment: row.segment, trades: 0, turnover: 0, charges: 0, net: 0 };
    entry.trades += 1;
    entry.turnover += num(row.entryValue) + num(row.exitValue);
    entry.charges += num(row.charges.total);
    entry.net += num(row.netPnl);
    groups.set(row.segment, entry);
  }
  return [...groups.values()].sort((a, b) => b.charges - a.charges);
}
