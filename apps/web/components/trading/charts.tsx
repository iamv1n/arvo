'use client';

import { Empty } from 'antd';
import dayjs from 'dayjs';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from 'styled-components';
import type { TradingBreakdownRow, TradingMetrics } from '../../lib/types';
import { useMoney } from '../../lib/use-money';

/*
 * Two charts carry the trading area: the realised equity curve and a signed bar chart used for
 * every "edge by …" breakdown. Both take a fixed height so the grid does not move as data
 * loads, and both read their colours from the theme so dark mode needs no second definition.
 */

function useTooltipStyle() {
  const theme = useTheme();
  return {
    contentStyle: {
      background: theme.colors.bgSurfaceRaised,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radii.md,
      color: theme.colors.textPrimary,
      fontFamily: theme.typography.fontFamily,
    },
    itemStyle: { color: theme.colors.textPrimary },
    labelStyle: { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamilyMono, fontSize: 12 },
  };
}

const empty = (height: number) => <Empty description="No closed trades yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: `${height / 3}px 0` }} />;

/** Cumulative realised P&L after charges, with the drawdown shaded underneath it. */
export function EquityCurve({ data, currency, height = 280 }: { data: TradingMetrics['equityCurve']; currency: string; height?: number }) {
  const theme = useTheme();
  const money = useMoney();
  const tooltip = useTooltipStyle();
  if (data.length === 0) return empty(height);
  const rows = data.map((point) => ({
    date: point.date,
    Equity: Number(point.equity),
    Drawdown: Number(point.drawdown),
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="arvo-equity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.colors.brand} stopOpacity={0.35} />
            <stop offset="100%" stopColor={theme.colors.brand} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(value: string) => dayjs(value).format('D MMM')}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={68}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(v: number) => money(v, currency, { compact: true })}
        />
        <ReferenceLine y={0} stroke={theme.colors.border} />
        <Tooltip {...tooltip} labelFormatter={(d) => dayjs(String(d)).format('D MMM YYYY')} formatter={(v) => money(Number(v), currency)} />
        <Area type="monotone" dataKey="Drawdown" stroke={theme.colors.expense} fill={theme.colors.expenseSubtle} strokeWidth={1} />
        <Area type="monotone" dataKey="Equity" stroke={theme.colors.brand} strokeWidth={2.5} fill="url(#arvo-equity)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Net P&L per bucket, coloured by sign. Used for every edge breakdown. */
export function EdgeBars({ rows, currency, height = 240 }: { rows: TradingBreakdownRow[]; currency: string; height?: number }) {
  const theme = useTheme();
  const money = useMoney();
  const tooltip = useTooltipStyle();
  if (rows.length === 0) return empty(height);
  const data = rows.map((row) => ({ label: row.label, value: Number(row.netPnl), trades: row.trades }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fill: theme.colors.textMuted, fontSize: 11 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(v: number) => money(v, currency, { compact: true })}
        />
        <ReferenceLine y={0} stroke={theme.colors.border} />
        <Tooltip
          {...tooltip}
          formatter={(v, _n, item) => [money(Number(v), currency), `${(item?.payload as { trades: number } | undefined)?.trades ?? 0} trades`]}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((row) => (
            <Cell key={row.label} fill={row.value < 0 ? theme.colors.expense : theme.colors.income} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
