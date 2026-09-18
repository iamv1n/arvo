'use client';

import { Info } from '@phosphor-icons/react';
import { Empty } from 'antd';
import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import styled, { useTheme } from 'styled-components';
import { ExpandableChart } from '../expandable-chart';
import { NoticeStrip } from '../notice-strip';
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
 * The advice level, as a hairline rule rather than a paragraph block.
 *
 * Everything in /portfolio is level 0–2: analysis, education and simulation. Printed as a full
 * Alert under every tab it cost the page about a hundred pixels each time and pushed the figures
 * off the first screen, so the wording now lives in a NoticeStrip: headline always visible, the
 * rest behind "more", dismissible for good.
 */
export function NotAdvice({
  text,
  storageKey = 'arvo.portfolio.notice',
  style,
}: {
  text: ReactNode;
  storageKey?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <NoticeStrip
        storageKey={storageKey}
        icon={<Info size={13} weight="duotone" style={{ flex: 'none', marginTop: 3 }} />}
        headline="Information, not advice."
        detail={text}
      />
    </div>
  );
}

/** Donut of allocation slices, fixed height so the grid never jumps. */
export function AllocationDonut({ data, currency, height = 200 }: { data: AllocationSlice[]; currency: string; height?: number }) {
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
  min-width: 0;
  max-height: 100%;
  overflow-y: auto;

  li {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: baseline;
    gap: ${({ theme }) => theme.space[3]}px;
    padding: ${({ theme }) => theme.space[2]}px 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
    font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  }

  li:last-child {
    border-bottom: none;
  }

  li > span:nth-child(2) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .figure {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 11px;
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

/*
 * Donut beside its legend.
 *
 * This used to be an antd Row of span 11 / span 13, which on a phone left the chart in a 40%
 * column about 130px wide and the legend figures wrapping under their labels. As a grid the
 * chart keeps a fixed track, the legend takes what is left, and below 640px the two stack.
 */
const Split = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 210px) minmax(0, 1fr);
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  height: 100%;
  min-width: 0;

  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
  }
`;

/** A donut and its legend sized to fit a panel body exactly, so nothing scrolls inside it. */
export function AllocationSplit({
  data,
  currency,
  height = 200,
  empty = 'Nothing to show yet',
  title,
}: {
  data: AllocationSlice[];
  currency: string;
  height?: number;
  empty?: string;
  /** When given, the donut can be clicked to open at full size with the whole legend. */
  title?: string;
}) {
  if (data.length === 0) return <Empty description={empty} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />;
  return (
    <Split>
      <div style={{ minWidth: 0 }}>
        {title ? (
          <ExpandableChart
            title={title}
            height={height}
            caption={<WideLegend data={data} currency={currency} />}
            render={(h) => <AllocationDonut data={data} currency={currency} height={h} />}
          />
        ) : (
          <AllocationDonut data={data} currency={currency} height={height} />
        )}
      </div>
      <AllocationLegend data={data} currency={currency} />
    </Split>
  );
}

/* In the enlarged view there is room for every slice, in as many columns as fit. */
const LegendColumns = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  column-gap: ${({ theme }) => theme.space[6]}px;
`;

function WideLegend({ data, currency }: { data: AllocationSlice[]; currency: string }) {
  const theme = useTheme();
  const palette = theme.colors.chart;
  return (
    <LegendColumns>
      {data.map((slice, i) => (
        <Legend key={slice.key} style={{ maxHeight: 'none', overflow: 'visible' }}>
          <li>
            <span className="swatch" style={{ background: palette[i % palette.length] }} aria-hidden />
            <span>{slice.label}</span>
            <span className="figure">
              {slice.percent}% · {formatMoney(slice.value, currency, { compact: true })}
            </span>
          </li>
        </Legend>
      ))}
    </LegendColumns>
  );
}
