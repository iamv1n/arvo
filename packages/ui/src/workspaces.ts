import type { ColorMode, ColorTokens } from './tokens';

/**
 * Arvo is two products in one platform. Each workspace keeps the same canvas, ink and money
 * semantics but carries its own accent, so it is obvious at a glance which one you are in.
 *
 * The accent is a thin layer over the resolved palette (see `resolveColors`), which means a
 * workspace recolors selection, links, primary buttons, charts and the ink-card rule without
 * any component knowing a workspace exists.
 */
export type WorkspaceId = 'money' | 'markets';

export interface WorkspaceMeta {
  id: WorkspaceId;
  name: string;
  /** One line describing what the workspace is for; shown in the switcher and header strip. */
  purpose: string;
}

export const WORKSPACES: Record<WorkspaceId, WorkspaceMeta> = {
  money: { id: 'money', name: 'Money', purpose: 'Everyday banking, spending and planning.' },
  markets: { id: 'markets', name: 'Markets', purpose: 'Investing, trading and market research.' },
};

export const WORKSPACE_IDS: WorkspaceId[] = ['money', 'markets'];

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return value === 'money' || value === 'markets';
}

export const DEFAULT_WORKSPACE: WorkspaceId = 'money';

/**
 * Accent overrides per workspace and mode. Money keeps whatever the active palette gives it;
 * Markets takes a deep steel indigo that sits beside Dusk's copper without fighting it, and
 * stays AA-legible on both the light and dark canvases.
 */
export const workspaceAccents: Record<WorkspaceId, Record<ColorMode, Partial<ColorTokens>>> = {
  money: { light: {}, dark: {} },
  markets: {
    light: {
      brand: '#33518c',
      brandHover: '#3f63a8',
      brandActive: '#27406f',
      brandSubtle: '#e7ecf7',
      brandText: '#27406f',
      brandGradient: 'linear-gradient(135deg, #22355c 0%, #33518c 55%, #3f77a8 100%)',
      inkSurface: '#141b2e',
      chart: ['#33518c', '#0f766e', '#b45309', '#9f1239', '#6d28d9', '#0369a1', '#4d7c0f', '#a16207', '#94a3b8'],
    },
    dark: {
      brand: '#8aa9e8',
      brandHover: '#aac2f0',
      brandActive: '#6f92dd',
      brandSubtle: '#18213a',
      brandText: '#aac2f0',
      brandGradient: 'linear-gradient(135deg, #1d2a4a 0%, #33518c 55%, #3f77a8 100%)',
      chart: ['#8aa9e8', '#2dd4bf', '#fbbf24', '#fb7185', '#c4b5fd', '#38bdf8', '#a3e635', '#fcd34d', '#94a3b8'],
    },
  },
};
