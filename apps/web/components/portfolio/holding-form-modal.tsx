'use client';

import { App, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useGoals, usePortfolioMutation } from '../../lib/queries';
import type { AssetClass, Holding, HoldingTransactionType, InstrumentKind } from '../../lib/types';
import { ASSET_CLASS_LABELS, KIND_LABELS, TRANSACTION_LABELS, UNIT_PRICED } from './shared';

const MONEY_RULE = { pattern: /^\d{1,15}(\.\d{1,4})?$/, message: 'A positive amount like 50000' };
const UNITS_RULE = { pattern: /^\d{1,18}(\.\d{1,5})?$/, message: 'A quantity like 1043.514' };
const PERCENT_RULE = { pattern: /^\d{1,3}(\.\d{1,4})?$/, message: 'A percentage like 0.63' };

interface HoldingValues {
  name: string;
  kind: InstrumentKind;
  assetClass?: AssetClass;
  isin?: string;
  schemeCode?: string;
  symbol?: string;
  folio?: string;
  amc?: string;
  sector?: string;
  marketCap?: 'LARGE' | 'MID' | 'SMALL';
  plan?: 'DIRECT' | 'REGULAR';
  expenseRatio?: string;
  directExpenseRatio?: string;
  exitLoadDays?: number;
  lockInMonths?: number;
  latestPrice?: string;
  latestPriceDate?: Dayjs;
  goalId?: string;
  notes?: string;
}

const clean = <T extends object>(values: T) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === undefined || value === '' ? null : value]));

/**
 * Manual entry for anything Arvo cannot import: NPS, EPF, PPF, fixed deposits, gold and
 * property, as well as funds and stocks you would rather type in than upload.
 */
