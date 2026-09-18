'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Skeleton,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { CategorySelect } from '../../../components/category-select';
import { PageHeader } from '../../../components/page-header';
import { Eyebrow, Figure, PaceBar, Stamp, type StampTone } from '../../../components/planning';
import { StatCard } from '../../../components/stat-card';
import { api, errorMessage } from '../../../lib/api';
import { useBudgets, useLedgerMutation } from '../../../lib/queries';
import type { BudgetPacing, BudgetStatus } from '../../../lib/types';
import { useMoney } from '../../../lib/use-money';

const STATUS: Record<BudgetStatus, { label: string; tone: StampTone }> = {
  on_track: { label: 'On track', tone: 'positive' },
  at_risk: { label: 'At risk', tone: 'warning' },
  over: { label: 'Over', tone: 'negative' },
};

const Rowed = styled.div`
  display: grid;
  /* Every column may shrink (minmax(0, …)) so a long figure never widens the row past the card. */
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 2fr) minmax(0, 1fr) 84px;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  min-height: 92px;
  padding: ${({ theme }) => theme.space[4]}px ${({ theme }) => theme.space[6]}px;

  > * {
    min-width: 0;
  }

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 84px;
    .bar {
      grid-column: 1 / -1;
      grid-row: 2;
      padding-top: 18px;
    }
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: ${({ theme }) => theme.space[3]}px;
    padding: ${({ theme }) => theme.space[4]}px;
  }
`;

const Right = styled.div`
  text-align: right;
  min-width: 0;
`;

