'use client';

import { DeleteOutlined, MinusCircleOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { TransactionType } from '@arvo/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Empty, Flex, Form, Input, Modal, Popconfirm, Select, Switch, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { titleCase } from '../../lib/format';
import { useCategories } from '../../lib/queries';
import { CategorySelect } from '../category-select';
import { FieldGrid } from '../mono-label';
import { SectionIntro } from './setting-row';

type Field = 'description' | 'merchant' | 'amount' | 'direction';
type Operator = 'contains' | 'equals' | 'starts_with' | 'gte' | 'lte';

interface Rule {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  conditions: { field: Field; operator: Operator; value: string }[];
  actions: { categoryId?: string; merchantName?: string; type?: TransactionType };
}

const OPERATORS: Record<Field, { value: Operator; label: string }[]> = {
  description: [
    { value: 'contains', label: 'contains' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'equals', label: 'is' },
  ],
  merchant: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'is' },
  ],
  amount: [
    { value: 'gte', label: 'at least' },
    { value: 'lte', label: 'at most' },
    { value: 'equals', label: 'exactly' },
  ],
  direction: [{ value: 'equals', label: 'is' }],
};

const FIELD_LABEL: Record<Field, string> = { description: 'Description', merchant: 'Merchant', amount: 'Amount', direction: 'Direction' };

export function RuleSettings() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const rules = useQuery({ queryKey: ['rules'], queryFn: () => api<{ items: Rule[] }>('/rules', { query: { limit: 500 } }).then((r) => r.items) });
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['rules'] });
  const create = useMutation({ mutationFn: (body: unknown) => api('/rules', { method: 'POST', body }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api(`/rules/${id}`, { method: 'PATCH', body: { isActive } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api(`/rules/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  const describe = (rule: Rule) =>
    rule.conditions.map((c) => `${FIELD_LABEL[c.field]} ${OPERATORS[c.field].find((o) => o.value === c.operator)?.label ?? c.operator} “${c.value}”`).join(' and ');

  return (
    <Card
      title={<SectionIntro title="Rules">Rules run first when importing statements, in order from top to bottom.</SectionIntro>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          New rule
        </Button>
      }
    >
      {rules.data?.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No rules yet. Example: description contains “swiggy” → Food › Delivery" />
      ) : (
        <Flex vertical gap={8}>
          {rules.data?.map((rule, i) => (
            <Flex key={rule.id} align="center" gap={12} wrap style={{ padding: '12px 14px', borderRadius: 6, border: '1px solid var(--ant-color-border-secondary)', opacity: rule.isActive ? 1 : 0.55 }}>
              <Tag variant="filled">{i + 1}</Tag>
              <ThunderboltOutlined />
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography.Text strong>{rule.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                  If {describe(rule)} →{' '}
                  {[
                    rule.actions.categoryId && `category ${categoryName.get(rule.actions.categoryId) ?? '…'}`,
                    rule.actions.merchantName && `merchant ${rule.actions.merchantName}`,
                    rule.actions.type && `type ${titleCase(rule.actions.type)}`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </Typography.Text>
              </div>
              <Switch size="small" checked={rule.isActive} onChange={(isActive) => toggle.mutate({ id: rule.id, isActive })} aria-label="Active" />
              <Popconfirm title="Delete this rule?" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(rule.id)}>
                <Button type="text" danger icon={<DeleteOutlined />} aria-label="Delete rule" />
              </Popconfirm>
            </Flex>
          ))}
        </Flex>
      )}

      <Modal
        open={open}
        title="New rule"
        okText="Create rule"
        width={640}
        confirmLoading={create.isPending}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        onOk={async () => {
          const v = await form.validateFields();
          const actions = { categoryId: v.categoryId || undefined, merchantName: v.merchantName?.trim() || undefined, type: v.type || undefined };
          if (!actions.categoryId && !actions.merchantName && !actions.type) {
            message.warning('Choose at least one thing the rule should set');
            return;
          }
          try {
            await create.mutateAsync({ name: v.name, conditions: v.conditions, actions });
            message.success('Rule created');
            form.resetFields();
            setOpen(false);
          } catch (e) {
            message.error(errorMessage(e));
          }
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ conditions: [{ field: 'description', operator: 'contains', value: '' }] }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
            <Input placeholder="Food delivery" />
          </Form.Item>
          <Typography.Text strong>When</Typography.Text>
          <Form.List name="conditions">
            {(fields, { add, remove: removeField }) => (
              <Flex vertical gap={8} style={{ margin: '8px 0 16px' }}>
                {fields.map((field) => (
                  <Flex key={field.key} gap={8} align="start" wrap>
                    {/* Field, operator and value each keep a readable minimum and wrap to the
                        next line rather than collapsing to a 60px box in a narrow modal. */}
                    <Form.Item name={[field.name, 'field']} noStyle>
                      <Select
                        style={{ flex: '1 1 130px', minWidth: 120 }}
                        options={Object.entries(FIELD_LABEL).map(([value, label]) => ({ value, label }))}
                        onChange={(f: Field) => form.setFieldValue(['conditions', field.name, 'operator'], OPERATORS[f][0].value)}
                      />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate>
                      {() => {
                        const f: Field = form.getFieldValue(['conditions', field.name, 'field']) ?? 'description';
                        return (
                          <>
                            <Form.Item name={[field.name, 'operator']} noStyle>
                              <Select style={{ flex: '1 1 120px', minWidth: 110 }} options={OPERATORS[f]} />
                            </Form.Item>
                            <Form.Item name={[field.name, 'value']} rules={[{ required: true, message: 'Value' }]} style={{ flex: '2 1 160px', minWidth: 140, marginBottom: 0 }}>
                              {f === 'direction' ? (
                                <Select options={[{ value: 'OUT', label: 'Money out' }, { value: 'IN', label: 'Money in' }]} />
                              ) : (
                                <Input placeholder={f === 'amount' ? '500' : 'swiggy'} inputMode={f === 'amount' ? 'decimal' : undefined} />
                              )}
                            </Form.Item>
                          </>
                        );
                      }}
                    </Form.Item>
                    {fields.length > 1 && <Button type="text" icon={<MinusCircleOutlined />} onClick={() => removeField(field.name)} aria-label="Remove condition" />}
                  </Flex>
                ))}
                {fields.length < 10 && (
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ field: 'description', operator: 'contains', value: '' })} style={{ alignSelf: 'flex-start' }}>
                    Add condition
                  </Button>
                )}
              </Flex>
            )}
          </Form.List>
          <Typography.Text strong>Then set</Typography.Text>
          <FieldGrid $min={150} style={{ marginTop: 8 }}>
            <Form.Item name="categoryId" style={{ marginBottom: 0 }}>
              <CategorySelect placeholder="Category" style={{ width: '100%', minWidth: 0 }} />
            </Form.Item>
            <Form.Item name="merchantName" style={{ marginBottom: 0 }}>
              <Input placeholder="Merchant name" />
            </Form.Item>
            <Form.Item name="type" style={{ marginBottom: 0 }}>
              <Select allowClear placeholder="Type" style={{ width: '100%' }} options={Object.values(TransactionType).map((t) => ({ value: t, label: titleCase(t) }))} />
            </Form.Item>
          </FieldGrid>
        </Form>
      </Modal>
    </Card>
  );
}
