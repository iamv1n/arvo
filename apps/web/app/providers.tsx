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

const GlobalStyle = createGlobalStyle`
  body {
    background:
      radial-gradient(60rem 30rem at 12% -8%, ${({ theme }) => theme.colors.brandSubtle}, transparent 70%),
      radial-gradient(40rem 24rem at 100% 0%, ${({ theme }) => (theme.mode === 'light' ? 'rgba(34, 184, 201, 0.07)' : 'rgba(31, 163, 179, 0.08)')}, transparent 70%),
      ${({ theme }) => theme.colors.bgCanvas};
    background-attachment: fixed;
    color: ${({ theme }) => theme.colors.textPrimary};
    font-family: ${({ theme }) => theme.typography.fontFamily};
    -webkit-font-smoothing: antialiased;
  }

  ::selection {
    background: ${({ theme }) => theme.colors.brandSubtle};
    color: ${({ theme }) => theme.colors.brandText};
  }

  /* Primary actions carry the brand gradient. */
  .ant-btn.ant-btn-variant-solid.ant-btn-color-primary:not(:disabled) {
    background: ${({ theme }) => theme.colors.brandGradient};
    background-size: 160% 100%;
    background-position: 0% 0%;
    border: none;
    transition: background-position ${({ theme }) => theme.motion.normal} ${({ theme }) => theme.motion.easing},
      transform ${({ theme }) => theme.motion.fast}, box-shadow ${({ theme }) => theme.motion.normal};
  }
  .ant-btn.ant-btn-variant-solid.ant-btn-color-primary:not(:disabled):hover {
    background-position: 100% 0%;
    transform: translateY(-1px);
  }
  .ant-btn.ant-btn-variant-solid.ant-btn-color-primary:not(:disabled):active {
    transform: translateY(0);
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
    background: ${({ theme }) => theme.colors.brandGradient};
  }

  /* Thin, theme-aware scrollbars. */
  * {
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.colors.border} transparent;
  }
`;

function ThemedApp({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode();
  const antdTheme = useMemo(() => createAntdTheme(mode), [mode]);
  const styledTheme = useMemo(() => createStyledTheme(mode), [mode]);

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
            <ThemedApp>
              <PreferencesProvider>
                <AuthProvider>{children}</AuthProvider>
              </PreferencesProvider>
            </ThemedApp>
          </QueryClientProvider>
        </ThemeModeProvider>
      </AntdRegistry>
    </StyledComponentsRegistry>
  );
}
