import type { ReactNode } from 'react';
import { WorkspaceHeader } from '../../../components/workspace-header';

/**
 * The Money workspace: everyday banking, spending and planning. A route group, so every path
 * below is unchanged (/dashboard, /accounts, …) and only the framing differs.
 */
export default function MoneyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WorkspaceHeader />
      {children}
    </>
  );
}
