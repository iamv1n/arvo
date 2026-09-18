'use client';

import { Broadcast } from '@phosphor-icons/react';
import { Tag, Tooltip } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import type { AlertStatus, QuoteSource } from '../../lib/markets';

/*
 * Pieces every markets tab uses.
 *
 * The banner matters most. A watchlist with live-looking prices and a list of alerts is exactly
 * the shape of a product that tells people what to buy, and Arvo does not do that. So the line
 * saying whose rules these are sits above the tabs, on every tab, in the same hairline strip
 * the lab uses.
 */

const STORAGE_KEY = 'arvo.markets.banner';

const Strip = styled.div<{ $open: boolean }>`
  display: flex;
  align-items: ${({ $open }) => ($open ? 'flex-start' : 'center')};
  gap: 8px;
  margin-bottom: ${({ theme }) => theme.space[4]}px;
  padding: ${({ $open }) => ($open ? '8px 10px' : '0 10px')};
  min-height: ${({ $open }) => ($open ? 'auto' : '22px')};
  border-left: 3px solid ${({ theme }) => theme.colors.brand};
  background: ${({ theme }) => theme.colors.brandSubtle};
  border-radius: 0 3px 3px 0;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};

  .text {
    flex: 1;
    min-width: 0;
  }
  b {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: 600;
  }
  button {
    all: unset;
    cursor: pointer;
    padding: 0 4px;
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: 11px;
  }
  button:hover,
  button:focus-visible {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/** The standing note about whose rules these are, as a one-line strip at the top of /markets. */
export function MarketsBanner() {
  const [state, setState] = useState<'open' | 'collapsed' | 'hidden'>('collapsed');

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'hidden') setState('hidden');
    } catch {
      // A browser with storage blocked simply sees the banner every time, which is fine.
    }
  }, []);

  if (state === 'hidden') return null;
  const open = state === 'open';

  return (
    <Strip $open={open} role="note">
      <Broadcast size={13} weight="duotone" aria-hidden style={{ flexShrink: 0, marginTop: open ? 2 : 0 }} />
      <span className="text">
        <b>Alerts are yours.</b>{' '}
        {open
          ? 'Arvo evaluates the rules you write and tells you what happened, with the numbers it used. It never generates a buy or sell signal, never ranks instruments, and never suggests a trade. Prices are whatever you entered, imported, or fetched from a provider you configured — a row marked stale is a row with no fresh price, and Arvo would rather say so than guess.'
          : 'Arvo evaluates the rules you write and never recommends a trade.'}
      </span>
      <button type="button" onClick={() => setState(open ? 'collapsed' : 'open')} aria-expanded={open}>
        {open ? 'Less' : 'More'}
      </button>
      <button
        type="button"
        aria-label="Hide this note"
        onClick={() => {
          setState('hidden');
          try {
            localStorage.setItem(STORAGE_KEY, 'hidden');
          } catch {
            // Nothing to do: the banner will come back next time.
          }
        }}
      >
        ✕
      </button>
    </Strip>
  );
}

const SOURCE_WORDS: Record<QuoteSource, string> = {
  MANUAL: 'You entered this price',
  BARS: 'From the price bars you imported',
  HOLDING: 'From the price on your holding',
  PROVIDER: 'From the quote provider you configured',
};

/** Where a price came from, and when it was true. The whole point is that it never pretends. */
export function PriceAge({ asOf, source, isStale }: { asOf: string | null; source: QuoteSource | null; isStale: boolean }) {
  const theme = useTheme();
  if (!asOf) return <span style={{ color: theme.colors.textMuted, fontSize: 12 }}>No price yet</span>;
  return (
    <Tooltip title={source ? SOURCE_WORDS[source] : undefined}>
      <span style={{ fontSize: 12, color: isStale ? theme.colors.warning : theme.colors.textMuted, whiteSpace: 'nowrap' }}>
        {isStale ? 'stale as of ' : 'as of '}
        {asOf}
      </span>
    </Tooltip>
  );
}

const STATUS_TONE: Record<AlertStatus, { color: string; label: string }> = {
  OK: { color: 'default', label: 'Watching' },
  TRIGGERED: { color: 'gold', label: 'Fired' },
  COOLING_DOWN: { color: 'blue', label: 'Cooling down' },
  SKIPPED_STALE: { color: 'orange', label: 'Skipped, stale data' },
  ERROR: { color: 'red', label: 'Error' },
};

export function AlertStatusTag({ status, enabled }: { status: AlertStatus | null; enabled: boolean }) {
  if (!enabled) return <Tag>Off</Tag>;
  if (!status) return <Tag color="default">Not checked yet</Tag>;
  const tone = STATUS_TONE[status];
  return <Tag color={tone.color}>{tone.label}</Tag>;
}

/**
 * A sparkline from closes, drawn inline.
 *
 * Deliberately not a chart library: it is sixty numbers in a table cell with no axes, no
 * tooltip and no legend, and the SVG below is smaller than the import would be. The fixed
 * height keeps rows from jumping as data arrives.
 */
export function Sparkline({ values, width = 84, height = 24 }: { values: string[]; width?: number; height?: number }) {
  const theme = useTheme();
  const numbers = values.map(Number).filter((n) => Number.isFinite(n));
  if (numbers.length < 2) return <span style={{ display: 'inline-block', width, height }} aria-hidden />;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const step = width / (numbers.length - 1);
  const points = numbers.map((value, index) => `${(index * step).toFixed(1)},${(height - ((value - min) / span) * height).toFixed(1)}`).join(' ');
  const rising = numbers[numbers.length - 1]! >= numbers[0]!;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${numbers.length} closes, ${rising ? 'higher' : 'lower'} than it started`}>
      <polyline points={points} fill="none" stroke={rising ? theme.colors.income : theme.colors.expense} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Empty-state copy with a single next step, in the editorial voice the rest of the app uses. */
export function Blank({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ fontFamily: theme.typography.fontFamilySerif, fontSize: 20, marginBottom: 8, color: theme.colors.textPrimary }}>{title}</div>
      <p style={{ color: theme.colors.textSecondary, marginBottom: action ? 16 : 0 }}>{body}</p>
      {action}
    </div>
  );
}
