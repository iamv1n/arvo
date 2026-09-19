'use client';

import { ArrowDownOutlined, ArrowUpOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Flex, Row, Skeleton, Tag, Typography } from 'antd';
import { DataTable } from '../../../../components/data-table';
import type { Transaction } from '../../../../lib/types';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTheme } from 'styled-components';
import { Amount } from '../../../../components/amount';
import { IncomeExpenseChart } from '../../../../components/charts';
import { ExpandableChart } from '../../../../components/expandable-chart';
import { PageHeader } from '../../../../components/page-header';
import { StatCard } from '../../../../components/stat-card';
import { useAuth } from '../../../../lib/auth';
import { formatDate, formatMoney } from '../../../../lib/format';
import { useAccounts, useComparison, useMerchantSpend, useMonthly } from '../../../../lib/queries';

const range = (month: dayjs.Dayjs) => ({
  from: month.startOf('month').format('YYYY-MM-DD'),
  to: month.endOf('month').format('YYYY-MM-DD'),
});

export default function AnalyticsPage() {
  const { user } = useAuth();
  const theme = useTheme();
  const currency = user?.currency ?? 'INR';
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const current = range(month);
  const previous = range(month.subtract(1, 'month'));

  const comparison = useComparison({ ...current, previousFrom: previous.from, previousTo: previous.to });
  const merchants = useMerchantSpend(current);
  const trend = useMonthly(useMemo(() => ({ from: month.subtract(11, 'month').startOf('month').format('YYYY-MM-DD'), to: current.to }), [month, current.to]));
  const accounts = useAccounts();
  const accountName = new Map((accounts.data ?? []).map((a) => [a.id, a.name]));

  const c = comparison.data;
  const change = (value: string | undefined, invert = false) => {
    if (!value) return undefined;
    const n = Number(value);
    if (n === 0) return 'No change vs last month';
    const up = n > 0;
    const good = invert ? !up : up;
    return (
      <Typography.Text style={{ fontSize: 12, color: good ? theme.colors.income : theme.colors.expense }}>
        {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {formatMoney(Math.abs(n), currency)} vs last month
      </Typography.Text>
    );
  };
  const isCurrentMonth = month.isSame(dayjs(), 'month');

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Where your money went, and what changed."
        extra={
          <Flex align="center" gap={8} wrap>
            <Button icon={<LeftOutlined />} onClick={() => setMonth((m) => m.subtract(1, 'month'))} aria-label="Previous month" />
            <Typography.Text strong style={{ minWidth: 110, textAlign: 'center' }}>
              {month.format('MMMM YYYY')}
            </Typography.Text>
            <Button icon={<RightOutlined />} disabled={isCurrentMonth} onClick={() => setMonth((m) => m.add(1, 'month'))} aria-label="Next month" />
          </Flex>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <StatCard label="Income" loading={comparison.isPending} value={c && formatMoney(c.current.income, currency)} tone="positive" hint={change(c?.change.income)} />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label="Expenses"
            loading={comparison.isPending}
            value={c && formatMoney(c.current.expenses, currency)}
            hint={
              c && (
                <>
                  {change(c.change.expenses, true)}
                  {c.change.expensesPercent !== null && ` (${c.change.expensesPercent > 0 ? '+' : ''}${c.change.expensesPercent}%)`}
                </>
              )
            }
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label="Net cashflow"
            loading={comparison.isPending}
            value={c && formatMoney(c.current.netCashflow, currency)}
            tone={c && Number(c.current.netCashflow) < 0 ? 'negative' : 'positive'}
            hint={change(c?.change.netCashflow)}
          />
        </Col>

        <Col span={24}>
          <Card title="Last 12 months">
            {trend.isPending ? (
              <Skeleton active />
            ) : (
              <ExpandableChart
                title="Last 12 months"
                height={240}
                caption="Income and expenses per month over the last twelve months."
                render={(h) => <IncomeExpenseChart data={trend.data ?? []} currency={currency} height={h} />}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="What changed" extra={<Typography.Text type="secondary">vs {month.subtract(1, 'month').format('MMMM')}</Typography.Text>} styles={{ body: { padding: 0 } }}>
            <DataTable
              rowKey={(r) => r.categoryId ?? 'none'}
              loading={comparison.isFetching}
              dataSource={c?.categoryChanges}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty description="No spending in these months" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              columns={[
                { title: 'Category', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
                { title: 'This month', align: 'right', sorter: (a, b) => Number(a.current) - Number(b.current), render: (_, r) => formatMoney(r.current, currency) },
                { title: 'Last month', align: 'right', render: (_, r) => <Typography.Text type="secondary">{formatMoney(r.previous, currency)}</Typography.Text> },
                {
                  title: 'Change',
                  align: 'right',
                  sorter: (a, b) => Number(a.change) - Number(b.change),
                  render: (_, r) => {
                    const n = Number(r.change);
                    if (n === 0) return <Typography.Text type="secondary">—</Typography.Text>;
                    return (
                      <Tag color={n > 0 ? 'red' : 'green'} variant="filled" style={{ marginInlineEnd: 0 }}>
                        {n > 0 ? '+' : '−'}
                        {formatMoney(Math.abs(n), currency)}
                        {r.changePercent !== null && ` · ${r.changePercent > 0 ? '+' : ''}${r.changePercent}%`}
                      </Tag>
                    );
                  },
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title="Top merchants" styles={{ body: { padding: 0 } }}>
            <DataTable
              rowKey={(r) => r.merchantId ?? 'none'}
              loading={merchants.isFetching}
              dataSource={merchants.data?.slice(0, 10)}
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Merchant', dataIndex: 'name', ellipsis: true },
                { title: 'Txns', dataIndex: 'transactionCount', align: 'right', width: 80, sorter: (a, b) => a.transactionCount - b.transactionCount },
                { title: 'Spent', align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => Number(a.amount) - Number(b.amount), render: (_, r) => formatMoney(r.amount, currency) },
              ]}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="Largest expenses this month"
            extra={<Typography.Text type="secondary">Top {c?.largestExpenses.length ?? 5} by amount</Typography.Text>}
            styles={{ body: { padding: 0 } }}
          >
            <DataTable<Transaction & { rank: number }>
              rowKey="id"
              loading={comparison.isFetching}
              dataSource={c?.largestExpenses.map((t, i) => ({ ...t, rank: i + 1 }))}
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '#', dataIndex: 'rank', width: 56, sorter: (a, b) => a.rank - b.rank },
                { title: 'Date', dataIndex: 'date', width: 130, render: formatDate, sorter: (a, b) => a.date.localeCompare(b.date) },
                { title: 'Description', dataIndex: 'description', ellipsis: true },
                { title: 'Account', dataIndex: 'accountId', width: 200, render: (id: string) => accountName.get(id) },
                {
                  title: 'Amount',
                  dataIndex: 'amount',
                  align: 'right',
                  width: 150,
                  defaultSortOrder: 'ascend',
                  sortDirections: ['ascend', 'descend', 'ascend'],
                  showSorterTooltip: { title: 'Largest first' },
                  sorter: (a, b) => Number(a.amount) - Number(b.amount),
                  render: (v: string, t) => <Amount value={v} currency={t.currency} type={t.type} />,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
