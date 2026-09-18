'use client';

import { Flask } from '@phosphor-icons/react';
import { Tooltip } from 'antd';
import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { NoticeStrip } from '../notice-strip';
import { NoteMarker } from './notes-drawer';

/*
 * Pieces every lab tab uses.
 *
 * The banner is the important one. Everything in /lab is a model applied to numbers the user
 * typed or a replay of bars they uploaded, and at a glance a payoff chart looks exactly like a
 * forecast. So the banner is not a footnote — it sits above the tabs, on every tab.
 */

/** The standing disclaimer as a one-line strip at the very top of the lab. */
export function LabBanner() {
  return (
    <NoticeStrip
      storageKey="arvo.lab.banner"
      defaultState="open"
      icon={<Flask size={13} weight="duotone" aria-hidden />}
      headline="Educational simulation — not investment advice. No live orders."
      detail="Every figure here comes from a model applied to inputs you chose, or from replaying price data you imported. Nothing is a forecast, nothing is a recommendation, and Arvo has no connection to any broker."
    />
  );
}

/**
 * A caveat. It no longer prints itself into the panel: it registers with the drawer on the right
 * and leaves a small marker, so the numbers keep their space and the conditions stay one click
 * away. `type` is kept for the callers that flag a warning rather than an explanation.
 */
export function LabNote({
  text,
  type = 'info',
  title,
}: {
  text: ReactNode;
  type?: 'info' | 'warning';
  title?: ReactNode;
}) {
  return <NoteMarker tone={type} title={title} body={text} />;
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
export function Extreme({
  amount,
  unlimited,
  format,
}: {
  amount: string | null;
  unlimited: boolean;
  format: (value: string) => string;
}) {
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

/*
 * Form furniture for the lab.
 *
 * Every lab form is a wall of three-to-six character numbers. Laid out in antd's 24-column
 * thirds each one gets a whole row to itself and the left column runs twice as tall as the
 * results beside it. So instead: a grid that packs as many fields per row as the column can
 * hold, with a 10px mono label above each input rather than an addon stealing half the width.
 */
export const Fields = styled.div<{ $min?: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(${({ $min = 118 }) => $min}px, 1fr));
  gap: 8px;
  margin-top: 6px;
  min-width: 0;
`;

export const Field = styled.label`
  display: grid;
  gap: 3px;
  min-width: 0;

  > span {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* antd sizes its own controls; this just stops any of them overflowing the cell. */
  .ant-input-number,
  .ant-picker,
  .ant-select {
    width: 100%;
  }
`;

const Disclosure = styled.div`
  margin-top: 10px;

  > button {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
    border-bottom: 1px dotted ${({ theme }) => theme.colors.border};
  }
  > button:hover,
  > button:focus-visible {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/** Inputs nobody changes twice a year (rates, slippage, lot size) folded away behind one line. */
export function Advanced({ label = 'Advanced', children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '−' : '+'} {label}
      </button>
      {open ? children : null}
    </Disclosure>
  );
}

/** A form column that stays beside its results instead of stretching the page. */
export const FormScroll = styled.div<{ $max?: number }>`
  max-height: ${({ $max = 420 }) => $max}px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
`;
