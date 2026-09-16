'use client';

import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { ThemeToggle } from '../../components/theme-toggle';

const Page = styled.main`
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: ${({ theme }) => theme.space[6]}px;
  background:
    radial-gradient(60rem 40rem at 10% -10%, ${({ theme }) => theme.colors.brandSubtle}, transparent 60%),
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
    content: '';
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.brand};
  }
`;

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <Page>
      <Corner>
        <ThemeToggle />
      </Corner>
      <Card style={{ width: '100%', maxWidth: 400 }} styles={{ body: { padding: 32 } }}>
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
