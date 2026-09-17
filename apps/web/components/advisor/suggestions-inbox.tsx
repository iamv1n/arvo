'use client';

import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Check, NotePencil, Tray, X } from '@phosphor-icons/react';
import { App, Button, Col, DatePicker, Empty, Form, Input, Modal, Row, Segmented, Select, Skeleton, Space, Switch, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { toolLabel, useResolveSuggestion, useSuggestions, type Suggestion, type SuggestionKind, type SuggestionStatus } from '../../lib/advisor';
import { errorMessage } from '../../lib/api';
import { useAccounts, useCategories } from '../../lib/queries';
import { useMoney } from '../../lib/use-money';
import { CategorySelect } from '../category-select';
import { Panel } from '../panel';
import { Eyebrow, Stamp, type StampTone } from '../planning';

const KIND_LABEL: Record<SuggestionKind, string> = { budget: 'Budget', goal: 'Goal', rule: 'Rule', scenario: 'Scenario' };
const STATUS_TONE: Record<SuggestionStatus, StampTone> = { pending: 'warning', approved: 'positive', dismissed: 'neutral' };

const Item = styled.article`
  position: relative;
  padding: ${({ theme }) => theme.space[4]}px ${({ theme }) => theme.space[5]}px;

  & + & {
    border-top: 1px dashed ${({ theme }) => theme.colors.border};
  }
`;

const Title = styled.div`
  margin: 6px 0 4px;
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 17px;
  line-height: 1.3;
`;

type Str = Record<string, string | undefined>;

function useDescribe() {
  const money = useMoney();
  const categories = useCategories();
  const accounts = useAccounts();
  const categoryName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);
  return (s: Suggestion): { title: string; detail: string } => {
    const p = s.payload;
    const str = (key: string) => (typeof p[key] === 'string' ? (p[key] as string) : '');
    switch (s.kind) {
      case 'budget':
        return { title: `${categoryName.get(str('categoryId')) ?? 'Category'} · ${money(str('amount'))} a month`, detail: p.rollover ? 'Rolls over unspent amount' : 'Monthly limit' };
      case 'goal':
        return {
          title: `${str('name')} · ${money(str('targetAmount'))}`,
          detail: `By ${dayjs(str('targetDate')).format('D MMM YYYY')}${str('accountId') ? ` · linked to ${accountName.get(str('accountId')) ?? 'an account'}` : ''}`,
        };
      case 'rule': {
        const conditions = (Array.isArray(p.conditions) ? p.conditions : []) as { field: string; operator: string; value: string }[];
        const actions = (p.actions ?? {}) as Str;
        const target = [actions.categoryId && `→ ${categoryName.get(actions.categoryId) ?? 'category'}`, actions.merchantName && `merchant ${actions.merchantName}`, actions.type && `type ${actions.type}`].filter(Boolean).join(', ');
        return { title: str('name'), detail: `${conditions.map((c) => `${c.field} ${c.operator.replace('_', ' ')} “${c.value}”`).join(' and ')} ${target}` };
      }
      case 'scenario': {
        const count = Array.isArray(p.adjustments) ? p.adjustments.length : 0;
        return { title: str('name'), detail: `${count} adjustment${count === 1 ? '' : 's'}${str('description') ? ` · ${str('description')}` : ''}` };
      }
    }
  };
}

