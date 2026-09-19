import type { ReactNode } from 'react';
import { WorkspaceHeader } from '../../../components/workspace-header';

/**
 * The Markets workspace: investing, trading and research. A route group, so /portfolio,
 * /trading, /lab and /markets keep their URLs and only the framing differs.
 */
export default function MarketsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WorkspaceHeader />
      {children}
    </>
  );
}
