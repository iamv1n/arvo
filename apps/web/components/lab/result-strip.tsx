'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';

/*
 * A results ribbon for computed figures (payoff, backtest, calculators).
 *
 * Stat cards are built for one round number each: a serif display figure, an icon badge, a hint.
 * Lab results are the opposite — long, signed, sometimes a word ("Unlimited"), sometimes a list
 * ("24150 · 25400"), and they change as you type. So this reads like a contract note instead:
 * mono figures that are allowed to be long, ruled cells that keep their width, and a caveat line
 * that never pushes the number around.
 */

const Strip = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0;
  margin: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  overflow: hidden;
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: ${({ theme }) => theme.space[4]}px;
  border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-left: 1px solid ${({ theme }) => theme.colors.borderSubtle};

  /* The first cell in each row has no left rule; the first row has no top rule. */
  &:first-child {
    border-left: none;
  }

  dt {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  dd {
    margin: 0;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 19px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .caveat {
    margin-top: auto;
    padding-top: 4px;
    font-size: 11px;
    line-height: 1.35;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const toned = (tone: ResultTone | undefined) => tone ?? 'neutral';

export type ResultTone = 'neutral' | 'positive' | 'negative' | 'muted';

const Figure = styled.dd<{ $tone: ResultTone }>`
  color: ${({ theme, $tone }) =>
    $tone === 'positive'
      ? theme.colors.income
      : $tone === 'negative'
        ? theme.colors.expense
        : $tone === 'muted'
          ? theme.colors.textMuted
          : theme.colors.textPrimary};
`;

export interface ResultItem {
  label: string;
  value: ReactNode;
  caveat?: ReactNode;
  tone?: ResultTone;
}

/** A row of computed results. Cells wrap at 180px, so nothing is ever squeezed to fit. */
export function ResultStrip({ items, className }: { items: ResultItem[]; className?: string }) {
  return (
    <Strip className={className}>
      {items.map((item) => (
        <Cell key={item.label}>
          <dt>{item.label}</dt>
          <Figure $tone={toned(item.tone)}>{item.value}</Figure>
          {item.caveat ? <span className="caveat">{item.caveat}</span> : null}
        </Cell>
      ))}
    </Strip>
  );
}
