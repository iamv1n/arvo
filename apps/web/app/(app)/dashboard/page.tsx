'use client';

import { Alert, Col, Empty, Flex, Progress, Row, Segmented, Skeleton, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { Amount } from '../../../components/amount';
import { BriefingCard } from '../../../components/advisor/briefing-card';
import { Highlights } from '../../../components/highlights';
import { OverviewStats } from '../../../components/overview-stats';
import { CategoryDonut, categoryColors, IncomeExpenseChart } from '../../../components/charts';
import { PageHeader } from '../../../components/page-header';
import { Panel } from '../../../components/panel';
import { RowList } from '../../../components/row-list';
import { CoolOffBanner } from '../../../components/cool-off-banner';
import { UploadReminderBanner } from '../../../components/upload-reminder-banner';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/format';
import { PERIOD_OPTIONS, periodRange, type PeriodKey } from '../../../lib/periods';
import { usePreferences } from '../../../lib/preferences';
import { useAccounts, useCategories, useHighlights, useMonthly, useSummary, useTransactions } from '../../../lib/queries';
import { useMoney } from '../../../lib/use-money';

/** Fixed body heights keep rows aligned regardless of how much data a card holds. */
const CHART_HEIGHT = 300;
const LIST_HEIGHT = 340;

const SectionTitle = styled.h2`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]}px;
  margin: ${({ theme }) => theme.space[4]}px 0 ${({ theme }) => theme.space[3]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 24px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  letter-spacing: -0.01em;

  small {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const CategoryRow = styled.div`
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  column-gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => theme.space[1]}px 0;

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .bar {
    grid-column: 2 / 4;
  }
`;

export default function DashboardPage() {
  const { user } = useAuth();
  const theme = useTheme();
  const money = useMoney();
  const { preferences, ready } = usePreferences();
  const currency = user?.currency ?? 'INR';
  const [period, setPeriod] = useState<PeriodKey>(preferences.defaultPeriod);
  useEffect(() => {
    if (ready) setPeriod(preferences.defaultPeriod);
  }, [ready, preferences.defaultPeriod]);

  const range = useMemo(() => periodRange(period), [period]);
  const trendRange = useMemo(() => periodRange('last-6-months'), []);
  const summary = useSummary(range);
  const monthly = useMonthly(trendRange);
  const accounts = useAccounts();
  const categories = useCategories();
  const recent = useTransactions({ limit: 12 });
  const highlights = useHighlights();

  const categoryName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);

  const s = summary.data;
  const topSpend = s?.spendingByTopCategory ?? [];
  const maxSpend = Math.max(1, ...topSpend.map((c) => Number(c.amount)));
  const palette = categoryColors(theme);
  const firstName = user?.name.split(' ')[0];
  const compact = (v: string | number) => money(v, currency, { compact: true });

  return (
    <>
      <PageHeader
        title={`Hello${firstName ? `, ${firstName}` : ''}`}
        subtitle={s ? `${formatDate(s.from)} – ${formatDate(s.to)}` : 'Your financial picture'}
        extra={<Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />}
      />

      <CoolOffBanner />
      <UploadReminderBanner />

      {accounts.data?.length === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
          title="Start by adding an account"
          description={<>Create a bank, card or cash account on the <Link href="/accounts">Accounts</Link> page, or import a statement.</>}
        />
      )}

      <OverviewStats period={range} currency={currency} />

      <Row gutter={[16, 16]} align="stretch" style={{ marginTop: 16 }}>
        {s && s.unclassified.transactionCount > 0 && (
          <Col span={24}>
            <Alert
              type="warning"
              showIcon
              title={`${s.unclassified.transactionCount} ${s.unclassified.transactionCount === 1 ? 'transaction has' : 'transactions have'} type Unknown and ${s.unclassified.transactionCount === 1 ? 'is' : 'are'} not counted`}
              action={<Link href="/transactions?type=UNKNOWN">Review</Link>}
            />
          </Col>
        )}

        <Col span={24}>
          <SectionTitle>
            <span>This month, in numbers</span>
            <Link href="/insights">See all insights →</Link>
          </SectionTitle>
          <Highlights items={highlights.data?.highlights} loading={highlights.isPending} currency={currency} limit={3} />
        </Col>

        <Col xs={24} xl={15}>
          <Panel height={CHART_HEIGHT} title="Income vs expenses" extra={<Typography.Text type="secondary">Last 6 months</Typography.Text>}>
            {monthly.isPending ? <Skeleton active paragraph={{ rows: 6 }} /> : <IncomeExpenseChart data={monthly.data ?? []} currency={currency} height={CHART_HEIGHT - 48} />}
          </Panel>
        </Col>

        <Col xs={24} xl={9}>
          <Panel height={CHART_HEIGHT} title="Spending by category" extra={<Link href="/analytics">Details</Link>}>
            {summary.isPending ? (
              <Skeleton active />
            ) : topSpend.length === 0 ? (
              <Empty description="No spending in this period" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Flex gap={16} align="center" style={{ height: '100%' }}>
                <div style={{ width: 150, flexShrink: 0 }}>
                  <CategoryDonut data={topSpend} currency={currency} size={150} />
                </div>
                <div style={{ flex: 1, minWidth: 0, maxHeight: '100%', overflowY: 'auto', paddingRight: 4 }}>
                  {topSpend.slice(0, 8).map((c, i) => (
                    <CategoryRow key={c.categoryId ?? 'none'}>
                      <span className="dot" style={{ background: palette[i % palette.length] }} />
                      <Typography.Text ellipsis>{c.name}</Typography.Text>
                      <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {compact(c.amount)}
                      </Typography.Text>
                      <Progress
                        className="bar"
                        percent={(Number(c.amount) / maxSpend) * 100}
                        showInfo={false}
                        strokeColor={palette[i % palette.length]}
                        size={{ height: 4 }}
                      />
                    </CategoryRow>
                  ))}
                </div>
              </Flex>
            )}
          </Panel>
        </Col>

        <Col xs={24} lg={12} xl={8}>
          <BriefingCard height={LIST_HEIGHT} compact />
        </Col>

        <Col xs={24} lg={12} xl={7}>
          <Panel height={LIST_HEIGHT} title="Accounts" extra={<Link href="/accounts">Manage</Link>}>
            {accounts.isPending ? (
              <Skeleton active />
            ) : (
              <RowList
                emptyText="No accounts yet"
                items={(accounts.data ?? [])
                  .filter((a) => a.isActive)
                  .map((a) => ({
                    key: a.id,
                    title: <Link href={`/accounts/${a.id}`}>{a.name}</Link>,
                    description: <Tag variant="filled">{a.type.replace('_', ' ')}</Tag>,
                    extra: <Amount value={a.balance} currency={a.currency} signed={false} />,
                  }))}
              />
            )}
          </Panel>
        </Col>

        <Col xs={24} xl={9}>
          <Panel height={LIST_HEIGHT} title="Recent transactions" extra={<Link href="/transactions">View all</Link>}>
            {recent.isPending ? (
              <Skeleton active />
            ) : (
              <RowList
                emptyText="No transactions yet"
                items={(recent.data?.items ?? []).map((t) => ({
                  key: t.id,
                  title: t.description,
                  description: [formatDate(t.date), accountName.get(t.accountId), t.categoryId && categoryName.get(t.categoryId)]
                    .filter(Boolean)
                    .join(' · '),
                  extra: <Amount value={t.amount} currency={t.currency} type={t.type} />,
                }))}
              />
            )}
          </Panel>
        </Col>
      </Row>
    </>
  );
}
