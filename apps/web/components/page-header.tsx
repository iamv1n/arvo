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

  /* Titles are real data (an account name, an uploaded filename): they wrap rather than run
     past the right edge and give the page a horizontal scrollbar. */
  .arvo-page-heading {
    min-width: 0;
    flex: 1 1 260px;
    overflow-wrap: anywhere;
  }
`;

export function PageHeader({ title, subtitle, extra }: { title: string; subtitle?: ReactNode; extra?: ReactNode }) {
  return (
    <Header>
      <div className="arvo-page-heading">
        <Typography.Title
          level={3}
          style={{ margin: 0, fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 500, fontSize: 'clamp(24px, 4.5vw, 32px)', letterSpacing: '-0.02em', lineHeight: 1.15 }}
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
