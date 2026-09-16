'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { CategoryType } from '@arvo/types';
import { App, Button, Card, Col, Form, Input, Popconfirm, Row, Select, Space, Tag, Tree, Typography } from 'antd';
import { useMemo } from 'react';
import { CategorySelect } from '../../../components/category-select';
import { PageHeader } from '../../../components/page-header';
import { ThemeToggle } from '../../../components/theme-toggle';
import { api, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { titleCase } from '../../../lib/format';
import { useCategories, useLedgerMutation } from '../../../lib/queries';
import type { Category } from '../../../lib/types';

export default function SettingsPage() {
  const { user, reloadUser } = useAuth();
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
          <Card title="Appearance">
            <Space>
              <Typography.Text>Theme</Typography.Text>
              <ThemeToggle />
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
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
