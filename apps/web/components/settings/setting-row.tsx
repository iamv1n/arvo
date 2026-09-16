'use client';

import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import styled from 'styled-components';

const Row = styled.div`
  padding: ${({ theme }) => theme.space[4]}px 0;
  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
`;

/** One labelled setting: title and optional description on the left, control on the right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Row>
      <Flex justify="space-between" align="center" gap={24} wrap>
        <div style={{ minWidth: 220, flex: 1 }}>
          <Typography.Text strong>{label}</Typography.Text>
          {hint && (
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
              {hint}
            </Typography.Text>
          )}
        </div>
        {children}
      </Flex>
    </Row>
  );
}

export function SectionIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      {children && (
        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          {children}
        </Typography.Paragraph>
      )}
    </div>
  );
}
