'use client';

import {
  ArrowsClockwise,
  CalendarCheck,
  ChartLineUp,
  Coffee,
  Coins,
  Lifebuoy,
  PiggyBank,
  Receipt,
  Storefront,
  Sun,
  TrendUp,
  type Icon,
} from '@phosphor-icons/react';
import { Empty, Skeleton } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styled, { css, useTheme } from 'styled-components';
import { useReducedMotion } from '../lib/preferences';
import type { Highlight, HighlightTone } from '../lib/types';
import { useMoney } from '../lib/use-money';
import { CountUp } from './count-up';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[4]}px;

  > * {
    grid-column: span 4;
  }
  > .featured {
    grid-column: span 6;
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.xl}px) {
    > *,
    > .featured {
      grid-column: span 6;
    }
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    > *,
    > .featured {
      grid-column: span 12;
    }
  }
`;

const Note = styled.article<{ $tone: HighlightTone; $index: number; $animate: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  min-height: 188px;
  padding: ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[4]}px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  overflow: hidden;
  transition:
    transform ${({ theme }) => theme.motion.normal} ${({ theme }) => theme.motion.easing},
    box-shadow ${({ theme }) => theme.motion.normal};

  /* A tone-coloured rule on the left edge, like a margin mark on a statement. */
  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: ${({ theme, $tone }) => toneColor(theme, $tone)};
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadows.md};
  }

  ${({ $animate, $index }) =>
    $animate &&
    css`
      animation: arvo-note-in 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      animation-delay: ${$index * 55}ms;
    `}

  @keyframes arvo-note-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
`;

