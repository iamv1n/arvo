'use client';

import { createAntdTheme, createStyledTheme } from '@arvo/ui';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { AuthProvider } from '../lib/auth';
import { createGlobalStyle, ThemeProvider } from 'styled-components';
import { StyledComponentsRegistry } from '../lib/styled-registry';
import { ThemeModeProvider, useThemeMode } from '../lib/theme-mode';

const GlobalStyle = createGlobalStyle`
  body {
    background: ${({ theme }) => theme.colors.bgCanvas};
    color: ${({ theme }) => theme.colors.textPrimary};
    font-family: ${({ theme }) => theme.typography.fontFamily};
    -webkit-font-smoothing: antialiased;
    transition: background ${({ theme }) => theme.motion.normal} ${({ theme }) => theme.motion.easing};
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
              <AuthProvider>{children}</AuthProvider>
            </ThemedApp>
          </QueryClientProvider>
        </ThemeModeProvider>
      </AntdRegistry>
    </StyledComponentsRegistry>
  );
}
