'use client';

import { DesktopOutlined, MoonFilled, SunFilled, UndoOutlined } from '@ant-design/icons';
import { App, Button, Card, Popconfirm, Segmented, Select, Switch } from 'antd';
import { PAGE_SIZE_OPTIONS } from '../data-table';
import { PERIOD_OPTIONS } from '../../lib/periods';
import { usePreferences } from '../../lib/preferences';
import { useThemeMode, type ThemePreference } from '../../lib/theme-mode';
import { PalettePicker } from '../palette-picker';
import { SectionIntro, SettingRow } from './setting-row';

export function AppearanceSettings() {
  const { preferences, update, reset } = usePreferences();
  const { preference, setPreference, setPalette } = useThemeMode();
  const { message } = App.useApp();
  return (
    <Card
      extra={
        <Popconfirm
          title="Reset appearance and display preferences?"
          onConfirm={() => {
            reset();
            setPreference('system');
            setPalette('ledger');
            message.success('Preferences reset');
          }}
        >
          <Button type="text" icon={<UndoOutlined />}>
            Reset
          </Button>
        </Popconfirm>
      }
      title={<SectionIntro title="Appearance">Saved in this browser only.</SectionIntro>}
    >
      <SettingRow label="Theme" hint="System follows your device setting">
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'light', label: 'Light', icon: <SunFilled /> },
            { value: 'dark', label: 'Dark', icon: <MoonFilled /> },
            { value: 'system', label: 'System', icon: <DesktopOutlined /> },
          ]}
        />
      </SettingRow>
      <SettingRow label="Light palette" hint="Canvas, ink and accent colors for the light theme">
        <PalettePicker />
      </SettingRow>
      <SettingRow label="Collapse sidebar" hint="Show icons only in the navigation">
        <Switch checked={preferences.sidebarCollapsed} onChange={(sidebarCollapsed) => update({ sidebarCollapsed })} />
      </SettingRow>
      <SettingRow label="Reduce motion" hint="Turn off animations and number count-ups">
        <Switch checked={preferences.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
      </SettingRow>
      <SettingRow label="Show paise" hint="₹1,234.50 instead of ₹1,235">
        <Switch checked={preferences.showDecimals} onChange={(showDecimals) => update({ showDecimals })} />
      </SettingRow>
      <SettingRow label="Default dashboard period">
        <Select value={preferences.defaultPeriod} onChange={(defaultPeriod) => update({ defaultPeriod })} style={{ width: 160 }} options={PERIOD_OPTIONS} />
      </SettingRow>
    </Card>
  );
}

export function TableSettings() {
  const { preferences, update } = usePreferences();
  const hiddenCount = Object.values(preferences.hiddenColumns).reduce((n, keys) => n + keys.length, 0);
  return (
    <Card title={<SectionIntro title="Tables">How lists of transactions, imports and other data are shown. Saved in this browser only.</SectionIntro>}>
      <SettingRow label="Density">
        <Segmented<'small' | 'middle' | 'large'>
          value={preferences.tableDensity}
          onChange={(tableDensity) => update({ tableDensity })}
          options={[
            { value: 'small', label: 'Compact' },
            { value: 'middle', label: 'Comfortable' },
            { value: 'large', label: 'Spacious' },
          ]}
        />
      </SettingRow>
      <SettingRow label="Rows per page">
        <Select value={preferences.pageSize} onChange={(pageSize) => update({ pageSize })} style={{ width: 110 }} options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: n }))} />
      </SettingRow>
      <SettingRow label="Striped rows">
        <Switch checked={preferences.stripedRows} onChange={(stripedRows) => update({ stripedRows })} />
      </SettingRow>
      <SettingRow label="Limit table height" hint="Long tables scroll under a fixed header instead of stretching the page">
        <Switch checked={preferences.compactTables} onChange={(compactTables) => update({ compactTables })} />
      </SettingRow>
      <SettingRow label="Hidden columns" hint={hiddenCount ? `${hiddenCount} hidden across tables. Use the ⚙ button on any table to change.` : 'All columns visible. Use the ⚙ button on any table to hide some.'}>
        <Button disabled={!hiddenCount} onClick={() => update({ hiddenColumns: {} })}>
          Show all
        </Button>
      </SettingRow>
    </Card>
  );
}
