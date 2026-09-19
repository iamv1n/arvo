'use client';

import { workspaceAccents, WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from '@arvo/ui';
import { ChartLineUp, Wallet } from '@phosphor-icons/react';
import { Tooltip } from 'antd';
import styled, { useTheme } from 'styled-components';
import { useWorkspace } from '../lib/workspace';

/**
 * The two products, side by side at the top of the nav. Picking one re-themes the app and
 * swaps the nav below it; the choice is remembered per browser (see `WorkspaceProvider`).
 */

const ICONS: Record<WorkspaceId, typeof Wallet> = { money: Wallet, markets: ChartLineUp };

const Group = styled.div<{ $collapsed: boolean }>`
  display: grid;
  grid-template-columns: ${({ $collapsed }) => ($collapsed ? '1fr' : '1fr 1fr')};
  gap: ${({ theme }) => theme.space[1]}px;
  margin: 0 ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[1]}px;
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
`;

const Entry = styled.button<{ $active: boolean; $accent: string; $collapsed: boolean }>`
  display: flex;
  flex-direction: ${({ $collapsed }) => ($collapsed ? 'row' : 'column')};
  align-items: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  gap: ${({ theme }) => theme.space[1]}px;
  min-width: 0;
  padding: ${({ theme, $collapsed }) => ($collapsed ? `${theme.space[2]}px` : `${theme.space[2]}px ${theme.space[3]}px`)};
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm}px;
  background: ${({ theme, $active }) => ($active ? theme.colors.bgSurface : 'transparent')};
  box-shadow: ${({ theme, $active }) => ($active ? theme.shadows.sm : 'none')};
  color: ${({ theme, $active, $accent }) => ($active ? $accent : theme.colors.textSecondary)};
  cursor: pointer;
  text-align: left;
  transition: background ${({ theme }) => theme.motion.fast}, color ${({ theme }) => theme.motion.fast};

  &:hover {
    color: ${({ $accent }) => $accent};
  }

  &:focus-visible {
    outline: 2px solid ${({ $accent }) => $accent};
    outline-offset: 1px;
  }

  .name {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
`;

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { workspace, switchTo } = useWorkspace();
  const theme = useTheme();
  /* Each entry wears its own product's accent, even when it isn't the active one. Money has no
     override (it follows the palette), so it falls back to the current brand colour. */
  const accentOf = (id: WorkspaceId) => workspaceAccents[id][theme.mode].brand ?? theme.colors.brand;

  return (
    <Group $collapsed={collapsed} role="group" aria-label="Workspace">
      {WORKSPACE_IDS.map((id) => {
        const Icon = ICONS[id];
        const meta = WORKSPACES[id];
        const active = workspace === id;
        const entry = (
          <Entry
            key={id}
            type="button"
            $active={active}
            $accent={accentOf(id)}
            $collapsed={collapsed}
            aria-pressed={active}
            aria-label={`${meta.name} workspace — ${meta.purpose}`}
            onClick={() => switchTo(id)}
          >
            <Icon size={18} weight={active ? 'fill' : 'duotone'} aria-hidden />
            {!collapsed && <span className="name">{meta.name}</span>}
          </Entry>
        );
        return collapsed ? (
          <Tooltip key={id} title={meta.name} placement="right">
            {entry}
          </Tooltip>
        ) : (
          entry
        );
      })}
    </Group>
  );
}
