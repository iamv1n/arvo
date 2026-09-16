'use client';

import { Empty } from 'antd';
import type { ReactNode } from 'react';
import styled from 'styled-components';

const Rows = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => theme.space[3]}px 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
`;

const Main = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Description = styled.div`
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

export interface RowItem {
  key: string;
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
}

/** Compact bordered rows (title, description, trailing value) styled from theme tokens. */
export function RowList({ items, emptyText }: { items: RowItem[]; emptyText: string }) {
  if (items.length === 0) return <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  return (
    <Rows>
      {items.map((item) => (
        <Row key={item.key}>
          <Main>
            <Title>{item.title}</Title>
            {item.description && <Description>{item.description}</Description>}
          </Main>
          {item.extra}
        </Row>
      ))}
    </Rows>
  );
}
