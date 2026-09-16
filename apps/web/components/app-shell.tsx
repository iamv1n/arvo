'use client';

import {
  BankOutlined,
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
import styled from 'styled-components';
import { useAuth } from '../lib/auth';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/accounts', icon: <BankOutlined />, label: 'Accounts' },
  { key: '/transactions', icon: <UnorderedListOutlined />, label: 'Transactions' },
  { key: '/transfers', icon: <SwapOutlined />, label: 'Transfers' },
  { key: '/imports', icon: <UploadOutlined />, label: 'Imports' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

const Brand = styled(Link)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  height: 64px;
  padding: 0 ${({ theme }) => theme.space[6]}px;
  font-size: ${({ theme }) => theme.typography.fontSize.xl}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::before {
    content: '';
    width: 10px;
    height: 10px;
    border-radius: ${({ theme }) => theme.radii.pill}px;
    background: ${({ theme }) => theme.colors.brand};
  }
`;

const Bar = styled(Layout.Header)`
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: 0 ${({ theme }) => theme.space[6]}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
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
        <Layout.Sider width={232} theme="light" style={{ position: 'sticky', top: 0, height: '100dvh' }}>
          <Brand href="/dashboard">Arvo</Brand>
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
              <Avatar style={{ cursor: 'pointer' }} icon={<UserOutlined />}>
                {user?.name.charAt(0).toUpperCase()}
              </Avatar>
            </Dropdown>
          </div>
        </Bar>
        <Content>{children}</Content>
      </Layout>
    </Layout>
  );
}