const Label = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Figure = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  /* A long figure (₹1,24,350.00) must shrink and wrap inside the note, never run past it. */
  font-size: clamp(24px, 3.2vw, 34px);
  overflow-wrap: anywhere;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  font-variant-numeric: lining-nums tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: ${({ theme }) => theme.colors.textPrimary};

  small {
    margin-left: 6px;
    font-family: ${({ theme }) => theme.typography.fontFamily};
    font-size: 14px;
    letter-spacing: 0;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Sentence = styled.p`
  margin: 0;
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.5;

  b {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
`;

const Stamp = styled.span<{ $tone: HighlightTone }>`
  position: absolute;
  top: ${({ theme }) => theme.space[4]}px;
  right: ${({ theme }) => theme.space[4]}px;
  padding: 1px 7px;
  border: 1.5px solid ${({ theme, $tone }) => toneColor(theme, $tone)};
  border-radius: 4px;
  color: ${({ theme, $tone }) => toneColor(theme, $tone)};
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transform: rotate(-4deg);
  opacity: 0.9;
`;

const Evidence = styled(Link)`
  align-self: flex-start;
  font-size: 13px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.brandText};
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;

  &:hover {
    color: ${({ theme }) => theme.colors.brand};
  }
`;

const Bar = styled.div`
  height: 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgMuted};
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    border-radius: 3px;
    transition: width 700ms ${({ theme }) => theme.motion.easing};
  }
`;

function toneColor(theme: { colors: { income: string; expense: string; warning: string; textMuted: string } }, tone: HighlightTone) {
  return tone === 'positive' ? theme.colors.income : tone === 'negative' ? theme.colors.expense : tone === 'warning' ? theme.colors.warning : theme.colors.textMuted;
}

const STAMP: Record<HighlightTone, string | null> = { positive: 'Nice', warning: 'Watch', negative: 'Alert', neutral: null };

interface Rendered {
  icon: Icon;
  label: string;
  figure: ReactNode;
  sentence: ReactNode;
  featured?: boolean;
  extra?: ReactNode;
}

function render(h: Highlight, money: (v: string | number, opts?: { compact?: boolean }) => string, count: (v: string) => ReactNode, theme: ReturnType<typeof useTheme>): Rendered {
  const monthName = (m: string) => dayjs(`${m}-01`).format('MMMM');
  switch (h.kind) {
    case 'spending_pace': {
      const diff = Number(h.difference);
      const progress = Math.min(100, (Number(h.spentSoFar) / Math.max(1, Number(h.projected))) * 100);
      return {
        icon: TrendUp,
        label: 'Spending pace',
        featured: true,
        figure: (
          <>
            {count(h.projected)}
            <small>projected</small>
          </>
        ),
        sentence: (
          <>
            <b>{money(h.spentSoFar)}</b> spent in {h.dayOfMonth} of {h.daysInMonth} days. At this pace that&apos;s{' '}
            <b>{money(Math.abs(diff))}</b> {diff >= 0 ? 'more' : 'less'} than last month.
          </>
        ),
        extra: (
          <Bar aria-hidden>
            <span style={{ width: `${progress}%`, background: toneColor(theme, h.tone) }} />
          </Bar>
        ),
      };
    }
    case 'category_spike':
      return {
        icon: ChartLineUp,
        label: `${h.category} in ${monthName(h.month)}`,
        featured: true,
        figure: (
          <>
            +{h.percentAbove}%<small>vs 3-month average</small>
          </>
        ),
        sentence: (
          <>
            You spent <b>{money(h.amount)}</b> on {h.category.toLowerCase()}, compared with a usual <b>{money(h.average)}</b>. Cutting back
            to normal saves about <b>{money(Number(h.amount) - Number(h.average))}</b> a month.
          </>
        ),
      };
    case 'top_merchant':
      return {
        icon: Storefront,
        label: 'Top merchant this month',
        figure: count(h.amount),
        sentence: (
          <>
            <b>{h.merchant}</b>: {h.count} {h.count === 1 ? 'payment' : 'payments'}, about <b>{money(h.perVisit)}</b> each.
          </>
        ),
      };
    case 'biggest_expense':
      return {
        icon: Receipt,
        label: 'Biggest expense',
        figure: count(h.amount),
        sentence: (
          <>
            <b>{h.description}</b> on {dayjs(h.date).format('D MMM')}.
          </>
        ),
      };
    case 'small_purchases':
      return {
        icon: Coffee,
        label: `Under ${money(h.threshold, { compact: true })}`,
        figure: (
          <>
            {h.count}
            <small>small buys</small>
          </>
        ),
        sentence: (
          <>
            Little purchases in the last {h.days} days added up to <b>{money(h.total)}</b>. That&apos;s about{' '}
            <b>{money(Number(h.total) * 12, { compact: true })}</b> a year.
          </>
        ),
      };
    case 'no_spend_days':
      return {
        icon: CalendarCheck,
        label: 'No-spend days',
        figure: (
          <>
            {h.days}
            <small>of {h.daysSoFar} days</small>
          </>
        ),
        sentence: <>Days this month with no everyday spending. Streaks like these add up quietly.</>,
        extra: (
          <Bar aria-hidden>
            <span style={{ width: `${(h.days / h.daysSoFar) * 100}%`, background: theme.colors.income }} />
          </Bar>
        ),
      };
    case 'weekend_spending':
      return {
        icon: Sun,
        label: 'Weekends vs weekdays',
        figure: (
          <>
            {h.ratio >= 1 ? `${h.ratio}×` : `${Math.round((1 - h.ratio) * 100)}%`}
            <small>{h.ratio >= 1 ? 'per weekend day' : 'lower on weekends'}</small>
          </>
        ),
        sentence: (
          <>
            You spend <b>{money(h.weekendPerDay)}</b> per weekend day and <b>{money(h.weekdayPerDay)}</b> per weekday (last {h.days} days).
          </>
        ),
      };
    case 'subscriptions':
      return {
        icon: ArrowsClockwise,
        label: `${h.count} recurring ${h.count === 1 ? 'payment' : 'payments'}`,
        figure: (
          <>
            {count(h.monthly)}
            <small>/ month</small>
          </>
        ),
        sentence: h.priceIncreases.length ? (
          <>
            That&apos;s <b>{money(h.yearly)}</b> a year. Prices went up for <b>{h.priceIncreases.join(', ')}</b>.
          </>
        ) : (
          <>
            That&apos;s <b>{money(h.yearly)}</b> a year in subscriptions, EMIs and bills.
          </>
        ),
      };
    case 'fees_paid':
      return {
        icon: Coins,
        label: `Fees & interest in ${h.year}`,
        figure: count(h.total),
        sentence: (
          <>
            Across {h.count} {h.count === 1 ? 'charge' : 'charges'}: late fees, card interest and bank charges you might avoid.
          </>
        ),
      };
    case 'cash_runway':
      return {
        icon: Lifebuoy,
        label: 'Cash runway',
        figure: (
          <>
            {h.months}
            <small>months</small>
          </>
        ),
        sentence: (
          <>
            Your bank and cash balance of <b>{money(h.liquid, { compact: true })}</b> covers about {h.months} months of typical spending (
            {money(h.averageMonthlyExpenses, { compact: true })}/month).
          </>
        ),
      };
    case 'savings_rate':
      return {
        icon: PiggyBank,
        label: `Saved in ${monthName(h.month)}`,
        figure: `${h.rate}%`,
        sentence:
          h.previousRate === null ? (
            <>Of your income, after all spending.</>
          ) : (
            <>
              Of your income, {h.rate >= h.previousRate ? 'up' : 'down'} from <b>{h.previousRate}%</b> the month before.
            </>
          ),
      };
  }
}

/** "This month, in numbers": deterministic findings rendered as annotated notes. */
export function Highlights({ items, loading, currency, limit }: { items: Highlight[] | undefined; loading: boolean; currency: string; limit?: number }) {
  const theme = useTheme();
  const format = useMoney();
  const reduced = useReducedMotion();
  const money = (v: string | number, opts?: { compact?: boolean }) => format(v, currency, opts);
  const count = (v: string) => <CountUp value={v} format={(n) => format(n, currency)} />;

  if (loading) {
    return (
      <Grid>
        {Array.from({ length: limit ?? 6 }, (_, i) => (
          <Note key={i} $tone="neutral" $index={i} $animate={false}>
            <Skeleton active paragraph={{ rows: 2 }} />
          </Note>
        ))}
      </Grid>
    );
  }
  if (!items?.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Highlights appear once you have a few weeks of transactions." />;
  }

  // Featured findings first, then the rest in engine order.
  const rendered = items.map((h) => ({ h, r: render(h, money, count, theme) }));
  rendered.sort((a, b) => Number(!!b.r.featured) - Number(!!a.r.featured));
  const shown = limit ? rendered.slice(0, limit).map((x) => ({ ...x, r: { ...x.r, featured: false } })) : rendered;

  return (
    <Grid>
      {shown.map(({ h, r }, index) => {
        const stamp = STAMP[h.tone];
        const IconComponent = r.icon;
        return (
          <Note key={h.id} className={r.featured ? 'featured' : undefined} $tone={h.tone} $index={index} $animate={!reduced}>
            {stamp && <Stamp $tone={h.tone}>{stamp}</Stamp>}
            <Label>
              <IconComponent size={16} weight="duotone" aria-hidden />
              {r.label}
            </Label>
            <Figure>{r.figure}</Figure>
            <Sentence>{r.sentence}</Sentence>
            {r.extra}
            {h.evidence && <Evidence href={`/transactions?${new URLSearchParams(h.evidence).toString()}`}>See transactions →</Evidence>}
          </Note>
        );
      })}
    </Grid>
  );
}
