'use client';

import { Col, Row, Segmented, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import styled from 'styled-components';
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
  dt {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  dd {
    margin: 4px 0 0;
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    font-size: 26px;
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
        extra={<Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />}
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
          <Panel height={250} title="Spending calendar" extra={<Typography.Text type="secondary">Hover a day</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <SpendingHeatmap days={p?.daily ?? []} currency={currency} />}
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel height={250} title="Weekly rhythm" extra={<Typography.Text type="secondary">Average per day</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <WeekdayRhythm weekdays={p?.weekdays ?? []} currency={currency} />}
          </Panel>
        </Col>
      </Row>

      <Section>
        <span>This month so far</span>
        <small>{p ? dayjs(`${p.month}-01`).format('MMMM YYYY') : ' '}</small>
      </Section>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Panel height={320} title="Spending burn-up" extra={<Typography.Text type="secondary">Cumulative by day</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <BurnUpChart data={p?.burnUp ?? []} currency={currency} height={290} />}
          </Panel>
        </Col>
        <Col xs={24} xl={10}>
          <Panel height={320} title="Where the money went" extra={<Typography.Text type="secondary">Income → left over</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <MonthWaterfall steps={p?.waterfall ?? []} currency={currency} height={290} />}
          </Panel>
        </Col>
      </Row>

      <Section>
        <span>Habits & commitments</span>
        <small>Last 3 months · next 30 days</small>
      </Section>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Panel height={320} title="Purchase sizes" extra={<Typography.Text type="secondary">12 weeks</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <SizeBands bands={p?.sizeBands ?? []} currency={currency} />}
          </Panel>
        </Col>
        <Col xs={24} xl={15}>
          <Panel height={320} title="Merchant map" extra={<Typography.Text type="secondary">Last 3 months</Typography.Text>}>
            {merchants.isPending ? <Skeleton active /> : <MerchantTreemap merchants={merchants.data ?? []} currency={currency} height={290} />}
          </Panel>
        </Col>
        <Col span={24}>
          <Panel height={300} title="Coming up" extra={<Typography.Text type="secondary">Recurring charges, next 30 days</Typography.Text>}>
            {patterns.isPending ? <Skeleton active /> : <UpcomingCharges items={p?.upcoming ?? []} currency={currency} asOf={p?.asOf ?? ''} />}
          </Panel>
        </Col>
      </Row>
    </>
  );
}
