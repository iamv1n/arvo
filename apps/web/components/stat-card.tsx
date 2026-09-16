'use client';

import { Card, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import styled, { css } from 'styled-components';

export type StatTone = 'brand' | 'positive' | 'negative' | 'info' | 'warning';

const Badge = styled.span<{ $tone: StatTone }>`
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  font-size: 17px;
  ${({ theme, $tone }) => {
    const map = {
      brand: [theme.colors.brandSubtle, theme.colors.brandText],
      positive: [theme.colors.incomeSubtle, theme.colors.income],
      negative: [theme.colors.expenseSubtle, theme.colors.expense],
      info: [theme.colors.transferSubtle, theme.colors.transfer],
      warning: [theme.colors.warningSubtle, theme.colors.warning],
    } as const;
    const [bg, fg] = map[$tone];
    return css`
      background: ${bg};
      color: ${fg};
    `;
  }}
`;

const Value = styled.div<{ $tone?: 'positive' | 'negative' }>`
  margin-top: ${({ theme }) => theme.space[3]}px;
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: ${({ theme, $tone }) =>
    $tone === 'positive' ? theme.colors.income : $tone === 'negative' ? theme.colors.expense : theme.colors.textPrimary};
`;

const Hero = styled.div`
  position: relative;
  overflow: hidden;
  height: 100%;
  padding: ${({ theme }) => theme.space[6]}px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.brandGradient};
  color: ${({ theme }) => theme.colors.onBrand};
  box-shadow: ${({ theme }) => theme.shadows.brand};

  &::after {
    content: '';
    position: absolute;
    right: -60px;
    top: -60px;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
  }

  .label {
    display: flex;
    align-items: center;
    gap: ${({ theme }) => theme.space[2]}px;
    opacity: 0.85;
  }

  .value {
    margin-top: ${({ theme }) => theme.space[3]}px;
    font-size: ${({ theme }) => theme.typography.fontSize['3xl']}px;
    font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .hint {
    margin-top: ${({ theme }) => theme.space[2]}px;
    font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
    opacity: 0.85;
  }
`;

export function StatCard({
  label,
  value,
  hint,
  tone,
  loading,
  icon,
  iconTone,
  variant = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'positive' | 'negative';
  loading?: boolean;
  icon?: ReactNode;
  iconTone?: StatTone;
  variant?: 'default' | 'hero';
}) {
  if (variant === 'hero') {
    return (
      <Hero>
        <div className="label">
          {icon}
          {label}
        </div>
        {loading ? <Skeleton.Input active size="small" style={{ marginTop: 16 }} /> : <div className="value">{value}</div>}
        {hint && <div className="hint">{hint}</div>}
      </Hero>
    );
  }
  return (
    <Card style={{ height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && <Badge $tone={iconTone ?? (tone === 'positive' ? 'positive' : tone === 'negative' ? 'negative' : 'brand')}>{icon}</Badge>}
        <Typography.Text type="secondary" style={{ fontWeight: 500 }}>
          {label}
        </Typography.Text>
      </div>
      {loading ? <Skeleton.Input active size="small" style={{ marginTop: 16 }} /> : <Value $tone={tone}>{value}</Value>}
      {hint && (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {hint}
        </Typography.Text>
      )}
    </Card>
  );
}
