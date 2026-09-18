'use client';

import { Empty } from 'antd';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from 'styled-components';
import type { PayoffPoint } from '../../lib/lab';
import { useMoney } from '../../lib/use-money';

/*
 * The payoff chart.
 *
 * Two lines: the solid one is the position held to the nearest expiry, the dashed one what the
 * model says it is worth today. The gap between them is time value, which is the thing most
 * payoff diagrams leave out and the thing that decides whether a trade is bearable to hold.
 *
 * The zero line and the current spot are both marked, because "where am I now" is the first
 * question anyone asks of one of these.
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

export function PayoffChart({
  series,
  spot,
  breakevens,
  height = 300,
  currency = 'INR',
}: {
  series: PayoffPoint[];
  spot: string;
  breakevens: string[];
  height?: number;
  currency?: string;
}) {
  const theme = useTheme();
  const money = useMoney();
  const tooltip = useTooltipStyle();
  if (series.length === 0) {
    return <Empty description="Add a leg to see the payoff" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: `${height / 3}px 0` }} />;
  }
  const rows = series.map((point) => ({
    spot: Number(point.spot),
    'At expiry': Number(point.atExpiry),
    Today: point.today === null ? null : Number(point.today),
    profit: Math.max(Number(point.atExpiry), 0),
    loss: Math.min(Number(point.atExpiry), 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis
          dataKey="spot"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={74}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(value: number) => money(value, currency, { compact: true })}
        />
        {/* The profit and loss shading sits underneath the lines, so the zero crossing reads at
            a glance without needing the legend. */}
        <Area dataKey="profit" stroke="none" fill={theme.colors.income} fillOpacity={0.14} isAnimationActive={false} legendType="none" />
        <Area dataKey="loss" stroke="none" fill={theme.colors.expense} fillOpacity={0.14} isAnimationActive={false} legendType="none" />
        <ReferenceLine y={0} stroke={theme.colors.border} />
        <ReferenceLine
          x={Number(spot)}
          stroke={theme.colors.textMuted}
          strokeDasharray="4 4"
          label={{ value: 'Spot', position: 'insideTopRight', fill: theme.colors.textMuted, fontSize: 11 }}
        />
        {breakevens.map((value) => (
          <ReferenceLine key={value} x={Number(value)} stroke={theme.colors.warning} strokeDasharray="2 4" />
        ))}
        <Line type="monotone" dataKey="At expiry" stroke={theme.colors.brand} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="Today"
          stroke={theme.colors.transfer}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: theme.colors.textMuted }} />
        <Tooltip
          {...tooltip}
          labelFormatter={(value) => `Underlying at ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          formatter={(value, name) => [money(Number(value), currency), name as string]}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Equity and drawdown from a backtest, drawn on one pair of axes. */
export function EquityAndDrawdown({
  data,
  height = 280,
  currency = 'INR',
}: {
  data: { date: string; equity: string; drawdownPercent: string }[];
  height?: number;
  currency?: string;
}) {
  const theme = useTheme();
  const money = useMoney();
  const tooltip = useTooltipStyle();
  if (data.length === 0) return <Empty description="No equity curve" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: `${height / 3}px 0` }} />;
  const rows = data.map((point) => ({ date: point.date, Equity: Number(point.equity), Drawdown: Number(point.drawdownPercent) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={40} tick={{ fill: theme.colors.textMuted, fontSize: 12 }} />
        <YAxis
          yAxisId="equity"
          tickLine={false}
          axisLine={false}
          width={74}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(value: number) => money(value, currency, { compact: true })}
        />
        <YAxis
          yAxisId="drawdown"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={52}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(value: number) => `${value.toFixed(0)}%`}
        />
        <Area
          yAxisId="drawdown"
          dataKey="Drawdown"
          stroke={theme.colors.expense}
          strokeWidth={1}
          fill={theme.colors.expense}
          fillOpacity={0.12}
          isAnimationActive={false}
        />
        <Line yAxisId="equity" type="monotone" dataKey="Equity" stroke={theme.colors.brand} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Legend wrapperStyle={{ fontSize: 12, color: theme.colors.textMuted }} />
        <Tooltip
          {...tooltip}
          formatter={(value, name) => [name === 'Drawdown' ? `${Number(value).toFixed(2)}%` : money(Number(value), currency), name as string]}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