/** Pending drafts from the advisor. Approve saves through the normal services; nothing else persists. */
export function SuggestionsInbox({ height }: { height: number }) {
  const [status, setStatus] = useState<SuggestionStatus>('pending');
  const suggestions = useSuggestions(status);
  const resolve = useResolveSuggestion();
  const { message } = App.useApp();
  const describe = useDescribe();
  const [editing, setEditing] = useState<Suggestion | null>(null);

  const act = (s: Suggestion, action: 'approve' | 'dismiss', payload?: Record<string, unknown>) =>
    resolve.mutateAsync({ id: s.id, action, payload }).then(
      () => message.success(action === 'approve' ? `${KIND_LABEL[s.kind]} saved` : 'Suggestion dismissed'),
      (e) => {
        message.error(errorMessage(e));
        throw e;
      },
    );

  const items = suggestions.data ?? [];
  return (
    <>
      <Panel
        height={height}
        flush
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Tray size={18} weight="duotone" />
            Suggestions
          </span>
        }
        extra={
          <Segmented<SuggestionStatus>
            size="small"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'dismissed', label: 'Dismissed' },
            ]}
          />
        }
      >
        {suggestions.isPending ? (
          <div style={{ padding: 20 }}>
            <Skeleton active />
          </div>
        ) : items.length === 0 ? (
          <Empty
            style={{ padding: '40px 16px' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={status === 'pending' ? 'Nothing to review. Ask the advisor to draft a budget, goal, rule or scenario.' : `No ${status} suggestions.`}
          />
        ) : (
          items.map((s) => {
            const { title, detail } = describe(s);
            return (
              <Item key={s.id}>
                <Space size={6}>
                  <Stamp $tone="neutral">{KIND_LABEL[s.kind]}</Stamp>
                  <Stamp $tone={STATUS_TONE[s.status]}>{s.edited ? 'edited · ' : ''}{s.status}</Stamp>
                  <Eyebrow>{dayjs(s.createdAt).format('D MMM')}</Eyebrow>
                </Space>
                <Title>{title}</Title>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                  {detail}
                </Typography.Text>
                <Typography.Paragraph style={{ margin: '8px 0 0', fontSize: 13 }} ellipsis={{ rows: 3, expandable: true, symbol: 'more' }}>
                  {s.rationale}
                </Typography.Paragraph>
                {s.provenance.length > 0 && <Eyebrow style={{ display: 'block', marginTop: 6 }}>Based on {[...new Set(s.provenance.map((p) => toolLabel(p.name)))].join(', ')}</Eyebrow>}
                {s.status === 'pending' && (
                  <Space size={6} style={{ marginTop: 10 }}>
                    <Button size="small" type="primary" icon={<Check size={14} />} loading={resolve.isPending && resolve.variables?.id === s.id && resolve.variables.action === 'approve'} onClick={() => void act(s, 'approve').catch(() => undefined)}>
                      Approve
                    </Button>
                    <Button size="small" icon={<NotePencil size={14} />} onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button size="small" type="text" icon={<X size={14} />} onClick={() => void act(s, 'dismiss').catch(() => undefined)}>
                      Dismiss
                    </Button>
                  </Space>
                )}
              </Item>
            );
          })
        )}
      </Panel>
      <EditSuggestionModal suggestion={editing} onClose={() => setEditing(null)} onApprove={(s, payload) => act(s, 'approve', payload).then(() => setEditing(null))} saving={resolve.isPending} />
    </>
  );
}

const moneyRule = { pattern: /^\d{1,15}(\.\d{1,4})?$/, message: 'A positive amount like 8000' };

type FormValues = Record<string, unknown> & { targetDate?: Dayjs; adjustmentsJson?: string; actions?: Str };

