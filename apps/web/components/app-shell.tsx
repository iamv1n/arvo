'use client';

import { LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { ArrowsClockwise, ArrowsLeftRight, Bank, ChartLineUp, ChartPieSlice, Compass, FileArrowUp, Flask, Gauge, GearSix, Lightbulb, PiggyBank, Receipt, Sparkle, SquaresFour, Strategy, Target } from '@phosphor-icons/react';
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Spin } from 'antd';
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import { useAuth } from '../lib/auth';
import { usePreferences } from '../lib/preferences';
import { PixelLogo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { VerifyEmailBanner } from './verify-email-banner';

const navIcon = (Icon: typeof SquaresFour) => <Icon size={19} weight="duotone" aria-hidden />;

const NAV = [
  { key: '/dashboard', icon: navIcon(SquaresFour), label: 'Dashboard' },
  { key: '/accounts', icon: navIcon(Bank), label: 'Accounts' },
  { key: '/transactions', icon: navIcon(Receipt), label: 'Transactions' },
  { key: '/transfers', icon: navIcon(ArrowsLeftRight), label: 'Transfers' },
  { key: '/advisor', icon: navIcon(Sparkle), label: 'Advisor' },
  { key: '/insights', icon: navIcon(Lightbulb), label: 'Insights' },
  { key: '/analytics', icon: navIcon(ChartLineUp), label: 'Analytics' },
  { key: '/portfolio', icon: navIcon(ChartPieSlice), label: 'Portfolio' },
  { key: '/trading', icon: navIcon(Strategy), label: 'Trading' },
  { key: '/lab', icon: navIcon(Flask), label: 'Strategy lab' },
  { key: '/budgets', icon: navIcon(Gauge), label: 'Budgets' },
  { key: '/goals', icon: navIcon(Target), label: 'Goals' },
  { key: '/savings', icon: navIcon(PiggyBank), label: 'Save more' },
  { key: '/planner', icon: navIcon(Compass), label: 'Planner' },
  { key: '/recurring', icon: navIcon(ArrowsClockwise), label: 'Recurring' },
  { key: '/imports', icon: navIcon(FileArrowUp), label: 'Imports' },
  { key: '/settings', icon: navIcon(GearSix), label: 'Settings' },
];

const Brand = styled(Link)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  height: 72px;
  padding: 0 ${({ theme }) => theme.space[6]}px;
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 26px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.textPrimary};

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/** Pixel mark in a rounded ink tile (used on auth and consent screens). */
export const LogoMark = styled.span`
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.inkSurface};
  color: ${({ theme }) => theme.colors.onInk};
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 19px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  letter-spacing: 0;

  &::before {
    content: 'A';
  }
`;



// Note: Layout.Sider stays unstyled because its own "theme" prop would override the styled-components theme.
const Bar = styled(Layout.Header)`
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: 0 ${({ theme }) => theme.space[6]}px !important;
  background: ${({ theme }) => (theme.mode === 'light' ? 'rgba(244, 246, 251, 0.85)' : 'rgba(9, 11, 20, 0.85)')} !important;
  backdrop-filter: saturate(160%) blur(12px);
`;

const Content = styled(Layout.Content)`
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space[8]}px ${({ theme }) => theme.space[6]}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    padding: ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[4]}px;
  }
`;

const Center = styled.div`
  display: grid;
  place-items: center;
  min-height: 100dvh;
`;

export function AppShell({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAuth();
  const theme = useTheme();
  const { preferences, update } = usePreferences();
  const collapsed = preferences.sidebarCollapsed;
  const router = useRouter();
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = !screens.lg;

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated') {
    return (
      <Center>
        <Spin size="large" />
      </Center>
    );
  }

  const selected = NAV.find((item) => pathname.startsWith(item.key))?.key ?? '/dashboard';
  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selected]}
      inlineCollapsed={!isMobile && collapsed}
      style={{ borderInlineEnd: 'none' }}
      items={NAV.map((item) => ({ ...item, label: <Link href={item.key}>{item.label}</Link> }))}
      onClick={() => setDrawerOpen(false)}
    />
  );

  return (
    <Layout style={{ minHeight: '100dvh' }}>
      {!isMobile && (
        <Layout.Sider
          width={248}
          collapsedWidth={80}
          collapsed={collapsed}
          trigger={null}
          theme="light"
          style={{ position: 'sticky', top: 0, height: '100dvh', borderInlineEnd: `1px solid ${theme.colors.borderSubtle}` }}
        >
          <Brand href="/dashboard" style={collapsed ? { justifyContent: 'center', padding: 0 } : undefined} aria-label="Arvo home">
            <span style={{ color: theme.colors.textPrimary, ['--arvo-logo-accent' as string]: theme.colors.brand }}>
              <PixelLogo size={30} />
            </span>
            {!collapsed && 'Arvo'}
          </Brand>
          {menu}
        </Layout.Sider>
      )}
      <Drawer open={isMobile && drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" size={260} title="Arvo">
        {menu}
      </Drawer>
      <Layout>
        <Bar>
          {isMobile ? (
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} aria-label="Menu" />
          ) : (
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => update({ sidebarCollapsed: !collapsed })}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            />
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <ThemeToggle />
            <Dropdown
              menu={{
                items: [
                  { key: 'email', label: user?.email, disabled: true },
                  { type: 'divider' },
                  { key: 'settings', icon: <SettingOutlined />, label: <Link href="/settings">Settings</Link> },
                  { key: 'logout', icon: <LogoutOutlined />, label: 'Log out', onClick: () => void logout() },
                ],
              }}
            >
              <Avatar style={{ cursor: 'pointer', background: theme.colors.inkSurface, color: theme.colors.onInk, fontWeight: 600 }}>
                {user?.name.charAt(0).toUpperCase() || <UserOutlined />}
              </Avatar>
            </Dropdown>
          </div>
        </Bar>
        <Content>
          <VerifyEmailBanner />
          <div className="arvo-page" key={pathname}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
