'use client';

import { Card, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import styled from 'styled-components';

const Value = styled.div<{ $tone?: 'positive' | 'negative' }>`
  margin-top: ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  color: ${({ theme, $tone }) =>
    $tone === 'positive' ? theme.colors.income : $tone === 'negative' ? theme.colors.expense : theme.colors.textPrimary};
`;

export function StatCard({
  label,
  value,
  hint,
  tone,
  loading,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'positive' | 'negative';
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Card style={{ height: '100%' }}>
      <Typography.Text type="secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </Typography.Text>
      {loading ? (
        <Skeleton.Input active size="small" style={{ marginTop: 12 }} />
      ) : (
        <Value $tone={tone}>{value}</Value>
      )}
      {hint && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Typography.Text>
      )}
    </Card>
  );
}
