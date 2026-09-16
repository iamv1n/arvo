'use client';

import { Empty } from 'antd';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from 'styled-components';
import { formatMoney, formatMonth } from '../lib/format';
import type { CategorySpend, MonthlyPoint } from '../lib/types';

export function IncomeExpenseChart({ data, currency, height = 280 }: { data: MonthlyPoint[]; currency: string; height?: number }) {
  const theme = useTheme();
  const rows = data.map((p) => ({ month: formatMonth(p.month), Income: Number(p.income), Expenses: Number(p.expenses) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} barGap={4} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: theme.colors.textMuted, fontSize: 12 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
        />
        <Tooltip
          cursor={{ fill: theme.colors.bgMuted }}
          formatter={(v) => formatMoney(Number(v), currency)}
          contentStyle={{
            background: theme.colors.bgSurfaceRaised,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            color: theme.colors.textPrimary,
          }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Income" fill={theme.colors.income} radius={[6, 6, 0, 0]} maxBarSize={26} />
        <Bar dataKey="Expenses" fill={theme.colors.expense} radius={[6, 6, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Categorical palette derived from theme tokens, ordered by visual distinctness. */
function categoryColors(theme: ReturnType<typeof useTheme>): string[] {
  return theme.colors.chart;
}

export function CategoryDonut({ data, currency, size = 240 }: { data: CategorySpend[]; currency: string; size?: number }) {
  const theme = useTheme();
  if (data.length === 0) return <Empty description="No spending in this period" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const palette = categoryColors(theme);
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((sum, c) => sum + Number(c.amount), 0);
  const rows = [...top.map((c) => ({ name: c.name, value: Number(c.amount) })), ...(rest > 0 ? [{ name: 'Other', value: rest }] : [])];
  return (
    <ResponsiveContainer width="100%" height={size}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="96%" paddingAngle={2} stroke="none">
          {rows.map((row, i) => (
            <Cell key={row.name} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => formatMoney(Number(v), currency)}
          contentStyle={{
            background: theme.colors.bgSurfaceRaised,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
          }}
          itemStyle={{ color: theme.colors.textPrimary }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { categoryColors };
