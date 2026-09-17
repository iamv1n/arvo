'use client';

import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import { PixelLogo } from '../../components/logo';
import { ThemeToggle } from '../../components/theme-toggle';

const Page = styled.main`
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: ${({ theme }) => theme.space[6]}px;
  /* Faint ledger ruling, like the statement paper on the site. */
  background-color: ${({ theme }) => theme.colors.bgCanvas};
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 31px,
    ${({ theme }) => theme.colors.borderSubtle} 31px,
    ${({ theme }) => theme.colors.borderSubtle} 32px
  );
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
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 32px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  letter-spacing: -0.02em;

`;

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const theme = useTheme();
  return (
    <Page>
      <Corner>
        <ThemeToggle />
      </Corner>
      <Card style={{ width: '100%', maxWidth: 420, boxShadow: theme.shadows.lg }} styles={{ body: { padding: 36 } }}>
        <Wordmark style={{ ['--arvo-logo-accent' as string]: theme.colors.brand }}>
          <PixelLogo size={34} />
          Arvo
        </Wordmark>
        <Typography.Paragraph type="secondary">{title}</Typography.Paragraph>
        {children}
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, textAlign: 'center' }}>
          {footer}
        </Typography.Paragraph>
      </Card>
    </Page>
  );
}
