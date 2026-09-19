'use client';

import { workspaceAccents, WORKSPACES, type WorkspaceId } from '@arvo/ui';
import { ArrowUpRight } from '@phosphor-icons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';

/**
 * A link that leaves the workspace you are in. Money and Markets are separate products, so
 * crossing between them is announced rather than silent: the badge names the destination
 * workspace and wears its accent, not the current one.
 */

const CrossLink = styled(Link)<{ $accent: string }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  max-width: 100%;
  padding: 3px ${({ theme }) => theme.space[2]}px 3px 3px;
  border: 1px dashed ${({ $accent }) => $accent};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover,
  &:focus-visible {
    color: ${({ $accent }) => $accent};
    border-style: solid;
  }

  .badge {
    padding: 2px ${({ theme }) => theme.space[2]}px;
    border-radius: ${({ theme }) => theme.radii.pill}px;
    background: ${({ $accent }) => $accent};
    color: #fff;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
`;

export function WorkspaceLink({ to, href, children }: { to: WorkspaceId; href: string; children: ReactNode }) {
  const theme = useTheme();
  const accent = workspaceAccents[to][theme.mode].brand ?? theme.colors.brand;
  return (
    <CrossLink href={href} $accent={accent} title={`Opens in the ${WORKSPACES[to].name} workspace`}>
      <span className="badge">{WORKSPACES[to].name}</span>
      <span>{children}</span>
      <ArrowUpRight size={14} weight="bold" aria-hidden />
    </CrossLink>
  );
}
