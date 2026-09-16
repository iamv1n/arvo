'use client';

import { Card } from 'antd';
import type { CardProps } from 'antd';
import type { ReactNode } from 'react';

/**
 * A card with a fixed body height. Content that grows with data (lists, legends) scrolls
 * inside it, so dashboards keep a stable grid no matter how much data there is.
 */
export function Panel({
  height,
  children,
  flush = false,
  ...props
}: Omit<CardProps, 'styles'> & { height: number; children: ReactNode; flush?: boolean }) {
  return (
    <Card
      {...props}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', ...props.style }}
      styles={{
        body: {
          height,
          overflowY: 'auto',
          padding: flush ? 0 : undefined,
        },
      }}
    >
      {children}
    </Card>
  );
}
