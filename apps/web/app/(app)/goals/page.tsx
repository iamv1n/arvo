'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Empty, Form, Input, Modal, Popconfirm, Progress, Row, Select, Skeleton, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { PageHeader } from '../../../components/page-header';
import { Eyebrow, Figure, Stamp, type StampTone } from '../../../components/planning';
import { StatCard } from '../../../components/stat-card';
import { api, errorMessage } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAccounts, useGoals, useLedgerMutation } from '../../../lib/queries';
import type { GoalProgress, GoalStatus } from '../../../lib/types';
import { useMoney } from '../../../lib/use-money';

const STATUS: Record<GoalStatus, { label: string; tone: StampTone }> = {
  on_track: { label: 'On track', tone: 'positive' },
  behind: { label: 'Behind', tone: 'warning' },
  achieved: { label: 'Achieved', tone: 'positive' },
};

const GoalCard = styled(Card)`
  height: 100%;

  .ant-card-body {
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.space[4]}px;
    /* A floor, not a ceiling: a long name or amount grows the card instead of being clipped. */
    min-height: 250px;
  }
`;

const Facts = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: ${({ theme }) => theme.space[3]}px;
  margin: auto 0 0;
  padding-top: ${({ theme }) => theme.space[3]}px;
  border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};

  > div {
    min-width: 0;
  }
  dd {
    margin: 2px 0 0;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
`;

export default function GoalsPage() {
  const money = useMoney();
  const theme = useTheme();
  const { message } = App.useApp();
  const goals = useGoals();
  const [editing, setEditing] = useState<GoalProgress | 'new' | null>(null);
  const remove = useLedgerMutation((id: string) => api(`/goals/${id}`, { method: 'DELETE' }));

  const rows = goals.data ?? [];
  const currency = rows[0]?.currency ?? 'INR';
  const open = rows.filter((g) => g.status !== 'achieved' && g.currency === currency);
  const monthly = open.reduce((sum, g) => sum + Number(g.requiredMonthly), 0);
  const saved = rows.filter((g) => g.currency === currency).reduce((sum, g) => sum + Number(g.current), 0);
  const target = rows.filter((g) => g.currency === currency).reduce((sum, g) => sum + Number(g.targetAmount), 0);

  return (
    <>
      <PageHeader
        title="Goals"
        subtitle="What you are saving for, and what it takes each month to get there on time."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            New goal
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <StatCard variant="hero" label="Needed per month" loading={goals.isPending} value={money(monthly, currency)} hint={`Across ${open.length} open goal${open.length === 1 ? '' : 's'}`} />
        </Col>
        <Col xs={24} md={8}>
          <StatCard label="Saved so far" loading={goals.isPending} value={money(saved, currency)} hint={target ? `of ${money(target, currency)} targeted` : undefined} />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label="Behind schedule"
            loading={goals.isPending}
            value={String(rows.filter((g) => g.status === 'behind').length)}
            tone={rows.some((g) => g.status === 'behind') ? 'negative' : undefined}
            hint={`${rows.filter((g) => g.status === 'achieved').length} achieved`}
          />
        </Col>
      </Row>

      {goals.isPending ? (
        <Card>
          <Skeleton active />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="No goals yet. An emergency fund is a good first one.">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Create a goal
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {rows.map((g) => {
            const status = STATUS[g.status];
            const color = status.tone === 'warning' ? theme.colors.warning : theme.colors.income;
            return (
              <Col key={g.id} xs={24} md={12} xl={8}>
                <GoalCard>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <Typography.Text strong ellipsis style={{ fontSize: 16, display: 'block' }}>
                        {g.name}
                      </Typography.Text>
                      <Eyebrow>{g.accountName ? `Tracks ${g.accountName}` : 'Manual savings'}</Eyebrow>
                    </div>
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Edit">
                        <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit" onClick={() => setEditing(g)} />
                      </Tooltip>
                      <Popconfirm title="Delete this goal?" onConfirm={() => remove.mutateAsync(g.id).catch((e) => message.error(errorMessage(e)))}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} aria-label="Delete" />
                      </Popconfirm>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Tooltip title={`Expected by now: ${g.expectedPercent}%`}>
                      <Progress type="circle" size={72} percent={g.percent} strokeColor={color} format={(p) => `${p}%`} />
                    </Tooltip>
                    <div style={{ minWidth: 0 }}>
                      <Figure>{money(g.current, g.currency)}</Figure>
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        of {money(g.targetAmount, g.currency)}
                      </Typography.Text>
                      <Stamp $tone={status.tone} style={{ marginTop: 6 }}>
                        {status.label}
                      </Stamp>
                    </div>
                  </div>
                  <Facts>
                    <div>
                      <dt><Eyebrow>Per month</Eyebrow></dt>
                      <dd>{g.status === 'achieved' ? '—' : money(g.requiredMonthly, g.currency)}</dd>
                    </div>
                    <div>
                      <dt><Eyebrow>By {formatDate(g.targetDate)}</Eyebrow></dt>
                      <dd>{g.status === 'achieved' ? 'Done' : g.monthsLeft === 0 ? 'Past due' : `${g.monthsLeft} month${g.monthsLeft === 1 ? '' : 's'} left`}</dd>
                    </div>
                  </Facts>
                </GoalCard>
              </Col>
            );
          })}
        </Row>
      )}

      <GoalFormModal goal={editing === 'new' ? undefined : (editing ?? undefined)} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

interface Values {
  name: string;
  targetAmount: string;
  targetDate: Dayjs;
  accountId?: string | null;
  savedAmount?: string;
}

function GoalFormModal({ open, goal, onClose }: { open: boolean; goal?: GoalProgress; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const accounts = useAccounts();
  const accountId = Form.useWatch('accountId', form);
  const save = useLedgerMutation((values: Values) => {
    const body = {
      name: values.name,
      targetAmount: values.targetAmount,
      targetDate: values.targetDate.format('YYYY-MM-DD'),
      accountId: values.accountId ?? null,
      savedAmount: values.accountId ? undefined : values.savedAmount || '0',
    };
    return goal ? api(`/goals/${goal.id}`, { method: 'PATCH', body }) : api('/goals', { method: 'POST', body });
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (goal) {
      form.setFieldsValue({ name: goal.name, targetAmount: goal.targetAmount, targetDate: dayjs(goal.targetDate), accountId: goal.accountId, savedAmount: goal.savedAmount });
    }
  }, [open, goal, form]);

  const onOk = async () => {
    const values = await form.validateFields();
    try {
      await save.mutateAsync(values);
      message.success(goal ? 'Goal updated' : 'Goal created');
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const moneyRule = { pattern: /^\d{1,15}(\.\d{1,4})?$/, message: 'A positive amount like 200000' };
  return (
    <Modal open={open} title={goal ? 'Edit goal' : 'New goal'} okText={goal ? 'Save' : 'Create'} onOk={onOk} onCancel={onClose} confirmLoading={save.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
          <Input placeholder="Emergency fund" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="targetAmount" label="Target amount" rules={[{ required: true }, moneyRule]}>
              <Input inputMode="decimal" placeholder="200000" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="targetDate" label="Target date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="accountId" label="Linked account" extra="Its balance counts as progress. Leave empty to track savings manually.">
          <Select
            allowClear
            placeholder="None, track manually"
            loading={accounts.isPending}
            options={(accounts.data ?? []).filter((a) => a.isActive).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          />
        </Form.Item>
        {!accountId && (
          <Form.Item name="savedAmount" label="Saved so far" rules={[moneyRule]}>
            <Input inputMode="decimal" placeholder="0" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
