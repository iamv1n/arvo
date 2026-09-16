'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { CategoryType } from '@arvo/types';
import { App, Button, Card, Empty, Flex, Form, Input, Popconfirm, Segmented, Select, Space, Tag, Tree } from 'antd';
import { useMemo, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { titleCase } from '../../lib/format';
import { useCategories, useLedgerMutation } from '../../lib/queries';
import { CategorySelect } from '../category-select';
import { SectionIntro } from './setting-row';

export function CategorySettings() {
  const { message } = App.useApp();
  const categories = useCategories();
  const [form] = Form.useForm<{ name: string; type: CategoryType; parentId?: string | null }>();
  const [type, setType] = useState<CategoryType>(CategoryType.EXPENSE);
  const [search, setSearch] = useState('');

  const create = useLedgerMutation((values: { name: string; type: CategoryType; parentId?: string | null }) =>
    api('/categories', { method: 'POST', body: { ...values, parentId: values.parentId ?? undefined } }),
  );
  const remove = useLedgerMutation((id: string) => api(`/categories/${id}`, { method: 'DELETE' }));

  const tree = useMemo(() => {
    const all = (categories.data ?? []).filter((c) => c.type === type);
    const term = search.trim().toLowerCase();
    const matches = (id: string): boolean => {
      const c = all.find((x) => x.id === id)!;
      return !term || c.name.toLowerCase().includes(term) || all.some((child) => child.parentId === id && matches(child.id));
    };
    const build = (parentId: string | null): { key: string; title: React.ReactNode; children: unknown[] }[] =>
      all
        .filter((c) => c.parentId === parentId && matches(c.id))
        .map((c) => ({
          key: c.id,
          title: (
            <Space size={6}>
              {c.name}
              {c.isSystem ? <Tag variant="filled">System</Tag> : <Tag color="green" variant="filled">Yours</Tag>}
              {!c.isSystem && (
                <Popconfirm
                  title={`Delete "${c.name}"?`}
                  description="Transactions in it become uncategorized."
                  onConfirm={() => remove.mutateAsync(c.id).then(() => message.success('Category deleted'), (e) => message.error(errorMessage(e)))}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete category" />
                </Popconfirm>
              )}
            </Space>
          ),
          children: build(c.id),
        }));
    return build(null);
  }, [categories.data, type, search, remove, message]);

  return (
    <Card title={<SectionIntro title="Categories">System categories are shared and read-only. Add your own anywhere in the tree.</SectionIntro>}>
      <Form
        form={form}
        layout="inline"
        style={{ rowGap: 8, marginBottom: 20 }}
        initialValues={{ type: CategoryType.EXPENSE }}
        onFinish={async (values) => {
          try {
            await create.mutateAsync(values);
            form.resetFields();
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
        <Button htmlType="submit" type="primary" icon={<PlusOutlined />} loading={create.isPending}>
          Add
        </Button>
      </Form>
      <Flex gap={12} wrap style={{ marginBottom: 12 }}>
        <Segmented<CategoryType> value={type} onChange={setType} options={Object.values(CategoryType).map((t) => ({ value: t, label: titleCase(t) }))} />
        <Input.Search allowClear placeholder="Find a category" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
      </Flex>
      {tree.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No categories match" />
      ) : (
        <Tree treeData={tree as never} selectable={false} blockNode defaultExpandAll={!!search} key={`${type}-${!!search}`} style={{ maxHeight: 520, overflow: 'auto' }} />
      )}
    </Card>
  );
}