export function HoldingFormModal({ open, holding, onClose }: { open: boolean; holding?: Holding; onClose: () => void }) {
  const [form] = Form.useForm<HoldingValues>();
  const { message } = App.useApp();
  const goals = useGoals();
  const kind = Form.useWatch('kind', form) ?? holding?.kind;
  const isFund = kind === 'MUTUAL_FUND' || kind === 'ETF';
  const priced = UNIT_PRICED.includes((kind ?? 'MUTUAL_FUND') as InstrumentKind);

  const save = usePortfolioMutation((values: HoldingValues) => {
    const body = {
      ...clean(values),
      latestPriceDate: values.latestPriceDate ? values.latestPriceDate.format('YYYY-MM-DD') : null,
      latestPrice: values.latestPrice || null,
    };
    return holding ? api(`/holdings/${holding.id}`, { method: 'PATCH', body }) : api('/holdings', { method: 'POST', body });
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (holding) {
      form.setFieldsValue({
        ...holding,
        isin: holding.isin ?? undefined,
        schemeCode: holding.schemeCode ?? undefined,
        symbol: holding.symbol ?? undefined,
        folio: holding.folio ?? undefined,
        amc: holding.amc ?? undefined,
        sector: holding.sector ?? undefined,
        marketCap: holding.marketCap ?? undefined,
        plan: holding.plan ?? undefined,
        expenseRatio: holding.expenseRatio ?? undefined,
        directExpenseRatio: holding.directExpenseRatio ?? undefined,
        exitLoadDays: holding.exitLoadDays ?? undefined,
        lockInMonths: holding.lockInMonths ?? undefined,
        latestPrice: holding.latestPrice ?? undefined,
        latestPriceDate: holding.latestPriceDate ? dayjs(holding.latestPriceDate) : undefined,
        goalId: holding.goalId ?? undefined,
        notes: holding.notes ?? undefined,
      });
    }
  }, [open, holding, form]);

  const onOk = async () => {
    const values = await form.validateFields();
    try {
      await save.mutateAsync(values);
      message.success(holding ? 'Holding updated' : 'Holding added');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      width={720}
      title={holding ? 'Edit holding' : 'Add a holding'}
      okText={holding ? 'Save' : 'Add'}
      onOk={onOk}
      onCancel={onClose}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: 'MUTUAL_FUND' }}>
        <Row gutter={12}>
          <Col xs={24} md={14}>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 160 }]}>
              <Input placeholder="Parag Parikh Flexi Cap Direct Growth" />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="kind" label="Type" rules={[{ required: true }]}>
              <Select options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="assetClass" label="Asset class" extra="Defaults from the type">
              <Select allowClear options={Object.entries(ASSET_CLASS_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col xs={12} md={6}>
            <Form.Item name="isin" label="ISIN">
              <Input placeholder="INF879O01027" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="schemeCode" label="AMFI scheme code" extra="Lets a NAV file price it">
              <Input placeholder="122639" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="symbol" label="Symbol">
              <Input placeholder="INFY" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="folio" label="Folio or account number">
              <Input placeholder="12345678 / 90" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col xs={12} md={8}>
            <Form.Item name="amc" label="AMC or issuer">
              <Input placeholder="PPFAS" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="sector" label="Sector">
              <Input placeholder="Diversified" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="marketCap" label="Market cap">
              <Select allowClear options={[{ value: 'LARGE', label: 'Large cap' }, { value: 'MID', label: 'Mid cap' }, { value: 'SMALL', label: 'Small cap' }]} />
            </Form.Item>
          </Col>
        </Row>

        {isFund && (
          <Row gutter={12}>
            <Col xs={12} md={6}>
              <Form.Item name="plan" label="Plan">
                <Select allowClear options={[{ value: 'DIRECT', label: 'Direct' }, { value: 'REGULAR', label: 'Regular' }]} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="expenseRatio" label="Expense ratio %" rules={[PERCENT_RULE]}>
                <Input inputMode="decimal" placeholder="0.63" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="directExpenseRatio" label="Direct plan %" extra="To price the regular-plan gap" rules={[PERCENT_RULE]}>
                <Input inputMode="decimal" placeholder="0.35" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="exitLoadDays" label="Exit load days">
                <InputNumber style={{ width: '100%' }} min={0} max={3660} placeholder="365" />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Row gutter={12}>
          <Col xs={12} md={6}>
            <Form.Item name="lockInMonths" label="Lock-in months" extra="ELSS is 36">
              <InputNumber style={{ width: '100%' }} min={0} max={600} placeholder="36" />
            </Form.Item>
          </Col>
          {priced && (
            <>
              <Col xs={12} md={6}>
                <Form.Item name="latestPrice" label="Latest price or NAV" rules={[MONEY_RULE]}>
                  <Input inputMode="decimal" placeholder="89.4512" />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="latestPriceDate" label="Priced on">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </>
          )}
          <Col xs={24} md={6}>
            <Form.Item name="goalId" label="Earmarked for">
              <Select
                allowClear
                placeholder="No goal"
                loading={goals.isPending}
                options={(goals.data ?? []).map((goal) => ({ value: goal.id, label: goal.name }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={1000} placeholder="Where it is held, nominee, anything worth remembering" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface TransactionValues {
  date: Dayjs;
  type: HoldingTransactionType;
  units?: string;
  price?: string;
  amount?: string;
  charges?: string;
  note?: string;
}

/**
 * One event on a holding. Cash-only events (dividend, interest, a periodic value update for
 * EPF or property) take an amount and nothing else; anything with units takes two of
 * units, price and amount and derives the third.
 */
export function HoldingTransactionModal({
  open,
  holdingId,
  kind,
  onClose,
}: {
  open: boolean;
  holdingId: string;
  kind: InstrumentKind;
  onClose: () => void;
}) {
  const [form] = Form.useForm<TransactionValues>();
  const { message } = App.useApp();
  const type = Form.useWatch('type', form) ?? 'BUY';
  const cashOnly = type === 'DIVIDEND' || type === 'INTEREST' || type === 'VALUE_UPDATE';
  const needsUnits = !cashOnly && UNIT_PRICED.includes(kind);

  const save = usePortfolioMutation((values: TransactionValues) =>
    api(`/holdings/${holdingId}/transactions`, {
      method: 'POST',
      body: {
        date: values.date.format('YYYY-MM-DD'),
        type: values.type,
        units: cashOnly ? null : values.units || null,
        price: cashOnly ? null : values.price || null,
        amount: values.amount || undefined,
        charges: values.charges || '0',
        note: values.note || null,
      },
    }),
  );

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const onOk = async () => {
    const values = await form.validateFields();
    try {
      await save.mutateAsync(values);
      message.success('Transaction recorded');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal open={open} title="Record a transaction" okText="Record" onOk={onOk} onCancel={onClose} confirmLoading={save.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ type: 'BUY', date: dayjs() }}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select options={Object.entries(TRANSACTION_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
        </Row>
        {!cashOnly && (
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="units" label="Units" rules={[UNITS_RULE, { required: needsUnits, message: 'Units are needed for this instrument' }]}>
                <Input inputMode="decimal" placeholder="1043.514" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="price" label="Price or NAV" rules={[MONEY_RULE]}>
                <Input inputMode="decimal" placeholder="47.9127" />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="amount"
              label={type === 'VALUE_UPDATE' ? 'Value on that date' : 'Amount'}
              rules={[MONEY_RULE, { required: cashOnly, message: 'An amount is required' }]}
              extra={cashOnly ? undefined : 'Left empty, it is units × price'}
            >
              <Input inputMode="decimal" placeholder="50000" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="charges" label="Charges" extra="Brokerage, STT, stamp duty, exit load" rules={[MONEY_RULE]}>
              <Input inputMode="decimal" placeholder="0" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="note" label="Note">
          <Input maxLength={300} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
