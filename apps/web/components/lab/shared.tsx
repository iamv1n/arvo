'use client';

import { Flask, Info, Warning } from '@phosphor-icons/react';
import { Alert, Tooltip } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import styled from 'styled-components';

/*
 * Pieces every lab tab uses.
 *
 * The banner is the important one. Everything in /lab is a model applied to numbers the user
 * typed or a replay of bars they uploaded, and at a glance a payoff chart looks exactly like a
 * forecast. So the banner is not a footnote — it sits above the tabs, on every tab.
 */

const STORAGE_KEY = 'arvo.lab.banner';

/* A hairline strip, not a card: the disclaimer has to be seen, but it should cost the page a
   line of text, not a block. Expand reads the full wording; the cross hides it for good in this
   browser. */
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

/** The standing disclaimer as a one-line strip at the very top of the lab. */
export function LabBanner() {
  const [state, setState] = useState<'open' | 'collapsed' | 'hidden'>('collapsed');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setState(stored === 'hidden' ? 'hidden' : stored === 'collapsed' ? 'collapsed' : 'open');
    } catch {
      setState('open');
    }
  }, []);

  const set = (next: 'open' | 'collapsed' | 'hidden') => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable; the choice lasts for this view only.
    }
  };

  if (state === 'hidden') return null;
  return (
    <Strip $open={state === 'open'} role="note">
      <Flask size={13} weight="duotone" aria-hidden />
      <span className="text">
        <b>Educational simulation — not investment advice. No live orders.</b>
        {state === 'open' && (
          <>
            {' '}
            Every figure here comes from a model applied to inputs you chose, or from replaying price data you imported. Nothing is a
            forecast, nothing is a recommendation, and Arvo has no connection to any broker.
          </>
        )}
      </span>
      <button type="button" onClick={() => set(state === 'open' ? 'collapsed' : 'open')} aria-expanded={state === 'open'}>
        {state === 'open' ? 'less' : 'more'}
      </button>
      <button type="button" onClick={() => set('hidden')} aria-label="Hide this notice">
        ×
      </button>
    </Strip>
  );
}

/** A quieter in-panel version, for a specific caveat rather than the standing one. */
export function LabNote({ text, type = 'info' }: { text: ReactNode; type?: 'info' | 'warning' }) {
  return (
    <Alert
      type={type}
      showIcon
      icon={type === 'warning' ? <Warning size={17} weight="duotone" /> : <Info size={17} weight="duotone" />}
      message={text}
      style={{ marginTop: 12 }}
    />
  );
}

/** A signed figure, coloured by direction. Never a signal, only arithmetic. */
export const Signed = styled.span<{ $value: number }>`
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
  color: ${({ theme, $value }) => ($value > 0 ? theme.colors.income : $value < 0 ? theme.colors.expense : theme.colors.textPrimary)};
`;

export const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
`;

/** Fixed-height chart wrapper, so the grid never jumps as a compute resolves. */
export const ChartFrame = styled.div<{ $height: number }>`
  height: ${({ $height }) => $height}px;
  width: 100%;
`;

export const num = (value: string | number | null | undefined) => Number(value ?? 0);

/** Renders an extreme that may be unbounded, rather than printing a made-up number. */
export function Extreme({ amount, unlimited, format }: { amount: string | null; unlimited: boolean; format: (value: string) => string }) {
  if (unlimited) {
    return (
      <Tooltip title="The payoff keeps growing as the underlying moves, so there is no number to show. Size the position as if the worst case were real, because it is.">
        <span>Unlimited</span>
      </Tooltip>
    );
  }
  return <Signed $value={num(amount)}>{amount === null ? '—' : format(amount)}</Signed>;
}

export const LEG_KIND_LABELS: Record<string, string> = {
  CALL: 'Call',
  PUT: 'Put',
  FUTURE: 'Future',
  UNDERLYING: 'Underlying',
};

export const OUTLOOK_LABELS: Record<string, string> = {
  DIRECTIONAL_UP: 'Expects a rise',
  DIRECTIONAL_DOWN: 'Expects a fall',
  RANGE_BOUND: 'Expects stillness',
  VOLATILITY_UP: 'Expects movement',
  HEDGE: 'Hedge or income',
};

export const EXIT_REASON_LABELS: Record<string, string> = {
  SIGNAL: 'Exit rule',
  STOP_LOSS: 'Stop loss',
  TARGET: 'Target',
  TRAILING_STOP: 'Trailing stop',
  TIME_EXIT: 'Bar limit',
  SQUARE_OFF: 'Square-off',
  END_OF_DATA: 'Data ran out',
};
