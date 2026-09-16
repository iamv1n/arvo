'use client';

import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Segmented } from 'antd';
import { useThemeMode, type ThemePreference } from '../lib/theme-mode';

export function ThemeToggle() {
  const { preference, setPreference } = useThemeMode();
  return (
    <Segmented<ThemePreference>
      size="small"
      value={preference}
      onChange={setPreference}
      options={[
        { value: 'light', icon: <SunOutlined />, title: 'Light' },
        { value: 'system', icon: <DesktopOutlined />, title: 'System' },
        { value: 'dark', icon: <MoonOutlined />, title: 'Dark' },
      ]}
    />
  );
}
