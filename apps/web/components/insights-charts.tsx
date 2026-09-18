'use client';

import { Empty, Tooltip as AntTooltip } from 'antd';
import dayjs from 'dayjs';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from 'recharts';
import styled, { useTheme } from 'styled-components';
import type { DailySpend, BurnUpPoint, MerchantSpend, SizeBand, UpcomingCharge, WaterfallStep, WeekdaySpend } from '../lib/types';
import { useMoney } from '../lib/use-money';

type Money = ReturnType<typeof useMoney>;

function useChartTooltipStyle() {
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

// ---------------------------------------------------------------------------------------------
// Burn-up: cumulative spend by day of month.

export function BurnUpChart({ data, currency, height = 300 }: { data: BurnUpPoint[]; currency: string; height?: number }) {
  const theme = useTheme();
  const money = useMoney();
  const tooltip = useChartTooltipStyle();
  const rows = data.map((p) => ({
    day: p.day,
    'This month': p.thisMonth === null ? null : Number(p.thisMonth),
    'Last month': p.lastMonth === null ? null : Number(p.lastMonth),
    '3-month average': Number(p.average),
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: theme.colors.textMuted, fontSize: 12 }} interval={4} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tick={{ fill: theme.colors.textMuted, fontSize: 12 }}
          tickFormatter={(v: number) => money(v, currency, { compact: true })}
        />
        <Tooltip {...tooltip} labelFormatter={(d) => `Day ${d}`} formatter={(v) => money(Number(v), currency)} />
        <Line type="monotone" dataKey="3-month average" stroke={theme.colors.textMuted} strokeDasharray="2 4" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="Last month" stroke={theme.colors.info} strokeDasharray="6 4" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="This month" stroke={theme.colors.brand} strokeWidth={3} dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------------------------
// Heatmap: weeks as columns, weekdays as rows, like a contribution calendar.

const HeatGrid = styled.div`
  overflow-x: auto;
  padding-bottom: 4px;
`;

const Legend = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: ${({ theme }) => theme.space[3]}px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};

  span {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
`;

export function SpendingHeatmap({ days, currency, cellSize = 14 }: { days: DailySpend[]; currency: string; cellSize?: number }) {
  const theme = useTheme();
  const money = useMoney();
  if (days.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  // Shade by quantile among spending days so one huge day doesn't wash out the rest.
  const values = days.map((d) => Number(d.spent)).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0;
  const thresholds = [q(0.25), q(0.5), q(0.75), q(0.9)];
  const shades = [theme.colors.bgMuted, `${theme.colors.brand}33`, `${theme.colors.brand}66`, `${theme.colors.brand}aa`, theme.colors.brand, theme.colors.brandActive];
  const shade = (v: number) => (v <= 0 ? shades[0] : shades[1 + thresholds.filter((t) => v > t).length]);

  const cell = cellSize;
  const gap = 4;
  const firstWeekday = dayjs(days[0].date).day();
  const columns = Math.ceil((days.length + firstWeekday) / 7);
  const labelWidth = 28;
  const width = labelWidth + columns * (cell + gap);
  const height = 18 + 7 * (cell + gap);
  const monthLabels = days
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => i === 0 || dayjs(d.date).date() === 1)
    .map(({ d, i }) => ({ label: dayjs(d.date).format('MMM'), x: labelWidth + Math.floor((i + firstWeekday) / 7) * (cell + gap) }));

  return (
    <HeatGrid>
      <svg width={width} height={height} role="img" aria-label="Daily spending calendar">
        {monthLabels.map((m) => (
          <text key={`${m.label}-${m.x}`} x={m.x} y={11} fontSize={12} fill={theme.colors.textMuted} fontFamily={theme.typography.fontFamilyMono}>
            {m.label}
          </text>
        ))}
        {['Mon', 'Wed', 'Fri'].map((label, i) => (
          <text key={label} x={0} y={18 + (i * 2 + 1) * (cell + gap) + 11} fontSize={11} fill={theme.colors.textMuted}>
            {label}
          </text>
        ))}
        {days.map((d, i) => {
          const index = i + firstWeekday;
          const x = labelWidth + Math.floor(index / 7) * (cell + gap);
          const y = 18 + (index % 7) * (cell + gap);
          return (
            <AntTooltip
              key={d.date}
              title={`${dayjs(d.date).format('ddd, D MMM')} · ${Number(d.spent) > 0 ? `${money(d.spent, currency)} across ${d.count}` : 'No spending'}`}
            >
              <rect x={x} y={y} width={cell} height={cell} rx={3} fill={shade(Number(d.spent))} />
            </AntTooltip>
          );
        })}
      </svg>
      <Legend aria-hidden>
        Less
        {shades.map((s) => (
          <span key={s} style={{ background: s }} />
        ))}
        More
      </Legend>
    </HeatGrid>
  );
}

// ---------------------------------------------------------------------------------------------
// Weekday rhythm: seven columns with serif initials.

const Rhythm = styled.div<{ $height: number }>`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  align-items: end;
  gap: ${({ theme }) => theme.space[2]}px;
  height: ${({ $height }) => $height}px;
`;

const RhythmCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 100%;

  .bar {
    width: 100%;
    max-width: 44px;
    border-radius: 6px 6px 2px 2px;
    transition: height 600ms ${({ theme }) => theme.motion.easing};
  }
  .value {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 11px;
    color: ${({ theme }) => theme.colors.textMuted};
    white-space: nowrap;
  }
  .day {
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    font-size: 18px;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

export function WeekdayRhythm({ weekdays, currency, height = 220 }: { weekdays: WeekdaySpend[]; currency: string; height?: number }) {
  const theme = useTheme();
  const money = useMoney();
  // Start the week on Monday.
  const ordered = [...weekdays.slice(1), weekdays[0]];
  const max = Math.max(1, ...ordered.map((w) => Number(w.average)));
  const peak = ordered.reduce((best, w) => (Number(w.average) > Number(best.average) ? w : best), ordered[0]);
  return (
    <Rhythm $height={height} role="img" aria-label="Average spending per weekday">
      {ordered.map((w) => (
        <RhythmCol key={w.weekday}>
          <span className="value">{money(w.average, currency, { compact: true })}</span>
          <span
            className="bar"
            style={{
              height: `${Math.max(3, (Number(w.average) / max) * (height - 70))}px`,
              background: w.weekday === peak.weekday ? theme.colors.brand : theme.colors.textPrimary,
              opacity: w.weekday === peak.weekday ? 1 : 0.18 + 0.5 * (Number(w.average) / max),
            }}
          />
          <span className="day">{dayjs().day(w.weekday).format('dd').charAt(0)}</span>
        </RhythmCol>
      ))}
    </Rhythm>
  );
}

// ---------------------------------------------------------------------------------------------
// Purchase size bands: count bar and money bar side by side.

const Bands = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[2]}px;
`;

const BandRow = styled.div`
  display: grid;
  grid-template-columns: 110px 1fr 1fr;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  font-size: 13px;

  .label {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  .track {
    position: relative;
    height: 22px;
    border-radius: 4px;
    background: ${({ theme }) => theme.colors.bgMuted};
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 4px;
    transition: width 700ms ${({ theme }) => theme.motion.easing};
  }
  .text {
    position: absolute;
    inset: 0 8px;
    display: flex;
    align-items: center;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-template-columns: 80px 1fr;
    .money {
      grid-column: 2;
    }
  }
`;

export function SizeBands({ bands, currency }: { bands: SizeBand[]; currency: string }) {
  const theme = useTheme();
  const money = useMoney();
  const maxCount = Math.max(1, ...bands.map((b) => b.count));
  const maxTotal = Math.max(1, ...bands.map((b) => Number(b.total)));
  const label = (b: SizeBand) =>
    b.max === null ? `${money(b.min, currency, { compact: true })}+` : `${money(b.min, currency, { compact: true })}–${money(b.max, currency, { compact: true })}`;
  return (
    <Bands>
      <BandRow style={{ fontSize: 12, color: theme.colors.textMuted }}>
        <span />
        <span>How many</span>
        <span className="money">How much</span>
      </BandRow>
      {bands.map((b) => (
        <BandRow key={b.label}>
          <span className="label">{label(b)}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(b.count / maxCount) * 100}%`, background: `${theme.colors.info}55` }} />
            <span className="text">{b.count}</span>
          </div>
          <div className="track money">
            <div className="fill" style={{ width: `${(Number(b.total) / maxTotal) * 100}%`, background: `${theme.colors.brand}66` }} />
            <span className="text">{money(b.total, currency, { compact: true })}</span>
          </div>
        </BandRow>
      ))}
    </Bands>
  );
}

// ---------------------------------------------------------------------------------------------
// Waterfall: income drops step by step through categories to what's left.

export function MonthWaterfall({ steps, currency, height = 300 }: { steps: WaterfallStep[]; currency: string; height?: number }) {
  const theme = useTheme();
  const money = useMoney();
  const tooltip = useChartTooltipStyle();
  if (steps.length <= 1 || Number(steps[0]?.amount ?? 0) <= 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Add income this month to see where it went" />;
  }
  let level = Number(steps[0].amount);
  const rows = steps.map((step) => {
    const amount = Number(step.amount);
    if (step.kind === 'income') return { label: step.label, base: 0, value: amount, kind: step.kind, amount: step.amount };
    if (step.kind === 'remaining') return { label: step.label, base: Math.min(0, amount), value: Math.abs(amount), kind: step.kind, amount: step.amount };
    level -= amount;
    return { label: step.label, base: Math.max(0, level), value: amount, kind: step.kind, amount: step.amount };
  });
  const color = (kind: string, amount: string) =>
    kind === 'income' ? theme.colors.income : kind === 'remaining' ? (Number(amount) >= 0 ? theme.colors.brand : theme.colors.expense) : theme.colors.expense;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: theme.colors.textMuted, fontSize: 12 }} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: theme.colors.textMuted, fontSize: 12 }} tickFormatter={(v: number) => money(v, currency, { compact: true })} />
        <Tooltip
          {...tooltip}
          cursor={{ fill: theme.colors.bgMuted }}
          formatter={(_v, name, item) => (name === 'value' ? [money((item.payload as { amount: string }).amount, currency), (item.payload as { label: string }).label] : null)}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {rows.map((r) => (
            <Cell key={r.label} fill={color(r.kind, r.amount)} fillOpacity={r.kind === 'category' || r.kind === 'other' ? 0.75 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------------------------
// Merchant treemap.

export function MerchantTreemap({ merchants, currency, height = 300 }: { merchants: MerchantSpend[]; currency: string; height?: number }) {
  const theme = useTheme();
  const money = useMoney();
  const data = merchants.filter((m) => m.merchantId && Number(m.amount) > 0).slice(0, 14);
  if (data.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No merchant spending yet" />;
  const palette = theme.colors.chart;
  const rows = data.map((m, i) => ({ name: m.name, size: Number(m.amount), fill: palette[i % palette.length], count: m.transactionCount }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={rows}
        dataKey="size"
        stroke={theme.colors.bgSurface}
        isAnimationActive
        content={<TreemapCell money={money} currency={currency} textColor="#fff" />}
      />
    </ResponsiveContainer>
  );
}

function TreemapCell(props: {
  money: Money;
  currency: string;
  textColor: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  fill?: string;
  count?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, size, fill, money, currency, textColor } = props;
  const roomy = width > 70 && height > 42;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={fill} fillOpacity={0.85} stroke="rgba(255,255,255,0.6)" strokeWidth={2} />
      {roomy && (
        <>
          <text x={x + 10} y={y + 22} fill={textColor} fontSize={13} fontWeight={600}>
            {name && name.length > width / 8 ? `${name.slice(0, Math.floor(width / 8) - 1)}…` : name}
          </text>
          <text x={x + 10} y={y + 40} fill={textColor} fontSize={12} opacity={0.9} fontFamily="var(--font-mono), monospace">
            {money(size ?? 0, currency, { compact: true })}
          </text>
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Upcoming recurring charges as a dated timeline.

const Timeline = styled.ol`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const TimelineItem = styled.li`
  display: grid;
  grid-template-columns: 58px 1fr auto;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[3]}px 0;
  & + & {
    border-top: 1px dashed ${({ theme }) => theme.colors.border};
  }

  .date {
    text-align: center;
    line-height: 1.1;
    b {
      display: block;
      font-family: ${({ theme }) => theme.typography.fontFamilySerif};
      font-size: 24px;
      font-weight: 500;
    }
    small {
      font-family: ${({ theme }) => theme.typography.fontFamilyMono};
      font-size: 11px;
      text-transform: uppercase;
      color: ${({ theme }) => theme.colors.textMuted};
    }
  }
  .name {
    font-weight: 500;
  }
  .meta {
    display: block;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  .amount {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  }
`;

export function UpcomingCharges({ items, currency, asOf }: { items: UpcomingCharge[]; currency: string; asOf: string }) {
  const money = useMoney();
  if (items.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing recurring due in the next 30 days" />;
  return (
    <Timeline>
      {items.map((c) => {
        const inDays = dayjs(c.date).diff(dayjs(asOf), 'day');
        return (
          <TimelineItem key={`${c.label}-${c.date}`}>
            <span className="date">
              <b>{dayjs(c.date).format('D')}</b>
              <small>{dayjs(c.date).format('MMM')}</small>
            </span>
            <span>
              <span className="name">{c.label}</span>
              <span className="meta">
                {inDays <= 1 ? 'Tomorrow' : `In ${inDays} days`} · {c.frequency.toLowerCase()}
                {c.priceIncreased && ' · price went up'}
              </span>
            </span>
            <span className="amount">{money(c.amount, currency)}</span>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
