'use client';

import { Info } from '@phosphor-icons/react';
import { Alert, Empty } from 'antd';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import styled, { useTheme } from 'styled-components';
import { formatMoney } from '../../lib/format';
import type { AllocationSlice, AssetClass, HoldingTransactionType, InstrumentKind } from '../../lib/types';

export const KIND_LABELS: Record<InstrumentKind, string> = {
  EQUITY: 'Stock',
  MUTUAL_FUND: 'Mutual fund',
  ETF: 'ETF',
  NPS: 'NPS',
  EPF: 'EPF',
  PPF: 'PPF',
  FD: 'Fixed deposit',
  RD: 'Recurring deposit',
  SGB: 'Sovereign gold bond',
  GOLD: 'Gold',
  BOND: 'Bond',
  CASH: 'Cash',
  REAL_ESTATE: 'Real estate',
  OTHER: 'Other',
};

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  EQUITY: 'Equity',
  DEBT: 'Debt',
  GOLD: 'Gold',
  REAL_ESTATE: 'Real estate',
  CASH: 'Cash',
  OTHER: 'Other',
};

export const TRANSACTION_LABELS: Record<HoldingTransactionType, string> = {
  BUY: 'Purchase',
  SIP: 'SIP instalment',
  SWITCH_IN: 'Switch in',
  CONTRIBUTION: 'Contribution',
  BONUS: 'Bonus units',
  SELL: 'Redemption',
  SWITCH_OUT: 'Switch out',
  WITHDRAWAL: 'Withdrawal',
  MATURITY: 'Maturity',
  DIVIDEND: 'Dividend',
  INTEREST: 'Interest',
  VALUE_UPDATE: 'Value update',
};

/** Instruments priced by units × price. Everything else carries a stated value. */
export const UNIT_PRICED: InstrumentKind[] = ['EQUITY', 'MUTUAL_FUND', 'ETF', 'SGB', 'GOLD', 'BOND'];

/** A percentage return, coloured and signed. Nothing here is a recommendation. */
export const Percent = styled.span<{ $value: number | null }>`
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
  color: ${({ theme, $value }) =>
    $value === null ? theme.colors.textMuted : $value > 0 ? theme.colors.income : $value < 0 ? theme.colors.expense : theme.colors.textPrimary};
`;

export function ReturnPercent({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  return (
    <Percent $value={value}>
      {value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}${suffix}`}
    </Percent>
  );
}

/**
 * The advice-level banner. Everything in /portfolio is level 0–2: analysis, education and
 * simulation. It is shown wherever a number could be mistaken for a suggestion to trade.
 */
export function NotAdvice({ text, style }: { text: string; style?: React.CSSProperties }) {
  return <Alert type="info" showIcon icon={<Info size={18} weight="duotone" />} message="Information, not advice" description={text} style={style} />;
}

/** Donut of allocation slices, fixed height so the grid never jumps. */
export function AllocationDonut({ data, currency, height = 220 }: { data: AllocationSlice[]; currency: string; height?: number }) {
  const theme = useTheme();
  if (data.length === 0) return <Empty description="Nothing to show yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />;
  const palette = theme.colors.chart;
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((sum, slice) => sum + Number(slice.value), 0);
  const rows = [...top.map((s) => ({ name: s.label, value: Number(s.value) })), ...(rest > 0 ? [{ name: 'Other', value: rest }] : [])];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="96%" paddingAngle={2} stroke="none">
          {rows.map((row, i) => (
            <Cell key={row.name} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => formatMoney(Number(v), currency)}
          contentStyle={{ background: theme.colors.bgSurfaceRaised, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.md }}
          itemStyle={{ color: theme.colors.textPrimary }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Legend rows beside a donut: swatch, label, share and value. */
export const Legend = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: baseline;
    gap: ${({ theme }) => theme.space[3]}px;
    padding: ${({ theme }) => theme.space[2]}px 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
    font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  }

  li:last-child {
    border-bottom: none;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .figure {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
`;

export function AllocationLegend({ data, currency }: { data: AllocationSlice[]; currency: string }) {
  const theme = useTheme();
  const palette = theme.colors.chart;
  return (
    <Legend>
      {data.slice(0, 8).map((slice, i) => (
        <li key={slice.key}>
          <span className="swatch" style={{ background: palette[i % palette.length] }} aria-hidden />
          <span>{slice.label}</span>
          <span className="figure">
            {slice.percent}% · {formatMoney(slice.value, currency, { compact: true })}
          </span>
        </li>
      ))}
    </Legend>
  );
}
