'use client';

import { ArrowDownOutlined, ArrowUpOutlined, BankOutlined, WalletOutlined } from '@ant-design/icons';
import { Alert, Card, Col, Flex, Progress, Row, Segmented, Skeleton, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTheme } from 'styled-components';
import { Amount } from '../../../components/amount';
import { CategoryDonut, categoryColors, IncomeExpenseChart } from '../../../components/charts';
import { PageHeader } from '../../../components/page-header';
import { RowList } from '../../../components/row-list';
import { StatCard } from '../../../components/stat-card';
import { useAuth } from '../../../lib/auth';
import { formatDate, formatMoney } from '../../../lib/format';
import { PERIOD_OPTIONS, periodRange, type PeriodKey } from '../../../lib/periods';
import { useAccounts, useCategories, useMonthly, useNetWorth, useRecurring, useSummary, useTransactions } from '../../../lib/queries';

export default function DashboardPage() {
  const { user } = useAuth();
  const theme = useTheme();
  const currency = user?.currency ?? 'INR';
  const [period, setPeriod] = useState<PeriodKey>('this-month');
  const range = useMemo(() => periodRange(period), [period]);
  const trendRange = useMemo(() => periodRange('last-6-months'), []);

  const summary = useSummary(range);
  const monthly = useMonthly(trendRange);
  const netWorth = useNetWorth();
  const accounts = useAccounts();
  const categories = useCategories();
  const recent = useTransactions({ limit: 8 });
  const recurring = useRecurring();

  const categoryName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);

  const s = summary.data;
  const topSpend = s?.spendingByTopCategory ?? [];
  const maxSpend = Math.max(1, ...topSpend.map((c) => Number(c.amount)));
  const palette = categoryColors(theme);
  const firstName = user?.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Hello${firstName ? `, ${firstName}` : ''}`}
        subtitle={s ? `${formatDate(s.from)} – ${formatDate(s.to)}` : 'Your financial picture'}
        extra={<Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />}
      />

      {accounts.data?.length === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
          title="Start by adding an account"
          description={<>Create a bank, card or cash account on the <Link href="/accounts">Accounts</Link> page, then add transactions.</>}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<BankOutlined />}
            label="Net worth"
            loading={netWorth.isPending}
            value={netWorth.data && formatMoney(netWorth.data.netWorth, currency)}
            hint={netWorth.data && `Assets ${formatMoney(netWorth.data.assets, currency, { compact: true })} · Owed ${formatMoney(netWorth.data.liabilities, currency, { compact: true })}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<ArrowDownOutlined />} label="Income" loading={summary.isPending} value={s && formatMoney(s.income, currency)} tone="positive" />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<ArrowUpOutlined />}
            label="Expenses"
            loading={summary.isPending}
            value={s && formatMoney(s.expenses, currency)}
            hint={
              s &&
              `${s.transactionCount} transactions${recurring.data && Number(recurring.data.monthlyTotal) > 0 ? ` · ${formatMoney(recurring.data.monthlyTotal, currency, { compact: true })}/mo recurring` : ''}`
            }
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            icon={<WalletOutlined />}
            label="Net cashflow"
            loading={summary.isPending}
            value={s && formatMoney(s.netCashflow, currency)}
            tone={s && Number(s.netCashflow) < 0 ? 'negative' : 'positive'}
            hint={s && (s.savingsRate === null ? 'No income yet' : `Savings rate ${s.savingsRate}%`)}
          />
        </Col>

        {s && s.unclassified.transactionCount > 0 && (
          <Col span={24}>
            <Alert
              type="warning"
              showIcon
              title={`${s.unclassified.transactionCount} ${s.unclassified.transactionCount === 1 ? 'transaction has' : 'transactions have'} type Unknown and ${s.unclassified.transactionCount === 1 ? 'is' : 'are'} not counted`}
              description={<Link href="/transactions?type=UNKNOWN">Review them</Link>}
            />
          </Col>
        )}

        <Col xs={24} xl={15}>
          <Card title="Income vs expenses" extra={<Typography.Text type="secondary">Last 6 months</Typography.Text>}>
            {monthly.isPending ? <Skeleton active paragraph={{ rows: 6 }} /> : <IncomeExpenseChart data={monthly.data ?? []} currency={currency} />}
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card title="Spending by category" style={{ height: '100%' }}>
            {summary.isPending ? (
              <Skeleton active />
            ) : (
              <>
                <CategoryDonut data={topSpend} currency={currency} />
                <Flex vertical gap={10}>
                  {topSpend.slice(0, 6).map((c, i) => (
                    <div key={c.categoryId ?? 'none'}>
                      <Flex justify="space-between">
                        <Typography.Text>{c.name}</Typography.Text>
                        <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(c.amount, currency)}
                        </Typography.Text>
                      </Flex>
                      <Progress
                        percent={(Number(c.amount) / maxSpend) * 100}
                        showInfo={false}
                        strokeColor={palette[i % palette.length]}
                        size="small"
                      />
                    </div>
                  ))}
                </Flex>
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Accounts" extra={<Link href="/accounts">Manage</Link>} style={{ height: '100%' }}>
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
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title="Recent transactions" extra={<Link href="/transactions">View all</Link>} style={{ height: '100%' }}>
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
          </Card>
        </Col>
      </Row>
    </>
  );
}
