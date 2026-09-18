'use client';

import { Col, Row, Segmented, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { ExpandableChart } from '../../../components/expandable-chart';
import { Highlights } from '../../../components/highlights';
import {
  BurnUpChart,
  MerchantTreemap,
  MonthWaterfall,
  SizeBands,
  SpendingHeatmap,
  UpcomingCharges,
  WeekdayRhythm,
} from '../../../components/insights-charts';
import { OverviewStats } from '../../../components/overview-stats';
import { PageHeader } from '../../../components/page-header';
import { Panel } from '../../../components/panel';
import { useAuth } from '../../../lib/auth';
import { PERIOD_OPTIONS, periodRange, type PeriodKey } from '../../../lib/periods';
import { usePreferences } from '../../../lib/preferences';
import { useHighlights, useMerchantSpend, usePatterns } from '../../../lib/queries';
import { useMoney } from '../../../lib/use-money';

const Section = styled.h2`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]}px;
  margin: ${({ theme }) => theme.space[8]}px 0 ${({ theme }) => theme.space[4]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 26px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  letter-spacing: -0.01em;

  small {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Facts = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0;
  margin: 0 0 ${({ theme }) => theme.space[4]}px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  div {
    padding: ${({ theme }) => theme.space[4]}px ${({ theme }) => theme.space[4]}px;
  }
  div + div {
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-template-columns: 1fr 1fr;
    div:nth-child(odd) {
      border-left: none;
    }
    div:nth-child(n + 3) {
      border-top: 1px solid ${({ theme }) => theme.colors.border};
    }
  }
  dt {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  dd {
    margin: 4px 0 0;
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    /* Compact money still runs long ("12 Mar · ₹1.2L"); it wraps instead of widening the cell. */
    font-size: clamp(20px, 2.2vw, 26px);
    overflow-wrap: anywhere;
    letter-spacing: -0.01em;
  }
`;

export default function InsightsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'INR';
  const money = useMoney();
  const { preferences } = usePreferences();
  const [period, setPeriod] = useState<PeriodKey>(preferences.defaultPeriod);
  const range = useMemo(() => periodRange(period), [period]);
  const highlights = useHighlights();
  const patterns = usePatterns();
  const merchantPeriod = useMemo(() => periodRange('last-3-months'), []);
  const merchants = useMerchantSpend(merchantPeriod);
  const p = patterns.data;

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Patterns in how you spend, computed exactly from your transactions."
        extra={<Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} style={{ maxWidth: '100%', overflowX: 'auto' }} />}
      />

      <OverviewStats period={range} currency={currency} />

      <Section>
        <span>This month, in numbers</span>
        <small>{highlights.data ? `As of ${dayjs(highlights.data.asOf).format('D MMM YYYY')}` : ' '}</small>
      </Section>
      <Highlights items={highlights.data?.highlights} loading={highlights.isPending} currency={currency} />

      <Section>
        <span>The last 12 weeks</span>
        <small>{p ? `${p.totals.transactions} purchases · ${money(p.totals.averagePerDay, currency)} a day` : ' '}</small>
      </Section>
      {p && (
        <Facts>
          <div>
            <dt>Spent</dt>
            <dd>{money(p.totals.spent, currency, { compact: true })}</dd>
          </div>
          <div>
            <dt>Per day</dt>
            <dd>{money(p.totals.averagePerDay, currency)}</dd>
          </div>
          <div>
            <dt>Purchases</dt>
            <dd>{p.totals.transactions}</dd>
          </div>
          <div>
            <dt>Busiest day</dt>
            <dd>{p.totals.busiestDay ? `${dayjs(p.totals.busiestDay.date).format('D MMM')} · ${money(p.totals.busiestDay.spent, currency, { compact: true })}` : '—'}</dd>
          </div>
        </Facts>
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Panel scroll={false} height={232} title="Spending calendar" extra={<Typography.Text type="secondary">Hover a day</Typography.Text>}>
            {patterns.isPending ? (
              <Skeleton active />
            ) : (
              <ExpandableChart
                title="Spending calendar"
                height={184}
                caption="Each square is a day; darker squares are heavier spending days. Hover a day for the total."
                render={(_h, expanded) => <SpendingHeatmap days={p?.daily ?? []} currency={currency} cellSize={expanded ? 26 : 13} />}
              />
            )}
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel scroll={false} height={232} title="Weekly rhythm" extra={<Typography.Text type="secondary">Average per day</Typography.Text>}>
            {patterns.isPending ? (
              <Skeleton active />
            ) : (
              <ExpandableChart
                title="Weekly rhythm"
                height={184}
                caption="Average spending on each weekday over the last twelve weeks. The highlighted column is the heaviest day."
                render={(h) => <WeekdayRhythm weekdays={p?.weekdays ?? []} currency={currency} height={h} />}
              />
            )}
          </Panel>
        </Col>
      </Row>

      <Section>
        <span>This month so far</span>
        <small>{p ? dayjs(`${p.month}-01`).format('MMMM YYYY') : ' '}</small>
      </Section>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Panel scroll={false} height={268} title="Spending burn-up" extra={<Typography.Text type="secondary">Cumulative by day</Typography.Text>}>
            {patterns.isPending ? (
              <Skeleton active />
            ) : (
              <ExpandableChart
                title="Spending burn-up"
                height={220}
                caption="Cumulative spending by day of month: this month against last month and the three-month average."
                render={(h) => <BurnUpChart data={p?.burnUp ?? []} currency={currency} height={h} />}
              />
            )}
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel scroll={false} height={268} title="Where the money went" extra={<Typography.Text type="secondary">Income → left over</Typography.Text>}>
            {patterns.isPending ? (
              <Skeleton active />
            ) : (
              <ExpandableChart
                title="Where the money went"
                height={220}
                caption="Income steps down through each category to what is left over this month."
                render={(h) => <MonthWaterfall steps={p?.waterfall ?? []} currency={currency} height={h} />}
              />
            )}
          </Panel>
        </Col>
      </Row>

      <Section>
        <span>Habits & commitments</span>
        <small>Last 3 months · next 30 days</small>
      </Section>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Panel height={268} title="Purchase sizes" extra={<Typography.Text type="secondary">12 weeks</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <SizeBands bands={p?.sizeBands ?? []} currency={currency} />}
          </Panel>
        </Col>
        <Col xs={24} xl={15}>
          <Panel scroll={false} height={268} title="Merchant map" extra={<Typography.Text type="secondary">Last 3 months</Typography.Text>}>
            {merchants.isPending ? (
              <Skeleton active />
            ) : (
              <ExpandableChart
                title="Merchant map"
                height={220}
                caption="Area is spending per merchant over the last three months."
                render={(h) => <MerchantTreemap merchants={merchants.data ?? []} currency={currency} height={h} />}
              />
            )}
          </Panel>
        </Col>
        <Col span={24}>
          <Panel height={248} title="Coming up" extra={<Typography.Text type="secondary">Recurring charges, next 30 days</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <UpcomingCharges items={p?.upcoming ?? []} currency={currency} asOf={p?.asOf ?? ''} />}
          </Panel>
        </Col>
      </Row>
    </>
  );
}
