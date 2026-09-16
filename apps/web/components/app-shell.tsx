'use client';

import {
  BarChartOutlined,
  BankOutlined,
  SyncOutlined,
  DashboardOutlined,
  LogoutOutlined,
  SettingOutlined,
  SwapOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import { useAuth } from '../lib/auth';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/accounts', icon: <BankOutlined />, label: 'Accounts' },
  { key: '/transactions', icon: <UnorderedListOutlined />, label: 'Transactions' },
  { key: '/transfers', icon: <SwapOutlined />, label: 'Transfers' },
  { key: '/analytics', icon: <BarChartOutlined />, label: 'Analytics' },
  { key: '/recurring', icon: <SyncOutlined />, label: 'Recurring' },
  { key: '/imports', icon: <UploadOutlined />, label: 'Imports' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

const Brand = styled(Link)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  height: 72px;
  padding: 0 ${({ theme }) => theme.space[6]}px;
  font-size: ${({ theme }) => theme.typography.fontSize.xl}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  letter-spacing: -0.03em;
  color: ${({ theme }) => theme.colors.textPrimary};

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

export const LogoMark = styled.span`
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.brandGradient};
  box-shadow: ${({ theme }) => theme.shadows.brand};
  color: ${({ theme }) => theme.colors.onBrand};
  font-size: 18px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
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
          theme="light"
          style={{ position: 'sticky', top: 0, height: '100dvh', borderInlineEnd: `1px solid ${theme.colors.borderSubtle}` }}
        >
          <Brand href="/dashboard">
            <LogoMark aria-hidden />
            Arvo
          </Brand>
          {menu}
        </Layout.Sider>
      )}
      <Drawer open={isMobile && drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" size={260} title="Arvo">
        {menu}
      </Drawer>
      <Layout>
        <Bar>
          {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} aria-label="Menu" />}
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
              <Avatar style={{ cursor: 'pointer', background: theme.colors.brandGradient, fontWeight: 600 }}>
                {user?.name.charAt(0).toUpperCase() || <UserOutlined />}
              </Avatar>
            </Dropdown>
          </div>
        </Bar>
        <Content>{children}</Content>
      </Layout>
    </Layout>
  );
}
