'use client';

import { Target } from '@phosphor-icons/react';
import { Alert, App, Card, Col, Empty, Input, Row, Select, Skeleton, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from 'styled-components';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useGoals, usePortfolioMutation, usePortfolioSummary } from '../../lib/queries';
import type { GoalProjectionResult } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, SectionTitle } from '../planning';
import { NotAdvice } from './shared';

/**
 * Map holdings to goals, then project each goal with a seeded Monte Carlo. The projection is
 * reproducible on purpose: the same inputs always give the same picture, so the number is
 * something to think with rather than a slot machine.
 */
export function GoalsTab({ asOf }: { asOf?: string }) {
  const money = useMoney();
  const theme = useTheme();
  const { message } = App.useApp();
  const goals = useGoals();
  const summary = usePortfolioSummary(asOf);
  const [contributions, setContributions] = useState<Record<string, string>>({});
  const [projection, setProjection] = useState<GoalProjectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assign = usePortfolioMutation(({ holdingId, goalId }: { holdingId: string; goalId: string | null }) =>
    api(`/holdings/${holdingId}`, { method: 'PATCH', body: { goalId } }),
  );

  useEffect(() => {
    let cancelled = false;
    void api<GoalProjectionResult>('/portfolio/goal-projection', { method: 'POST', body: { asOf, monthlyContributions: contributions } })
      .then((result) => {
        if (!cancelled) {
          setProjection(result);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [asOf, contributions, summary.dataUpdatedAt]);

  if (goals.isPending || summary.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }
  if ((goals.data ?? []).length === 0) {
    return (
      <Card>
        <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Create a goal first, then earmark holdings for it." />
      </Card>
    );
  }

  const currency = summary.data?.currency ?? 'INR';
  const holdings = summary.data?.holdings ?? [];
  const goalOptions = (goals.data ?? []).map((goal) => ({ value: goal.id, label: goal.name }));

  return (
    <>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      <Row gutter={[16, 16]}>
        {(projection?.goals ?? []).map((goal) => {
          const rows = [
            { name: 'Unlucky (10%)', value: Number(goal.p10) },
            { name: 'Middle (50%)', value: Number(goal.p50) },
            { name: 'Lucky (90%)', value: Number(goal.p90) },
          ];
          const target = Number(goal.targetAmount);
          return (
            <Col key={goal.goalId} xs={24} lg={12}>
              <Card
                title={
                  <span>
                    <Target size={16} weight="duotone" style={{ verticalAlign: -2, marginRight: 8 }} />
                    {goal.goalName}
                  </span>
                }
                extra={<Eyebrow>by {formatDate(goal.targetDate)}</Eyebrow>}
                styles={{ body: { height: 360, overflowY: 'auto' } }}
              >
                <Row gutter={12} style={{ marginBottom: 12 }}>
                  <Col span={8}>
                    <Eyebrow>Mapped today</Eyebrow>
                    <div style={{ fontSize: 20, fontFamily: 'var(--font-serif), Georgia, serif' }}>{money(goal.currentValue, currency)}</div>
                  </Col>
                  <Col span={8}>
                    <Eyebrow>Target</Eyebrow>
                    <div style={{ fontSize: 20, fontFamily: 'var(--font-serif), Georgia, serif' }}>{money(goal.targetAmount, currency)}</div>
                  </Col>
                  <Col span={8}>
                    <Eyebrow>Chance of reaching it</Eyebrow>
                    <div style={{ fontSize: 20, fontFamily: 'var(--font-serif), Georgia, serif' }}>{goal.probability}%</div>
                  </Col>
                </Row>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: theme.colors.textMuted, fontSize: 11 }} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tick={{ fill: theme.colors.textMuted, fontSize: 11 }}
                      tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
                    />
                    <Tooltip
                      cursor={{ fill: theme.colors.bgMuted }}
                      formatter={(v) => formatMoney(Number(v), currency)}
                      contentStyle={{ background: theme.colors.bgSurfaceRaised, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.md }}
                      itemStyle={{ color: theme.colors.textPrimary }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {rows.map((row) => (
                        <Cell key={row.name} fill={row.value >= target ? theme.colors.income : theme.colors.warning} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <Eyebrow>Adding per month</Eyebrow>
                  <Input
                    size="small"
                    inputMode="decimal"
                    style={{ width: 120 }}
                    defaultValue={goal.monthlyContribution}
                    onBlur={(e) => setContributions({ ...contributions, [goal.goalId]: e.target.value || '0' })}
                  />
                </div>
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                  {goal.assumptions.paths.toLocaleString('en-IN')} simulated futures, seeded so this repeats exactly. Blend:{' '}
                  {goal.blend.map((b) => `${b.percent}% ${b.assetClass.toLowerCase()}`).join(', ')} — {goal.assumptions.blendReturnPercent}% a year with{' '}
                  {goal.assumptions.blendVolatilityPercent}% volatility. {goal.disclaimer}
                </Typography.Paragraph>
              </Card>
            </Col>
          );
        })}
      </Row>

      <SectionTitle>
        Which holding pays for what <small>{projection?.unmappedHoldings ?? 0} not earmarked</small>
      </SectionTitle>
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 560 }}
          dataSource={holdings}
          columns={[
            { key: 'name', title: 'Holding', dataIndex: 'name' },
            { key: 'value', title: 'Value', align: 'right', render: (_, row) => money(row.value, row.currency) },
            {
              key: 'goal',
              title: 'Earmarked for',
              width: 240,
              render: (_, row) => (
                <Select
                  allowClear
                  size="small"
                  style={{ width: '100%' }}
                  placeholder="No goal"
                  value={row.goalId ?? undefined}
                  options={goalOptions}
                  onChange={(goalId: string | undefined) =>
                    assign
                      .mutateAsync({ holdingId: row.id, goalId: goalId ?? null })
                      .then(() => message.success('Updated'))
                      .catch((e) => message.error(errorMessage(e)))
                  }
                />
              ),
            },
          ]}
        />
      </Card>

      <NotAdvice text="Projections are estimates from long-run averages, not forecasts. They ignore tax, charges and inflation." style={{ marginTop: 16 }} />
    </>
  );
}
