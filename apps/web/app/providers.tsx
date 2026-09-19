'use client';

import { createAntdTheme, createStyledTheme } from '@arvo/ui';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { AuthProvider } from '../lib/auth';
import { PreferencesProvider } from '../lib/preferences';
import { createGlobalStyle, ThemeProvider } from 'styled-components';
import { StyledComponentsRegistry } from '../lib/styled-registry';
import { ThemeModeProvider, useThemeMode } from '../lib/theme-mode';
import { WorkspaceProvider, useWorkspace } from '../lib/workspace';

const GlobalStyle = createGlobalStyle`
  body {
    background: ${({ theme }) => theme.colors.bgCanvas};
    color: ${({ theme }) => theme.colors.textPrimary};
    font-family: ${({ theme }) => theme.typography.fontFamily};
    -webkit-font-smoothing: antialiased;
  }

  ::selection {
    background: ${({ theme }) => theme.colors.brandSubtle};
    color: ${({ theme }) => theme.colors.brandText};
  }

  /* Editorial type: serif card titles and page-level headings, mono ledger figures. */
  .ant-card-head-title,
  .ant-modal-title,
  .ant-result-title {
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
    letter-spacing: -0.01em;
  }
  .ant-card-head-title {
    font-size: 18px;
  }

  /* Tables inside cards follow the card's rounded shape instead of drawing their own corners. */
  .ant-card {
    overflow: hidden;
  }
  .ant-card .ant-card-body > .ant-table-wrapper .ant-table,
  .ant-card .ant-card-body > .ant-table-wrapper .ant-table-container,
  .ant-card .ant-card-body > div > .ant-table-wrapper .ant-table,
  .ant-card .ant-card-body > div > .ant-table-wrapper .ant-table-container,
  .ant-card .ant-table-wrapper .ant-table-container table > thead > tr:first-child > *:first-child,
  .ant-card .ant-table-wrapper .ant-table-container table > thead > tr:first-child > *:last-child {
    border-radius: 0 !important;
  }
  .ant-card .ant-table-wrapper .ant-table-tbody > tr:last-child > td {
    border-bottom: none;
  }
  .ant-card .ant-table-wrapper .ant-table-pagination.ant-pagination {
    margin: 0;
    padding: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[4]}px;
    border-top: 1px solid ${({ theme }) => theme.colors.border};
  }
  .ant-card .ant-card-head + .ant-card-body > .ant-table-wrapper .ant-table-thead > tr > th,
  .ant-card .ant-card-head + .ant-card-body > div > .ant-table-wrapper .ant-table-thead > tr > th {
    border-top: none;
  }
  .ant-table-wrapper .ant-table-tbody > tr.arvo-row-striped > td {
    background: ${({ theme }) => (theme.mode === 'light' ? theme.colors.bgCanvas : theme.colors.bgSurfaceRaised)};
  }

  /* Cards that are links or clickable lift slightly on hover. */
  .ant-card-hoverable {
    transition: transform ${({ theme }) => theme.motion.normal} ${({ theme }) => theme.motion.easing},
      box-shadow ${({ theme }) => theme.motion.normal};
  }
  .ant-card-hoverable:hover {
    transform: translateY(-2px);
  }

  @keyframes arvo-fade-up {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }
  .arvo-page {
    animation: arvo-fade-up 280ms ${({ theme }) => theme.motion.easing} both;
  }

  html[data-reduce-motion='true'] *,
  html[data-reduce-motion='true'] *::before,
  html[data-reduce-motion='true'] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .arvo-page { animation: none; }
  }

  /* Active sidebar item: bold with a brand gradient accent. */
  .ant-layout-sider .ant-menu-item-selected {
    position: relative;
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
  .ant-layout-sider .ant-menu-inline .ant-menu-item-selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: ${({ theme }) => theme.colors.brand};
  }

  /* A modal body scrolls inside itself rather than pushing its buttons off a short screen.
     Modals that size their own body (the enlarged charts) set a max-height of their own. */
  .ant-modal .ant-modal-body {
    max-height: calc(100vh - 220px);
    overflow-y: auto;
    overflow-x: hidden;
  }
  .ant-modal-centered .ant-modal-body {
    max-height: calc(100vh - 180px);
  }

  /* ---- Markets workspace: a denser, more instrument-like reading of the same system. ----
     Money keeps the editorial warmth; Markets trades a little air for figures per screen. */
  .arvo-workspace-markets {
    .arvo-figure,
    .ant-statistic-content-value,
    .ant-statistic-content-prefix,
    .ant-statistic-content-suffix {
      font-family: ${({ theme }) => theme.typography.fontFamilyMono};
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }

    /* Figures read as a column: right-aligned wherever a cell holds only an amount. */
    .ant-table-tbody > tr > td > .arvo-figure:only-child,
    .ant-table-tbody > tr > td > span:only-child > .arvo-figure:only-child {
      display: block;
      text-align: right;
    }

    /* Subtle grid lines rather than open rows. */
    .ant-table-wrapper .ant-table-thead > tr > th,
    .ant-table-wrapper .ant-table-tbody > tr > td {
      border-inline-end: 1px solid ${({ theme }) => theme.colors.borderSubtle};
    }
    .ant-table-wrapper .ant-table-thead > tr > th:last-child,
    .ant-table-wrapper .ant-table-tbody > tr > td:last-child {
      border-inline-end: none;
    }
    .ant-table-wrapper .ant-table-thead > tr > th {
      font-family: ${({ theme }) => theme.typography.fontFamilyMono};
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    /* Card titles stay editorial, but the chrome tightens up. */
    .ant-card-head {
      min-height: 48px;
    }
  }

  /* Thin, theme-aware scrollbars. */
  * {
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.colors.border} transparent;
  }
`;

function ThemedApp({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode();
  /* The active workspace layers its accent over the palette, so every antd and
     styled-components surface below picks it up without knowing workspaces exist. */
  const { workspace } = useWorkspace();
  const antdTheme = useMemo(() => createAntdTheme(mode, undefined, workspace), [mode, workspace]);
  const styledTheme = useMemo(() => createStyledTheme(mode, undefined, workspace), [mode, workspace]);

  return (
    <ConfigProvider theme={antdTheme}>
      <ThemeProvider theme={styledTheme}>
        <GlobalStyle />
        <AntdApp>{children}</AntdApp>
      </ThemeProvider>
    </ConfigProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <StyledComponentsRegistry>
      <AntdRegistry>
        <ThemeModeProvider>
          <QueryClientProvider client={queryClient}>
            <WorkspaceProvider>
              <ThemedApp>
                <PreferencesProvider>
                  <AuthProvider>{children}</AuthProvider>
                </PreferencesProvider>
              </ThemedApp>
            </WorkspaceProvider>
          </QueryClientProvider>
        </ThemeModeProvider>
      </AntdRegistry>
    </StyledComponentsRegistry>
  );
}
