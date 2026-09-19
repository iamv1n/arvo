'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';
import { useWorkspace } from '../lib/workspace';

/**
 * A thin strip above every page saying which of the two products you are in. It repeats the
 * workspace accent so the answer is available at a glance, not only from the sidebar.
 */

const Strip = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[2]}px ${({ theme }) => theme.space[3]}px;
  margin-bottom: ${({ theme }) => theme.space[5]}px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};

  .name {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.space[2]}px;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.brandText};
  }

  .name::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: ${({ theme }) => theme.colors.brand};
  }

  .purpose {
    flex: 1 1 220px;
    min-width: 0;
    font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

export function WorkspaceHeader({ extra }: { extra?: ReactNode }) {
  const { meta } = useWorkspace();
  return (
    <Strip>
      <span className="name">{meta.name}</span>
      <span className="purpose">{meta.purpose}</span>
      {extra}
    </Strip>
  );
}
