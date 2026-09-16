'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { CategoryType } from '@arvo/types';
import { App, Button, Card, Col, Divider, Flex, Form, Input, Popconfirm, Row, Segmented, Select, Space, Switch, Tag, Tree, Typography } from 'antd';
import { DesktopOutlined, MoonFilled, SunFilled, UndoOutlined } from '@ant-design/icons';
import { AiConnections } from '../../../components/ai-connections';
import { PAGE_SIZE_OPTIONS } from '../../../components/data-table';
import { PERIOD_OPTIONS } from '../../../lib/periods';
import { usePreferences } from '../../../lib/preferences';
import { useThemeMode, type ThemePreference } from '../../../lib/theme-mode';
import { useMemo } from 'react';
import { CategorySelect } from '../../../components/category-select';
import { PageHeader } from '../../../components/page-header';
import { api, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { titleCase } from '../../../lib/format';
import { useCategories, useLedgerMutation } from '../../../lib/queries';
import type { Category } from '../../../lib/types';

export default function SettingsPage() {
  const { user, reloadUser } = useAuth();
  const { preferences, update, reset } = usePreferences();
  const { preference: themePreference, setPreference: setThemePreference } = useThemeMode();
  const { message } = App.useApp();
  const categories = useCategories();
  const [profileForm] = Form.useForm();
  const [categoryForm] = Form.useForm<{ name: string; type: CategoryType; parentId?: string | null }>();

  const saveProfile = useLedgerMutation((values: { name: string; currency: string; timezone: string }) =>
    api('/me', { method: 'PATCH', body: values }),
  );
  const createCategory = useLedgerMutation((values: { name: string; type: CategoryType; parentId?: string | null }) =>
    api('/categories', { method: 'POST', body: { ...values, parentId: values.parentId ?? undefined } }),
  );
  const deleteCategory = useLedgerMutation((id: string) => api(`/categories/${id}`, { method: 'DELETE' }));

  const tree = useMemo(() => {
    const all = categories.data ?? [];
    const build = (parentId: string | null): { key: string; title: React.ReactNode; children: unknown[] }[] =>
      all
        .filter((c) => c.parentId === parentId)
        .map((c: Category) => ({
          key: c.id,
          title: (
            <Space size={6}>
              {c.name}
              {parentId === null && <Tag variant="filled">{titleCase(c.type)}</Tag>}
              {!c.isSystem && (
                <Popconfirm
                  title={`Delete "${c.name}"?`}
                  description="Transactions in it become uncategorized."
                  onConfirm={() =>
                    deleteCategory.mutateAsync(c.id).then(
                      () => message.success('Category deleted'),
                      (e) => message.error(errorMessage(e)),
                    )
                  }
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          ),
          children: build(c.id),
        }));
    return build(null);
  }, [categories.data, deleteCategory, message]);

  return (
    <>
      <PageHeader title="Settings" />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Profile" style={{ marginBottom: 16 }}>
            <Form
              form={profileForm}
              layout="vertical"
              requiredMark={false}
              initialValues={user ?? undefined}
              onFinish={async (values) => {
                try {
                  await saveProfile.mutateAsync(values);
                  await reloadUser();
                  message.success('Profile saved');
                } catch (e) {
                  message.error(errorMessage(e));
                }
              }}
            >
              <Form.Item label="Email">
                <Input value={user?.email} disabled />
              </Form.Item>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Row gutter={12}>
                <Col span={10}>
                  <Form.Item name="currency" label="Base currency" rules={[{ pattern: /^[A-Z]{3}$/ }]}>
                    <Input maxLength={3} />
                  </Form.Item>
                </Col>
                <Col span={14}>
                  <Form.Item name="timezone" label="Timezone">
                    <Select showSearch options={Intl.supportedValuesOf('timeZone').map((tz) => ({ value: tz, label: tz }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={saveProfile.isPending}>
                Save profile
              </Button>
            </Form>
          </Card>
          <Card
            title="Preferences"
            extra={
              <Popconfirm title="Reset all preferences on this browser?" onConfirm={() => { reset(); setThemePreference('system'); message.success('Preferences reset'); }}>
                <Button type="text" icon={<UndoOutlined />}>
                  Reset
                </Button>
              </Popconfirm>
            }
          >
            <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
              Saved in this browser only.
            </Typography.Paragraph>
            <Flex vertical gap={14}>
              <PreferenceRow label="Theme">
                <Segmented<ThemePreference>
                  value={themePreference}
                  onChange={setThemePreference}
                  options={[
                    { value: 'light', label: 'Light', icon: <SunFilled /> },
                    { value: 'dark', label: 'Dark', icon: <MoonFilled /> },
                    { value: 'system', label: 'System', icon: <DesktopOutlined /> },
                  ]}
                />
              </PreferenceRow>
              <PreferenceRow label="Collapse sidebar">
                <Switch checked={preferences.sidebarCollapsed} onChange={(sidebarCollapsed) => update({ sidebarCollapsed })} />
              </PreferenceRow>
              <PreferenceRow label="Reduce motion" hint="Turns off animations and count-ups">
                <Switch checked={preferences.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
              </PreferenceRow>

              <Divider style={{ margin: '4px 0' }} titlePlacement="start" plain>
                Tables
              </Divider>
              <PreferenceRow label="Density">
                <Segmented<'small' | 'middle' | 'large'>
                  value={preferences.tableDensity}
                  onChange={(tableDensity) => update({ tableDensity })}
                  options={[
                    { value: 'small', label: 'Compact' },
                    { value: 'middle', label: 'Comfortable' },
                    { value: 'large', label: 'Spacious' },
                  ]}
                />
              </PreferenceRow>
              <PreferenceRow label="Rows per page">
                <Select
                  value={preferences.pageSize}
                  onChange={(pageSize) => update({ pageSize })}
                  style={{ width: 100 }}
                  options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: n }))}
                />
              </PreferenceRow>
              <PreferenceRow label="Striped rows">
                <Switch checked={preferences.stripedRows} onChange={(stripedRows) => update({ stripedRows })} />
              </PreferenceRow>
              <PreferenceRow label="Limit table height" hint="Long tables scroll under a fixed header">
                <Switch checked={preferences.compactTables} onChange={(compactTables) => update({ compactTables })} />
              </PreferenceRow>
              <PreferenceRow label="Hidden columns">
                <Button
                  size="small"
                  disabled={Object.values(preferences.hiddenColumns).every((keys) => keys.length === 0)}
                  onClick={() => update({ hiddenColumns: {} })}
                >
                  Show all
                </Button>
              </PreferenceRow>

              <Divider style={{ margin: '4px 0' }} titlePlacement="start" plain>
                Numbers & dates
              </Divider>
              <PreferenceRow label="Show paise" hint="₹1,234.50 instead of ₹1,235">
                <Switch checked={preferences.showDecimals} onChange={(showDecimals) => update({ showDecimals })} />
              </PreferenceRow>
              <PreferenceRow label="Dashboard period">
                <Select
                  value={preferences.defaultPeriod}
                  onChange={(defaultPeriod) => update({ defaultPeriod })}
                  style={{ width: 150 }}
                  options={PERIOD_OPTIONS}
                />
              </PreferenceRow>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <div style={{ marginBottom: 16 }}>
            <AiConnections />
          </div>
          <Card title="Categories">
            <Form
              form={categoryForm}
              layout="inline"
              initialValues={{ type: CategoryType.EXPENSE }}
              style={{ marginBottom: 16, rowGap: 8 }}
              onFinish={async (values) => {
                try {
                  await createCategory.mutateAsync(values);
                  categoryForm.resetFields();
                  message.success('Category created');
                } catch (e) {
                  message.error(errorMessage(e));
                }
              }}
            >
              <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
                <Input placeholder="New category" />
              </Form.Item>
              <Form.Item name="type">
                <Select style={{ width: 120 }} options={Object.values(CategoryType).map((t) => ({ value: t, label: titleCase(t) }))} />
              </Form.Item>
              <Form.Item name="parentId">
                <CategorySelect placeholder="Parent (optional)" />
              </Form.Item>
              <Button htmlType="submit" icon={<PlusOutlined />} loading={createCategory.isPending}>
                Add
              </Button>
            </Form>
            <Tree treeData={tree as never} selectable={false} blockNode style={{ maxHeight: 520, overflow: 'auto' }} />
          </Card>
        </Col>
      </Row>
    </>
  );
}

function PreferenceRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Flex justify="space-between" align="center" gap={16} wrap>
      <div>
        <Typography.Text>{label}</Typography.Text>
        {hint && (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {hint}
          </Typography.Text>
        )}
      </div>
      {children}
    </Flex>
  );
}
