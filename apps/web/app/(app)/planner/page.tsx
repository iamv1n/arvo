'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Checkbox, Col, DatePicker, Dropdown, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Segmented, Skeleton, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CategorySelect } from '../../../components/category-select';
import { PageHeader } from '../../../components/page-header';
import { Eyebrow, Figure, SectionTitle, Stamp, type StampTone } from '../../../components/planning';
import { ProjectionChart } from '../../../components/projection-chart';
import { ResultStrip } from '../../../components/result-strip';
import { api, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { keys, useScenarioComparison, useScenarios } from '../../../lib/queries';
import type { AffordabilityResult, AffordabilityStatus, Scenario, ScenarioAdjustment, WhatIfResult } from '../../../lib/types';
import { useMoney } from '../../../lib/use-money';

type Tab = 'afford' | 'what-if';

const STATUS: Record<AffordabilityStatus, { label: string; tone: StampTone }> = {
  affordable: { label: 'Affordable', tone: 'positive' },
  tight: { label: 'Tight', tone: 'warning' },
  not_yet: { label: 'Not yet', tone: 'negative' },
};

const BigStamp = styled(Stamp)`
  padding: 6px 14px;
  font-size: 16px;
  letter-spacing: 0.12em;
  border-width: 2px;
`;

/*
 * Assumption fields. This form lives in a third of the page, so fixed 24-column fractions
 * squeezed a date picker and a number into ~120px each. An auto-fit track lets a field claim a
 * whole line when the column is narrow, with its name above it in small mono.
 */
const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[4]}px;
  margin-bottom: ${({ theme }) => theme.space[5]}px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  .name {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  .hint {
    font-size: 11px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const AdjustmentRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => theme.space[3]}px 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
`;

const DECIMAL = /^[+-]?\d{1,15}(\.\d{1,4})?$/;
const POSITIVE = /^\d{1,15}(\.\d{1,4})?$/;

export default function PlannerPage() {
  const [tab, setTab] = useState<Tab>('afford');
  return (
    <>
      <PageHeader
        title="Planner"
        subtitle="Test a purchase or a change against your real cash, spending and goals — projected 12 months ahead."
        extra={
          <Segmented<Tab>
            style={{ maxWidth: '100%', overflowX: 'auto' }}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'afford', label: 'Can I afford it?' },
              { value: 'what-if', label: 'What if…' },
            ]}
          />
        }
      />
      {tab === 'afford' ? <Affordability /> : <WhatIf />}
    </>
  );
}

// ---------------------------------------------------------------- affordability

function Affordability() {
  const money = useMoney();
  const theme = useTheme();
  const { user } = useAuth();
  const currency = user?.currency ?? 'INR';
  const { message } = App.useApp();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<Dayjs | null>(null);
  const [buffer, setBuffer] = useState<number>(3);
  const check = useMutation({
    mutationFn: (body: { amount: string; date?: string; bufferMonths: number }) =>
      api<AffordabilityResult>('/planning/affordability', { method: 'POST', body }),
    onError: (e) => message.error(errorMessage(e)),
  });
  const r = check.data;

  const submit = () => {
    if (!POSITIVE.test(amount.trim()) || Number(amount) <= 0) {
      message.warning('Enter an amount like 70000');
      return;
    }
    check.mutate({ amount: amount.trim(), bufferMonths: buffer, ...(date ? { date: date.format('YYYY-MM-DD') } : {}) });
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={9}>
        <Card style={{ height: '100%' }}>
          <Form layout="vertical" requiredMark={false} onFinish={submit}>
            <Fields>
              <Field style={{ gridColumn: '1 / -1' }}>
                <span className="name">Amount</span>
                <Input size="large" inputMode="decimal" prefix="₹" placeholder="70000" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field>
                <span className="name">When</span>
                <DatePicker
                  style={{ width: '100%' }}
                  value={date}
                  onChange={setDate}
                  disabledDate={(d) => d.isBefore(dayjs(), 'day') || d.isAfter(dayjs().add(12, 'month').endOf('month'))}
                />
                <span className="hint">Empty means today</span>
              </Field>
              <Field>
                <span className="name">Buffer (months)</span>
                <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.5} value={buffer} onChange={(v) => setBuffer(v ?? 0)} />
              </Field>
            </Fields>
            <Button type="primary" htmlType="submit" block size="large" loading={check.isPending}>
              Check
            </Button>
          </Form>

          {r && (
            <>
              <div style={{ margin: '28px 0 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <BigStamp $tone={STATUS[r.status].tone}>{STATUS[r.status].label}</BigStamp>
                {r.status !== 'affordable' && r.affordableFrom && <Eyebrow>Comfortable from {dayjs(`${r.affordableFrom}-01`).format('MMM YYYY')}</Eyebrow>}
              </div>
              {/* Long, signed and sometimes wordy ("Never at this pace") — a ruled ribbon, not stat cards. */}
              <ResultStrip
                items={[
                  { label: 'Cash after', value: money(r.cashAfter, currency), tone: Number(r.cashAfter) < 0 ? 'negative' : 'neutral' },
                  { label: 'Buffer left', value: r.bufferMonthsAfter === null ? '—' : `${r.bufferMonthsAfter} mo` },
                  { label: 'Buffer target', value: money(r.bufferTarget, currency) },
                  {
                    label: 'Back to buffer',
                    value: r.monthsToRecover === null ? 'Never at this pace' : r.monthsToRecover === 0 ? 'Never below' : `${r.monthsToRecover} mo`,
                  },
                ]}
              />
            </>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={15}>
        <Card
          style={{ height: '100%' }}
          title="Liquid cash, next 12 months"
          extra={r && <Eyebrow>Saving {money(r.baseline.monthlySurplus, currency)}/mo after goals</Eyebrow>}
        >
          {check.isPending ? (
            <Skeleton active paragraph={{ rows: 7 }} />
          ) : r ? (
            <>
              <ProjectionChart
                months={r.series.map((p) => p.month)}
                lines={[
                  { key: 'without', name: 'Without purchase', color: theme.colors.textMuted, dashed: true },
                  { key: 'with', name: 'With purchase', color: theme.colors.brand },
                ]}
                values={{ without: r.series.map((p) => p.without), with: r.series.map((p) => p.with) }}
                buffer={r.bufferTarget}
                currency={currency}
                height={240}
              />
              <Baseline baseline={r.baseline} currency={currency} />
            </>
          ) : (
            <Empty style={{ padding: '72px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Enter an amount to see how it plays out against your buffer." />
          )}
        </Card>
      </Col>
    </Row>
  );
}

function Baseline({ baseline, currency }: { baseline: AffordabilityResult['baseline']; currency: string }) {
  const money = useMoney();
  const span = baseline.months.length ? `${dayjs(`${baseline.months[0]}-01`).format('MMM')}–${dayjs(`${baseline.months.at(-1)}-01`).format('MMM')}` : '';
  return (
    <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0', fontSize: 12 }}>
      Bank and cash {money(baseline.liquid, currency)} · income {money(baseline.monthlyIncome, currency)} − spending {money(baseline.monthlyExpenses, currency)}
      {Number(baseline.goalContributions) > 0 && <> − goals {money(baseline.goalContributions, currency)}</>} a month ({span} average)
    </Typography.Paragraph>
  );
}

// ---------------------------------------------------------------- what-if

type Draft =
  | { id: number; type: 'category'; categoryId: string | null; mode: 'amount' | 'percent'; value: string; fromMonth: string | null }
  | { id: number; type: 'income'; mode: 'amount' | 'percent'; value: string; fromMonth: string | null }
  | { id: number; type: 'one_off'; month: string | null; amount: string; label: string };

let nextId = 1;
const newDraft = (type: Draft['type']): Draft =>
  type === 'category'
    ? { id: nextId++, type, categoryId: null, mode: 'amount', value: '', fromMonth: null }
    : type === 'income'
      ? { id: nextId++, type, mode: 'amount', value: '', fromMonth: null }
      : { id: nextId++, type, month: dayjs().add(1, 'month').format('YYYY-MM'), amount: '', label: '' };

function toAdjustment(d: Draft): ScenarioAdjustment | null {
  if (d.type === 'one_off') {
    if (!d.month || !POSITIVE.test(d.amount.trim()) || Number(d.amount) <= 0) return null;
    return { type: 'one_off', month: d.month, amount: d.amount.trim(), ...(d.label.trim() ? { label: d.label.trim() } : {}) };
  }
  const value = d.value.trim();
  if (!DECIMAL.test(value) || Number(value) === 0) return null;
  if (d.mode === 'percent' && (Number(value) < -100 || Math.abs(Number(value)) > 9999)) return null;
  const from = d.fromMonth ? { fromMonth: d.fromMonth } : {};
  if (d.type === 'income') return { type: 'income', mode: d.mode, value, ...from };
  if (!d.categoryId) return null;
  return { type: 'category', categoryId: d.categoryId, mode: d.mode, value, ...from };
}

function fromAdjustment(a: ScenarioAdjustment): Draft {
  if (a.type === 'one_off') return { id: nextId++, type: 'one_off', month: a.month, amount: a.amount, label: a.label ?? '' };
  if (a.type === 'income') return { id: nextId++, type: 'income', mode: a.mode, value: a.value, fromMonth: a.fromMonth ?? null };
  return { id: nextId++, type: 'category', categoryId: a.categoryId, mode: a.mode, value: a.value, fromMonth: a.fromMonth ?? null };
}

const monthDisabled = (d: Dayjs) => d.isBefore(dayjs(), 'month') || d.isAfter(dayjs().add(12, 'month'), 'month');

function WhatIf() {
  const money = useMoney();
  const theme = useTheme();
  const { user } = useAuth();
  const currency = user?.currency ?? 'INR';
  const [drafts, setDrafts] = useState<Draft[]>(() => [newDraft('category')]);
  const [saving, setSaving] = useState(false);

  const adjustments = useMemo(() => drafts.map(toAdjustment).filter((a): a is ScenarioAdjustment => a !== null), [drafts]);
  const [debounced, setDebounced] = useState(adjustments);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(adjustments), 350);
    return () => clearTimeout(t);
  }, [adjustments]);

  const run = useQuery({
    queryKey: [...keys.planning, 'what-if', JSON.stringify(debounced)],
    queryFn: () => api<WhatIfResult>('/planning/what-if', { method: 'POST', body: { adjustments: debounced } }),
    placeholderData: (prev) => prev,
  });
  const r = run.data;
  const categoryAverage = useMemo(() => new Map(r?.baseline.categories.map((c) => [c.categoryId, c.monthly]) ?? []), [r]);

  const update = (id: number, patch: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.id === id ? ({ ...d, ...patch } as Draft) : d)));
  const remove = (id: number) => setDrafts((list) => list.filter((d) => d.id !== id));

  const yearly = r ? Number(r.yearlyImpact) : 0;

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card
            style={{ height: '100%' }}
            title="Adjustments"
            extra={
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'category', label: 'Category spend' },
                    { key: 'income', label: 'Income' },
                    { key: 'one_off', label: 'One-off expense' },
                  ],
                  onClick: ({ key }) => setDrafts((list) => [...list, newDraft(key as Draft['type'])]),
                }}
              >
                <Button icon={<PlusOutlined />}>Add</Button>
              </Dropdown>
            }
          >
            {drafts.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Add a change to see its effect." />}
            {drafts.map((d) => (
              <AdjustmentRow key={d.id}>
                {d.type === 'category' && (
                  <>
                    <CategorySelect allowClear={false} value={d.categoryId} onChange={(v) => update(d.id, { categoryId: v })} placeholder="Category" style={{ flex: '1 1 180px' }} />
                    <ModeValue mode={d.mode} value={d.value} onMode={(mode) => update(d.id, { mode })} onValue={(value) => update(d.id, { value })} placeholder={d.mode === 'percent' ? '-50' : '10000'} />
                  </>
                )}
                {d.type === 'income' && (
                  <>
                    <Typography.Text strong style={{ flex: '1 1 180px' }}>
                      Income
                    </Typography.Text>
                    <ModeValue mode={d.mode} value={d.value} onMode={(mode) => update(d.id, { mode })} onValue={(value) => update(d.id, { value })} placeholder={d.mode === 'percent' ? '10' : '15000'} />
                  </>
                )}
                {d.type === 'one_off' && (
                  <>
                    <Input value={d.label} onChange={(e) => update(d.id, { label: e.target.value })} placeholder="One-off (e.g. Laptop)" maxLength={80} style={{ flex: '1 1 150px' }} />
                    <Input inputMode="decimal" prefix="₹" value={d.amount} onChange={(e) => update(d.id, { amount: e.target.value })} placeholder="70000" style={{ flex: '1 1 120px', minWidth: 110 }} />
                    <DatePicker picker="month" allowClear={false} value={d.month ? dayjs(`${d.month}-01`) : null} disabledDate={monthDisabled} onChange={(v) => update(d.id, { month: v ? v.format('YYYY-MM') : null })} style={{ flex: '1 1 120px', minWidth: 110 }} />
                  </>
                )}
                {d.type !== 'one_off' && (
                  <DatePicker
                    picker="month"
                    placeholder="From next month"
                    value={d.fromMonth ? dayjs(`${d.fromMonth}-01`) : null}
                    disabledDate={monthDisabled}
                    onChange={(v) => update(d.id, { fromMonth: v ? v.format('YYYY-MM') : null })}
                    style={{ flex: '1 1 140px', minWidth: 130 }}
                  />
                )}
                <Button type="text" icon={<DeleteOutlined />} aria-label="Remove" onClick={() => remove(d.id)} />
                {d.type === 'category' && d.categoryId && (
                  <Eyebrow style={{ flexBasis: '100%' }}>
                    Usually {money(categoryAverage.get(d.categoryId) ?? 0, currency)}/month · positive = spend more
                  </Eyebrow>
                )}
              </AdjustmentRow>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 8 }}>
              <Eyebrow>
                {adjustments.length} of {drafts.length} applied
              </Eyebrow>
              <Button type="primary" disabled={adjustments.length === 0} onClick={() => setSaving(true)}>
                Save as scenario
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card style={{ height: '100%' }} title="Projection vs today's pace" extra={r && <Eyebrow>{run.isFetching ? 'Updating…' : `12 months from ${dayjs(r.asOf).format('MMM YYYY')}`}</Eyebrow>}>
            {!r ? (
              <Skeleton active paragraph={{ rows: 8 }} />
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <ResultStrip
                    items={[
                      {
                        label: 'Yearly impact',
                        value: `${yearly > 0 ? '+' : ''}${money(r.yearlyImpact, currency)}`,
                        tone: yearly > 0 ? 'positive' : yearly < 0 ? 'negative' : 'neutral',
                      },
                      { label: 'Monthly change', value: `${Number(r.monthlyChange) > 0 ? '+' : ''}${money(r.monthlyChange, currency)}` },
                      {
                        label: 'Lowest point',
                        value: money(r.lowest.amount, currency, { compact: true }),
                        caveat: dayjs(`${r.lowest.month}-01`).format('MMM YYYY'),
                        tone: Number(r.lowest.amount) < 0 ? 'negative' : 'neutral',
                      },
                    ]}
                  />
                </div>
                <ProjectionChart
                  months={r.series.map((p) => p.month)}
                  lines={[
                    { key: 'baseline', name: 'Baseline', color: theme.colors.textMuted, dashed: true },
                    { key: 'scenario', name: 'With changes', color: theme.colors.brand },
                  ]}
                  values={{ baseline: r.series.map((p) => p.baseline), scenario: r.series.map((p) => p.scenario) }}
                  currency={currency}
                  height={260}
                />
                <Baseline baseline={r.baseline} currency={currency} />
              </>
            )}
          </Card>
        </Col>
      </Row>

      <SavedScenarios onLoad={(s) => setDrafts(s.adjustments.map(fromAdjustment))} />
      <SaveScenarioModal open={saving} adjustments={adjustments} onClose={() => setSaving(false)} />
    </>
  );
}

function ModeValue({
  mode,
  value,
  onMode,
  onValue,
  placeholder,
}: {
  mode: 'amount' | 'percent';
  value: string;
  onMode: (mode: 'amount' | 'percent') => void;
  onValue: (value: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Segmented<'amount' | 'percent'> size="small" value={mode} onChange={onMode} options={[{ value: 'amount', label: '₹' }, { value: 'percent', label: '%' }]} />
      <Input inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} placeholder={placeholder} style={{ flex: '1 1 100px', minWidth: 92 }} suffix={mode === 'percent' ? '%' : undefined} />
    </>
  );
}

function SaveScenarioModal({ open, adjustments, onClose }: { open: boolean; adjustments: ScenarioAdjustment[]; onClose: () => void }) {
  const [form] = Form.useForm<{ name: string; description?: string }>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (body: object) => api<Scenario>('/scenarios', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.scenarios }),
  });
  const onOk = async () => {
    const values = await form.validateFields();
    try {
      await save.mutateAsync({ ...values, adjustments });
      message.success('Scenario saved');
      form.resetFields();
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  return (
    <Modal open={open} title="Save scenario" okText="Save" onOk={onOk} onCancel={onClose} confirmLoading={save.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, max: 120, message: 'Give it a name' }]}>
          <Input placeholder="Move to a bigger flat" />
        </Form.Item>
        <Form.Item name="description" label="Note" rules={[{ max: 500 }]}>
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function SavedScenarios({ onLoad }: { onLoad: (s: Scenario) => void }) {
  const money = useMoney();
  const theme = useTheme();
  const { user } = useAuth();
  const currency = user?.currency ?? 'INR';
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const scenarios = useScenarios();
  const [selected, setSelected] = useState<string[]>([]);
  const list = scenarios.data ?? [];
  const ids = selected.filter((id) => list.some((s) => s.id === id));
  const comparison = useScenarioComparison(ids);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/scenarios/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.scenarios }),
  });
  const c = comparison.data;
  const palette = theme.colors.chart;

  return (
    <>
      <SectionTitle>
        <span>Saved scenarios</span>
        <small>Pick up to 5 to compare</small>
      </SectionTitle>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card styles={{ body: { padding: list.length ? 0 : undefined } }} style={{ height: '100%' }}>
            {scenarios.isPending ? (
              <Skeleton active />
            ) : list.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Save a what-if to compare it later." />
            ) : (
              list.map((s) => (
                <AdjustmentRow key={s.id} style={{ padding: '12px 20px' }}>
                  <Checkbox
                    checked={ids.includes(s.id)}
                    disabled={!ids.includes(s.id) && ids.length >= 5}
                    onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((id) => id !== s.id)))}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {s.name}
                    </Typography.Text>
                    <Eyebrow>
                      {s.adjustments.length} change{s.adjustments.length === 1 ? '' : 's'}
                      {s.description ? ` · ${s.description}` : ''}
                    </Eyebrow>
                  </div>
                  <Button size="small" onClick={() => onLoad(s)}>
                    Load
                  </Button>
                  <Popconfirm title="Delete this scenario?" onConfirm={() => remove.mutateAsync(s.id).catch((e) => message.error(errorMessage(e)))}>
                    <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Delete" />
                  </Popconfirm>
                </AdjustmentRow>
              ))
            )}
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="Compared" style={{ height: '100%' }}>
            {ids.length === 0 || !c ? (
              ids.length > 0 ? (
                <Skeleton active paragraph={{ rows: 6 }} />
              ) : (
                <Empty style={{ padding: '48px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tick scenarios to overlay them." />
              )
            ) : (
              <>
                <ProjectionChart
                  months={c.months}
                  lines={[
                    { key: 'baseline', name: 'Baseline', color: theme.colors.textMuted, dashed: true },
                    ...c.scenarios.map((s, i) => ({ key: s.id, name: s.name, color: palette[i % palette.length] })),
                  ]}
                  values={{ baseline: c.baselineSeries, ...Object.fromEntries(c.scenarios.map((s) => [s.id, s.series])) }}
                  currency={currency}
                  height={240}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 12 }}>
                  {c.scenarios.map((s, i) => (
                    <div key={s.id}>
                      <Eyebrow style={{ color: palette[i % palette.length] }}>{s.name}</Eyebrow>
                      <div>
                        <Figure $size={20}>
                          {Number(s.yearlyImpact) > 0 ? '+' : ''}
                          {money(s.yearlyImpact, currency)}
                        </Figure>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {' '}
                          / year
                        </Typography.Text>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