/** Opens the matching form prefilled with the draft; saving approves the edited version. */
function EditSuggestionModal({
  suggestion,
  onClose,
  onApprove,
  saving,
}: {
  suggestion: Suggestion | null;
  onClose: () => void;
  onApprove: (s: Suggestion, payload: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [form] = Form.useForm<FormValues>();
  const accounts = useAccounts();
  const kind = suggestion?.kind;

  useEffect(() => {
    if (!suggestion) return;
    form.resetFields();
    const p = suggestion.payload;
    if (suggestion.kind === 'goal') form.setFieldsValue({ ...p, targetDate: dayjs(p.targetDate as string) });
    else if (suggestion.kind === 'scenario') form.setFieldsValue({ name: p.name, description: p.description, adjustmentsJson: JSON.stringify(p.adjustments, null, 2) });
    else form.setFieldsValue(p);
  }, [suggestion, form]);

  const onOk = async () => {
    if (!suggestion) return;
    const v = await form.validateFields();
    let payload: Record<string, unknown>;
    switch (suggestion.kind) {
      case 'budget':
        payload = { categoryId: v.categoryId, amount: v.amount, rollover: v.rollover ?? false };
        break;
      case 'goal':
        payload = { name: v.name, targetAmount: v.targetAmount, targetDate: v.targetDate!.format('YYYY-MM-DD'), accountId: v.accountId ?? null, ...(v.savedAmount ? { savedAmount: v.savedAmount } : {}) };
        break;
      case 'rule': {
        const actions = Object.fromEntries(Object.entries(v.actions ?? {}).filter(([, value]) => value));
        payload = { name: v.name, conditions: v.conditions, actions };
        break;
      }
      case 'scenario':
        payload = { name: v.name, description: v.description || null, adjustments: JSON.parse(v.adjustmentsJson!) as unknown };
        break;
    }
    await onApprove(suggestion, payload).catch(() => undefined);
  };

  return (
    <Modal open={!!suggestion} title={kind ? `Edit ${KIND_LABEL[kind].toLowerCase()} suggestion` : ''} okText="Approve" onOk={onOk} onCancel={onClose} confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}>
        {kind === 'budget' && (
          <>
            <Form.Item name="categoryId" label="Category" rules={[{ required: true, message: 'Pick a category' }]}>
              <CategorySelect allowClear={false} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="amount" label="Monthly limit" rules={[{ required: true }, moneyRule]}>
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item name="rollover" label="Roll over unspent amount" valuePropName="checked">
              <Switch />
            </Form.Item>
          </>
        )}
        {kind === 'goal' && (
          <>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
              <Input />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="targetAmount" label="Target amount" rules={[{ required: true }, moneyRule]}>
                  <Input inputMode="decimal" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="targetDate" label="Target date" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="accountId" label="Linked account">
              <Select allowClear placeholder="None, track manually" options={(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))} />
            </Form.Item>
            <Form.Item name="savedAmount" label="Saved so far" rules={[moneyRule]}>
              <Input inputMode="decimal" placeholder="0" />
            </Form.Item>
          </>
        )}
        {kind === 'rule' && (
          <>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
              <Input />
            </Form.Item>
            <Form.List name="conditions">
              {(fields, { add, remove }) => (
                <>
                  <Eyebrow>Matches when</Eyebrow>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex', marginTop: 8 }}>
                      <Form.Item name={[field.name, 'field']} noStyle rules={[{ required: true }]}>
                        <Select style={{ width: 120 }} options={['description', 'merchant', 'amount', 'direction'].map((value) => ({ value, label: value }))} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'operator']} noStyle rules={[{ required: true }]}>
                        <Select style={{ width: 120 }} options={['contains', 'equals', 'starts_with', 'gte', 'lte'].map((value) => ({ value, label: value.replace('_', ' ') }))} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'value']} noStyle rules={[{ required: true }]}>
                        <Input style={{ width: 150 }} />
                      </Form.Item>
                      {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(field.name)} />}
                    </Space>
                  ))}
                  <Button type="dashed" size="small" icon={<PlusOutlined />} style={{ margin: '10px 0 16px' }} onClick={() => add({ field: 'description', operator: 'contains', value: '' })} disabled={fields.length >= 10}>
                    Add condition
                  </Button>
                </>
              )}
            </Form.List>
            <Form.Item name={['actions', 'categoryId']} label="Set category">
              <CategorySelect style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name={['actions', 'merchantName']} label="Set merchant">
              <Input />
            </Form.Item>
          </>
        )}
        {kind === 'scenario' && (
          <>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Description" rules={[{ max: 500 }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="adjustmentsJson"
              label="Adjustments"
              extra="Same format as the planner: category, income or one_off adjustments."
              rules={[
                {
                  validator: async (_, value: string) => {
                    const parsed: unknown = JSON.parse(value);
                    if (!Array.isArray(parsed)) throw new Error('Must be a list');
                  },
                  message: 'Enter a valid JSON list',
                },
              ]}
            >
              <Input.TextArea autoSize={{ minRows: 5, maxRows: 12 }} style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12 }} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
