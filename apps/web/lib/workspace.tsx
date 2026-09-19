'use client';

import { DEFAULT_WORKSPACE, isWorkspaceId, WORKSPACES, type WorkspaceId, type WorkspaceMeta } from '@arvo/ui';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Arvo is two products under one roof: Money (everyday banking) and Markets (investing).
 * The active workspace comes from the route when the route belongs to one, and otherwise from
 * whatever the browser last remembered — so shared pages like Settings stay where you were.
 */

const STORAGE_KEY = 'arvo.workspace';

/** Top-level route segments owned by each workspace. Anything else is shared. */
const ROUTES: Record<WorkspaceId, string[]> = {
  money: ['/dashboard', '/accounts', '/transactions', '/transfers', '/insights', '/analytics', '/budgets', '/goals', '/savings', '/planner', '/recurring', '/imports', '/advisor'],
  markets: ['/portfolio', '/trading', '/lab', '/markets'],
};

/** Where the switcher lands when you pick a workspace. */
export const WORKSPACE_HOME: Record<WorkspaceId, string> = { money: '/dashboard', markets: '/portfolio' };

/** The workspace a path belongs to, or null when the path is shared (Settings, design). */
export function workspaceForPath(pathname: string): WorkspaceId | null {
  const owns = (routes: string[]) => routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (owns(ROUTES.markets)) return 'markets';
  if (owns(ROUTES.money)) return 'money';
  return null;
}

interface WorkspaceContextValue {
  workspace: WorkspaceId;
  meta: WorkspaceMeta;
  /** True when the current route belongs to neither workspace (Settings). */
  shared: boolean;
  switchTo: (id: WorkspaceId) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const routed = workspaceForPath(pathname);
  const [remembered, setRemembered] = useState<WorkspaceId>(DEFAULT_WORKSPACE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isWorkspaceId(stored)) setRemembered(stored);
    } catch {
      // Storage unavailable; this session simply starts in the default workspace.
    }
  }, []);

  useEffect(() => {
    if (!routed) return;
    setRemembered(routed);
    try {
      localStorage.setItem(STORAGE_KEY, routed);
    } catch {
      // Ignored: remembering the workspace is a convenience, not a requirement.
    }
  }, [routed]);

  const switchTo = useCallback(
    (id: WorkspaceId) => {
      setRemembered(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // See above.
      }
      /* From a page inside a workspace, switching moves you to the other product's home.
         From a shared page it only changes the nav, so you keep the page you opened. */
      if (routed && routed !== id) router.push(WORKSPACE_HOME[id]);
    },
    [routed, router],
  );

  const workspace = routed ?? remembered;
  const value = useMemo(
    () => ({ workspace, meta: WORKSPACES[workspace], shared: routed === null, switchTo }),
    [workspace, routed, switchTo],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return context;
}
