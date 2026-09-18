'use client';

import { ChartLineDown, Coins, Scales, Target } from '@phosphor-icons/react';
import { Card, Col, Empty, Row, Skeleton, Tooltip } from 'antd';
import { DataTable, useTableColumns } from '../data-table';
import { Eyebrow, Figure } from '../planning';
import { Panel } from '../panel';
import { StatCard } from '../stat-card';
import { useTradingMetrics, type TradeFilters } from '../../lib/queries';
import type { TradingBreakdownRow } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { EdgeBars, EquityCurve } from './charts';
import { NotAdvice, Pnl, STYLE_LABELS, num } from './shared';

/**
 * The one screen that answers "how is this going?": what the trading actually made after every
 * charge, how that money arrived over time, and where the edge sits.
 */
export function TradingOverview({ asOf, filters }: { asOf: string; filters: TradeFilters }) {
  const money = useMoney();
  const query = useTradingMetrics(asOf, filters);
  const data = query.data;
  const currency = 'INR';

  const edgeColumns = useTableColumns<TradingBreakdownRow>('trading-edge', [
    { key: 'label', title: 'Bucket', alwaysVisible: true, render: (_, row) => row.label },
    { key: 'trades', title: 'Trades', align: 'right', render: (_, row) => row.trades },
    { key: 'winRate', title: 'Win rate', align: 'right', render: (_, row) => (row.winRate === null ? '—' : `${row.winRate}%`) },
    { key: 'charges', title: 'Charges', align: 'right', render: (_, row) => money(row.charges, currency) },
    {
      key: 'netPnl',
      title: 'Net P&L',
      align: 'right',
      render: (_, row) => <Pnl $value={num(row.netPnl)}>{money(row.netPnl, currency)}</Pnl>,
    },
    { key: 'average', title: 'Per trade', align: 'right', render: (_, row) => <Pnl $value={num(row.average)}>{money(row.average, currency)}</Pnl> },
  ]);

  if (query.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }
  if (!data || (data.closedTrades === 0 && data.openTrades === 0)) {
    return (
      <Card>
        <Empty
          style={{ padding: '32px 0' }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No trades yet. Import a tradebook from your broker, or add a fill by hand."
        />
      </Card>
    );
  }

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <StatCard
            variant="hero"
            label="Net P&L after charges"
            icon={<Coins size={16} weight="duotone" />}
            value={money(data.netPnl, currency)}
            hint={`${money(data.grossPnl, currency)} gross, less ${money(data.totalCharges, currency)} in charges`}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label="Win rate"
            icon={<Target size={17} weight="duotone" />}
            iconTone="info"
            value={data.winRate === null ? '—' : `${data.winRate}%`}
            hint={`${data.wins} won · ${data.losses} lost${data.scratches > 0 ? ` · ${data.scratches} flat` : ''}`}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label="Expectancy"
            icon={<Scales size={17} weight="duotone" />}
            tone={num(data.expectancy) < 0 ? 'negative' : 'positive'}
            value={money(data.expectancy, currency)}
            hint={
              <Tooltip title="Average result per closed round trip, after charges.">
                <span>per trade, {data.closedTrades} closed</span>
              </Tooltip>
            }
          />
        </Col>
        <Col xs={24} md={6}>
          <StatCard
            label="Max drawdown"
            icon={<ChartLineDown size={17} weight="duotone" />}
            iconTone="warning"
            tone={num(data.maxDrawdown) < 0 ? 'negative' : undefined}
            value={money(data.maxDrawdown, currency)}
            hint={data.maxDrawdownPercent === null ? 'Peak to trough of realised money' : `${data.maxDrawdownPercent}% below the peak`}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Panel scroll={false} height={260} title="Realised equity curve" extra={<Eyebrow>Cumulative net P&amp;L by close date</Eyebrow>}>
            <EquityCurve data={data.equityCurve} currency={currency} height={236} />
          </Panel>
        </Col>
        <Col xs={24} lg={8}>
          <Panel height={260} title="The shape of it">
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Stat label="Average win" value={money(data.averageWin, currency)} tone={1} />
              </Col>
              <Col span={12}>
                <Stat label="Average loss" value={money(data.averageLoss, currency)} tone={-1} />
              </Col>
              <Col span={12}>
                <Stat label="Profit factor" value={data.profitFactor === null ? '—' : data.profitFactor.toFixed(2)} tone={0} />
              </Col>
              <Col span={12}>
                <Stat label="Charges of gross profit" value={data.chargesPercentOfGross === null ? '—' : `${data.chargesPercentOfGross}%`} tone={0} />
              </Col>
              <Col span={12}>
                <Stat label="Longest losing streak" value={`${data.longestLosingStreak}`} tone={0} />
              </Col>
              <Col span={12}>
                <Stat label="Average R" value={data.averageR === null ? 'No stops recorded' : `${data.averageR}R`} tone={0} />
              </Col>
              <Col span={24}>
                <Eyebrow>Holding time</Eyebrow>
                <div style={{ marginTop: 6 }}>
                  {data.holdingTime
                    .filter((row) => row.trades > 0)
                    .map((row) => (
                      <div key={row.style} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span>{STYLE_LABELS[row.style]}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {row.trades} · <Pnl $value={num(row.netPnl)}>{money(row.netPnl, currency, { compact: true })}</Pnl>
                        </span>
                      </div>
                    ))}
                </div>
              </Col>
            </Row>
          </Panel>
        </Col>

        <Col xs={24} lg={12}>
          <Panel scroll={false} height={216} title="Edge by segment" extra={<Eyebrow>Net of charges</Eyebrow>}>
            <EdgeBars rows={data.bySegment} currency={currency} height={240} />
          </Panel>
        </Col>
        <Col xs={24} lg={12}>
          <Panel scroll={false} height={216} title="Edge by time of day" extra={<Eyebrow>By entry hour</Eyebrow>}>
            <EdgeBars rows={data.byTimeOfDay} currency={currency} height={240} />
          </Panel>
        </Col>
        <Col xs={24} lg={12}>
          <Panel scroll={false} height={216} title="Edge by weekday">
            <EdgeBars rows={data.byWeekday} currency={currency} height={240} />
          </Panel>
        </Col>
        <Col xs={24} lg={12}>
          <Panel scroll={false} height={216} title="Edge by setup tag" extra={<Eyebrow>From your journal</Eyebrow>}>
            <EdgeBars rows={data.bySetup} currency={currency} height={240} />
          </Panel>
        </Col>

        <Col span={24}>
          <Card title="By instrument" extra={edgeColumns.settings}>
            <DataTable<TradingBreakdownRow>
              rowKey="key"
              dataSource={[...data.byInstrument].sort((a, b) => num(b.netPnl) - num(a.netPnl))}
              columns={edgeColumns.columns}
              pagination={false}
            />
          </Card>
        </Col>
        <Col span={24}>
          <NotAdvice text="Everything above describes trades you have already closed. Past results are not a forecast, and nothing here is a suggestion to place a trade." />
        </Col>
      </Row>
    </>
  );
}

/** A label-and-number pair in the editorial figure face. tone colours it by sign. */
function Stat({ label, value, tone }: { label: string; value: string; tone: number }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ marginTop: 2 }}>
        <Figure $size={20}>{tone === 0 ? value : <Pnl $value={tone}>{value}</Pnl>}</Figure>
      </div>
    </div>
  );
}
