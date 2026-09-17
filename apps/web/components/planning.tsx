'use client';

import styled, { css } from 'styled-components';

export type StampTone = 'positive' | 'warning' | 'negative' | 'neutral';

/** Small uppercase status stamp, ruled like a ledger mark. */
export const Stamp = styled.span<{ $tone: StampTone }>`
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: ${({ theme }) => theme.radii.sm}px;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  ${({ theme, $tone }) => {
    const map = {
      positive: [theme.colors.income, theme.colors.incomeSubtle],
      warning: [theme.colors.warning, theme.colors.warningSubtle],
      negative: [theme.colors.expense, theme.colors.expenseSubtle],
      neutral: [theme.colors.textMuted, 'transparent'],
    } as const;
    const [fg, bg] = map[$tone];
    return css`
      color: ${fg};
      background: ${bg};
    `;
  }}
`;

/** Serif headline figure. */
export const Figure = styled.span<{ $size?: number }>`
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: ${({ $size = 26 }) => $size}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  font-variant-numeric: lining-nums tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.1;
`;

export const Eyebrow = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Track = styled.div`
  position: relative;
  height: 10px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.borderSubtle};
`;

const Fill = styled.div<{ $tone: StampTone; $width: number }>`
  position: absolute;
  inset: 0 auto 0 0;
  width: ${({ $width }) => $width}%;
  border-radius: inherit;
  background: ${({ theme, $tone }) =>
    ({ positive: theme.colors.income, warning: theme.colors.warning, negative: theme.colors.expense, neutral: theme.colors.brand })[$tone]};
  transition: width 0.4s ease;
`;

const Marker = styled.div<{ $left: number }>`
  position: absolute;
  top: -5px;
  bottom: -5px;
  left: ${({ $left }) => $left}%;
  width: 2px;
  margin-left: -1px;
  background: ${({ theme }) => theme.colors.textPrimary};

  &::after {
    content: attr(data-label);
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
    white-space: nowrap;
  }
`;

/** Horizontal progress bar with an optional marker (e.g. "today" or "expected"). */
export function PaceBar({ percent, marker, markerLabel, tone }: { percent: number; marker?: number; markerLabel?: string; tone: StampTone }) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return (
    <Track role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <Fill $tone={tone} $width={clamp(percent)} />
      {marker !== undefined && <Marker $left={clamp(marker)} data-label={markerLabel} title={markerLabel} />}
    </Track>
  );
}
