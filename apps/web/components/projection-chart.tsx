'use client';

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from 'styled-components';
import { formatMoney, formatMonth } from '../lib/format';

export interface ProjectionLine {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
}

/** 12-month liquid balance projection: one line per series, optional horizontal buffer line. */
export function ProjectionChart({
  months,
  lines,
  values,
  currency,
  buffer,
  height = 280,
}: {
  months: string[];
  lines: ProjectionLine[];
  /** values[key][i] is the balance for months[i]. */
  values: Record<string, string[]>;
  currency: string;
  buffer?: string;
  height?: number;
}) {
  const theme = useTheme();
  const rows = months.map((month, i) => ({
    month: i === 0 ? 'Now' : formatMonth(month),
    ...Object.fromEntries(lines.map((l) => [l.key, Number(values[l.key]?.[i] ?? 0)])),
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fill: theme.colors.textMuted, fontSize: 12 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={68}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
        />
        <Tooltip
          formatter={(v) => formatMoney(Number(v), currency)}
          contentStyle={{
            background: theme.colors.bgSurfaceRaised,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            color: theme.colors.textPrimary,
          }}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        {buffer !== undefined && Number(buffer) > 0 && (
          <ReferenceLine
            y={Number(buffer)}
            stroke={theme.colors.warning}
            strokeDasharray="4 4"
            label={{ value: 'Buffer', position: 'insideTopLeft', fill: theme.colors.warning, fontSize: 11 }}
          />
        )}
        <ReferenceLine y={0} stroke={theme.colors.border} />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name}
            stroke={l.color}
            strokeWidth={2.25}
            strokeDasharray={l.dashed ? '6 4' : undefined}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
