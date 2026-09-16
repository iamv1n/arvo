'use client';

import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import { ThemeToggle } from '../../components/theme-toggle';

const Page = styled.main`
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: ${({ theme }) => theme.space[6]}px;
  background:
    radial-gradient(50rem 36rem at 0% 0%, ${({ theme }) => theme.colors.brandSubtle}, transparent 60%),
    radial-gradient(40rem 30rem at 100% 100%, ${({ theme }) => theme.colors.incomeSubtle}, transparent 60%),
    ${({ theme }) => theme.colors.bgCanvas};
`;

const Corner = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.space[4]}px;
  right: ${({ theme }) => theme.space[4]}px;
`;

const Wordmark = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  margin-bottom: ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  letter-spacing: -0.02em;

  &::before {
    content: 'A';
    display: inline-grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: ${({ theme }) => theme.radii.md}px;
    background: ${({ theme }) => theme.colors.brandGradient};
    box-shadow: ${({ theme }) => theme.shadows.brand};
    color: ${({ theme }) => theme.colors.onBrand};
    font-size: 20px;
  }
`;

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const theme = useTheme();
  return (
    <Page>
      <Corner>
        <ThemeToggle />
      </Corner>
      <Card style={{ width: '100%', maxWidth: 420, boxShadow: theme.shadows.lg }} styles={{ body: { padding: 36 } }}>
        <Wordmark>Arvo</Wordmark>
        <Typography.Paragraph type="secondary">{title}</Typography.Paragraph>
        {children}
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, textAlign: 'center' }}>
          {footer}
        </Typography.Paragraph>
      </Card>
    </Page>
  );
}
