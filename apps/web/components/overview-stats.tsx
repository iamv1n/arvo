'use client';

import { ArrowDownOutlined, ArrowUpOutlined, BankOutlined, WalletOutlined } from '@ant-design/icons';
import { Col, Row } from 'antd';
import { useNetWorth, useRecurring, useSummary, type Period } from '../lib/queries';
import { useMoney } from '../lib/use-money';
import { CountUp } from './count-up';
import { StatCard } from './stat-card';

/** The four headline figures: net worth, income, expenses and net cash flow for a period. */
export function OverviewStats({ period, currency }: { period: Period; currency: string }) {
  const money = useMoney();
  const summary = useSummary(period);
  const netWorth = useNetWorth();
  const recurring = useRecurring();
  const s = summary.data;
  const format = (v: string | number) => money(v, currency);
  const compact = (v: string | number) => money(v, currency, { compact: true });

  return (
    <Row gutter={[16, 16]} align="stretch">
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          variant="hero"
          icon={<BankOutlined />}
          label="Net worth"
          loading={netWorth.isPending}
          value={netWorth.data && <CountUp value={netWorth.data.netWorth} format={format} />}
          hint={netWorth.data && `Assets ${compact(netWorth.data.assets)} · Owed ${compact(netWorth.data.liabilities)}`}
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          icon={<ArrowDownOutlined />}
          iconTone="positive"
          label="Income"
          loading={summary.isPending}
          value={s && <CountUp value={s.income} format={format} />}
          tone="positive"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          icon={<ArrowUpOutlined />}
          iconTone="negative"
          label="Expenses"
          loading={summary.isPending}
          value={s && <CountUp value={s.expenses} format={format} />}
          hint={
            s &&
            `${s.transactionCount} transactions${recurring.data && Number(recurring.data.monthlyTotal) > 0 ? ` · ${compact(recurring.data.monthlyTotal)}/mo recurring` : ''}`
          }
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          icon={<WalletOutlined />}
          iconTone="brand"
          label="Net cashflow"
          loading={summary.isPending}
          value={s && <CountUp value={s.netCashflow} format={format} />}
          tone={s && Number(s.netCashflow) < 0 ? 'negative' : 'positive'}
          hint={s && (s.savingsRate === null ? 'No income yet' : `Savings rate ${s.savingsRate}%`)}
        />
      </Col>
    </Row>
  );
}