export default function BudgetsPage() {
  const money = useMoney();
  const { message } = App.useApp();
  const [month, setMonth] = useState<string | undefined>();
  const [editing, setEditing] = useState<BudgetPacing | 'new' | null>(null);
  const budgets = useBudgets(month);
  const remove = useLedgerMutation((id: string) => api(`/budgets/${id}`, { method: 'DELETE' }));

  const data = budgets.data;
  const total = data?.totals[0];
  const rows = data?.budgets ?? [];
  const currentMonth = dayjs().format('YYYY-MM');
  const isCurrent = !data || data.month === currentMonth;

  return (
    <>
      <PageHeader
        title="Budgets"
        subtitle="Monthly limits per category, paced against how much of the month has passed."
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <DatePicker
              picker="month"
              allowClear={false}
              value={dayjs(`${month ?? currentMonth}-01`)}
              onChange={(d: Dayjs | null) =>
                setMonth(
                  d && d.format('YYYY-MM') !== currentMonth ? d.format('YYYY-MM') : undefined,
                )
              }
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New budget
            </Button>
          </div>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <StatCard
            variant="hero"
            label="Spent of budget"
            loading={budgets.isPending}
            value={total ? `${money(total.spent, total.currency)}` : '—'}
            hint={
              total
                ? `of ${money(total.limit, total.currency)} · ${total.percentUsed}% used`
                : 'No budgets yet'
            }
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label="Remaining"
            loading={budgets.isPending}
            value={total ? money(total.remaining, total.currency) : '—'}
            tone={total && Number(total.remaining) < 0 ? 'negative' : undefined}
            hint={
              data
                ? `${data.percentOfMonthElapsed}% of ${dayjs(`${data.month}-01`).format('MMMM')} elapsed`
                : undefined
            }
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label={isCurrent ? 'Projected month-end' : 'Month total'}
            loading={budgets.isPending}
            value={total ? money(total.projected, total.currency) : '—'}
            tone={total && Number(total.projected) > Number(total.limit) ? 'negative' : undefined}
            hint={`${rows.filter((b) => b.status !== 'on_track').length} of ${rows.length} budgets need attention`}
          />
        </Col>
      </Row>

      <Card styles={{ body: { padding: 0 } }}>
        {budgets.isPending ? (
          <div style={{ padding: 24 }}>
            <Skeleton active />
          </div>
        ) : rows.length === 0 ? (
          <Empty
            style={{ padding: '48px 0' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No budgets yet. Set a monthly limit for a category to see its pace."
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Create a budget
            </Button>
          </Empty>
        ) : (
          rows.map((b) => (
            <Rowed key={b.id}>
              <div>
                <Link
                  href={`/transactions?categoryId=${b.categoryId}&from=${data!.month}-01`}
                  style={{ color: 'inherit' }}
                >
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    {b.categoryName}
                  </Typography.Text>
                </Link>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Stamp $tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Stamp>
                  {b.rollover && <Eyebrow>Rollover</Eyebrow>}
                </div>
              </div>
              <div className="bar" style={{ paddingTop: 14 }}>
                <PaceBar
                  percent={b.percentUsed}
                  marker={isCurrent ? b.percentOfMonthElapsed : undefined}
                  markerLabel="today"
                  tone={STATUS[b.status].tone}
                />
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    justifyContent: 'space-between',
                    marginTop: 8,
                  }}
                >
                  <Eyebrow>{b.percentUsed}% used</Eyebrow>
                  <Eyebrow>
                    {Number(b.projectedOverspend) > 0
                      ? `Pace: ${money(b.projectedOverspend, b.currency)} over`
                      : `Projected ${money(b.projected, b.currency)}`}
                  </Eyebrow>
                </div>
              </div>
              <Right>
                <Figure>{money(b.spent, b.currency)}</Figure>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  of {money(b.limit, b.currency)} ·{' '}
                  {Number(b.remaining) < 0
                    ? `${money(-Number(b.remaining), b.currency)} over`
                    : `${money(b.remaining, b.currency)} left`}
                </Typography.Text>
              </Right>
              <Right>
                <Tooltip title="Edit">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    aria-label="Edit"
                    onClick={() => setEditing(b)}
                  />
                </Tooltip>
                <Popconfirm
                  title="Delete this budget?"
                  onConfirm={() =>
                    remove.mutateAsync(b.id).catch((e) => message.error(errorMessage(e)))
                  }
                >
                  <Button type="text" icon={<DeleteOutlined />} aria-label="Delete" />
                </Popconfirm>
              </Right>
            </Rowed>
          ))
        )}
      </Card>

      <BudgetFormModal
        budget={editing === 'new' ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

interface Values {
  categoryId: string;
  amount: string;
  rollover: boolean;
}

function BudgetFormModal({
  open,
  budget,
  onClose,
}: {
  open: boolean;
  budget?: BudgetPacing;
  onClose: () => void;
}) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useLedgerMutation((values: Values) =>
    budget
      ? api(`/budgets/${budget.id}`, { method: 'PATCH', body: values })
      : api('/budgets', { method: 'POST', body: values }),
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (budget)
      form.setFieldsValue({
        categoryId: budget.categoryId,
        amount: budget.amount,
        rollover: budget.rollover,
      });
  }, [open, budget, form]);

  const onOk = async () => {
    const values = await form.validateFields();
    try {
      await save.mutateAsync(values);
      message.success(budget ? 'Budget updated' : 'Budget created');
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      title={budget ? 'Edit budget' : 'New budget'}
      okText={budget ? 'Save' : 'Create'}
      onOk={onOk}
      onCancel={onClose}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ rollover: false }}>
        <Form.Item
          name="categoryId"
          label="Category"
          extra="Spending in subcategories counts too."
          rules={[{ required: true, message: 'Pick a category' }]}
        >
          <CategorySelect
            allowClear={false}
            style={{ width: '100%' }}
            placeholder="Food & dining"
          />
        </Form.Item>
        <Form.Item
          name="amount"
          label="Monthly limit"
          rules={[
            {
              required: true,
              pattern: /^\d{1,15}(\.\d{1,4})?$/,
              message: 'A positive amount like 8000',
            },
          ]}
        >
          <Input inputMode="decimal" placeholder="8000" />
        </Form.Item>
        <Form.Item
          name="rollover"
          label="Roll over unspent amount"
          valuePropName="checked"
          extra="Adds last month's leftover to this month's limit."
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
