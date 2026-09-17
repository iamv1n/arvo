'use client';

import { createAntdTheme, createStyledTheme } from '@arvo/ui';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider } from 'antd';
import { useMemo, type ReactNode } from 'react';
import { createGlobalStyle, ThemeProvider } from 'styled-components';
import { BetaAccessProvider } from '../components/beta-access';
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
  const { mode, palette } = useThemeMode();
  const antdTheme = useMemo(() => createAntdTheme(mode, palette), [mode, palette]);
  const styledTheme = useMemo(() => createStyledTheme(mode, palette), [mode, palette]);
  return (
    <ConfigProvider theme={antdTheme}>
      <ThemeProvider theme={styledTheme}>
        <GlobalStyle />
        <AntdApp>
          <BetaAccessProvider>{children}</BetaAccessProvider>
        </AntdApp>
      </ThemeProvider>
    </ConfigProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StyledComponentsRegistry>
      <AntdRegistry>
        <ThemeModeProvider>
          <ThemedApp>{children}</ThemedApp>
        </ThemeModeProvider>
      </AntdRegistry>
    </StyledComponentsRegistry>
  );
}
