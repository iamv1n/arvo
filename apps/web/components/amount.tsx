'use client';

import { TransactionType } from '@arvo/types';
import styled from 'styled-components';
import { useMoney } from '../lib/use-money';

type Tone = 'income' | 'expense' | 'transfer' | 'neutral';

/* `arvo-figure` marks a rendered money figure, so a workspace can restyle every amount at once
   (Markets sets them in mono) without each caller opting in. */
const Value = styled.span.attrs({ className: 'arvo-figure' })<{ $tone: Tone; $size: 'sm' | 'md' | 'lg' }>`
  font-variant-numeric: tabular-nums;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  white-space: nowrap;
  font-size: ${({ theme, $size }) =>
    ({ sm: theme.typography.fontSize.sm, md: theme.typography.fontSize.md, lg: theme.typography.fontSize.xl })[$size]}px;
  color: ${({ theme, $tone }) =>
    ({
      income: theme.colors.income,
      expense: theme.colors.textPrimary,
      transfer: theme.colors.transfer,
      neutral: theme.colors.textPrimary,
    })[$tone]};
`;

export function Amount({
  value,
  currency = 'INR',
  type,
  size = 'md',
  signed = true,
}: {
  value: string;
  currency?: string;
  type?: TransactionType;
  size?: 'sm' | 'md' | 'lg';
  signed?: boolean;
}) {
  const formatMoney = useMoney();
  const n = Number(value);
  const tone: Tone =
    type === TransactionType.TRANSFER ? 'transfer' : n > 0 && signed ? 'income' : n < 0 ? 'expense' : 'neutral';
  const text = formatMoney(Math.abs(n), currency);
  return (
    <Value $tone={tone} $size={size}>
      {signed && n > 0 ? '+' : signed && n < 0 ? '−' : ''}
      {text}
    </Value>
  );
}
