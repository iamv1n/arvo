'use client';

import { Typography } from 'antd';
import type { ReactNode } from 'react';
import styled from 'styled-components';

const Header = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]}px;
  margin-bottom: ${({ theme }) => theme.space[6]}px;
`;

export function PageHeader({ title, subtitle, extra }: { title: string; subtitle?: ReactNode; extra?: ReactNode }) {
  return (
    <Header>
      <div>
        <Typography.Title
          level={3}
          style={{ margin: 0, fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 500, fontSize: 32, letterSpacing: '-0.02em' }}
        >
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra}
    </Header>
  );
}
