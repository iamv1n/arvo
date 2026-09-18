'use client';

import { Info } from '@phosphor-icons/react';
import { Alert, Tooltip } from 'antd';
import styled from 'styled-components';
import type { ChargeBreakdown, ChargesSource, TradeSegment, TradeStyle } from '../../lib/types';
import { Stamp, type StampTone } from '../planning';

export const SEGMENT_LABELS: Record<TradeSegment, string> = {
  EQUITY_DELIVERY: 'Delivery',
  EQUITY_INTRADAY: 'Intraday',
  EQUITY_FUTURES: 'Stock futures',
  EQUITY_OPTIONS: 'Stock options',
  INDEX_FUTURES: 'Index futures',
  INDEX_OPTIONS: 'Index options',
  CURRENCY_FUTURES: 'Currency futures',
  CURRENCY_OPTIONS: 'Currency options',
  COMMODITY_FUTURES: 'Commodity futures',
  COMMODITY_OPTIONS: 'Commodity options',
};

export const STYLE_LABELS: Record<TradeStyle, string> = {
  INTRADAY: 'Intraday',
  BTST: 'BTST',
  SWING: 'Swing',
  POSITIONAL: 'Positional',
};

export const CHARGE_LABELS: [keyof ChargeBreakdown, string][] = [
  ['brokerage', 'Brokerage'],
  ['stt', 'STT / CTT'],
  ['exchangeCharges', 'Exchange transaction'],
  ['sebiCharges', 'SEBI turnover fee'],
  ['stampDuty', 'Stamp duty'],
  ['gst', 'GST'],
  ['dpCharges', 'DP charges'],
  ['otherCharges', 'Other'],
];

/** A signed money figure, coloured by direction. Nothing here is a recommendation. */
export const Pnl = styled.span<{ $value: number }>`
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
  color: ${({ theme, $value }) => ($value > 0 ? theme.colors.income : $value < 0 ? theme.colors.expense : theme.colors.textPrimary)};
`;

export const Percent = styled.span<{ $value: number | null }>`
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ theme, $value }) =>
    $value === null ? theme.colors.textMuted : $value > 0 ? theme.colors.income : $value < 0 ? theme.colors.expense : theme.colors.textPrimary};
`;

export function PercentValue({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  return (
    <Percent $value={value}>{value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}${suffix}`}</Percent>
  );
}

export const SIDE_TONES: Record<string, StampTone> = { BUY: 'positive', SELL: 'negative' };
export const DIRECTION_TONES: Record<string, StampTone> = { LONG: 'positive', SHORT: 'warning' };

/** Says out loud whether a charge figure is the broker's or ours. */
export function ChargesSourceTag({ source }: { source: ChargesSource }) {
  const copy: Record<ChargesSource, { label: string; tone: StampTone; help: string }> = {
    BROKER: { label: 'From broker', tone: 'positive', help: 'Taken from the file you imported.' },
    MIXED: { label: 'Part estimated', tone: 'warning', help: 'Some components came from the file; the rest were worked out from the statutory rates.' },
    ESTIMATED: { label: 'Estimated', tone: 'neutral', help: 'Worked out from the statutory rates in force on the trade date and your broker plan.' },
  };
  const { label, tone, help } = copy[source];
  return (
    <Tooltip title={help}>
      <span>
        <Stamp $tone={tone}>{label}</Stamp>
      </span>
    </Tooltip>
  );
}

/**
 * The advice-level banner. Everything in /trading is level 0–1: analysis of trades already
 * made, plus education. It appears wherever a figure could be mistaken for a suggestion.
 */
export function NotAdvice({ text, style }: { text: string; style?: React.CSSProperties }) {
  return <Alert type="info" showIcon icon={<Info size={18} weight="duotone" />} message="Analysis, not advice" description={text} style={style} />;
}

/** Fixed-height wrapper for charts, so the grid never jumps as data loads. */
export const ChartFrame = styled.div<{ $height: number }>`
  height: ${({ $height }) => $height}px;
  width: 100%;
`;

export const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
`;

export const num = (value: string | number | null | undefined) => Number(value ?? 0);
