'use client';

import { ApiOutlined, BgColorsOutlined, TagsOutlined, UserOutlined } from '@ant-design/icons';
import { Flex, Grid, Tabs } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AiConnections } from '../../../components/ai-connections';
import { PageHeader } from '../../../components/page-header';
import { AppearanceSettings, TableSettings } from '../../../components/settings/appearance-settings';
import { CategorySettings } from '../../../components/settings/category-settings';
import { ProfileSettings } from '../../../components/settings/profile-settings';
import { RuleSettings } from '../../../components/settings/rule-settings';
import { SecuritySettings } from '../../../components/settings/security-settings';

const TABS = [
  { key: 'account', label: 'Account', icon: <UserOutlined />, content: (
      <Flex vertical gap={16}>
        <ProfileSettings />
        <SecuritySettings />
      </Flex>
    ),
  },
  {
    key: 'preferences',
    label: 'Preferences',
    icon: <BgColorsOutlined />,
    content: (
      <Flex vertical gap={16}>
        <AppearanceSettings />
        <TableSettings />
      </Flex>
    ),
  },
  {
    key: 'categorization',
    label: 'Categorization',
    icon: <TagsOutlined />,
    content: (
      <Flex vertical gap={16}>
        <RuleSettings />
        <CategorySettings />
      </Flex>
    ),
  },
  { key: 'ai', label: 'AI assistants', icon: <ApiOutlined />, content: <AiConnections /> },
];

function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const active = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'account';

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, how Arvo looks, categorization and connected assistants." />
      <Tabs
        activeKey={active}
        onChange={(tab) => router.replace(`/settings?tab=${tab}`)}
        tabPlacement={screens.lg ? 'start' : 'top'}
        items={TABS.map((t) => ({
          key: t.key,
          label: (
            <Flex gap={8} align="center" style={{ minWidth: screens.lg ? 150 : undefined }}>
              {t.icon}
              {t.label}
            </Flex>
          ),
          children: <div style={{ maxWidth: 880 }}>{t.content}</div>,
        }))}
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
