'use client';

import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import styled from 'styled-components';
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

/*
 * Fields laid out by how much room they need, not by a fixed fraction of 24 columns.
 *
 * The old rows put four inputs in md={6} sixths and two halves on a phone, so "AMFI scheme code"
 * and "Direct plan %" were labels wider than their own inputs. This wraps at a readable minimum
 * instead, and labels are set as mono eyebrows so a long one takes one line, not two.
 */
const Fields = styled.div<{ $min?: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(${({ $min = 150 }) => $min}px, 1fr));
  gap: 0 12px;

  .ant-form-item {
    min-width: 0;
    margin-bottom: 14px;
  }

  .ant-form-item-label {
    padding-bottom: 2px;
  }

  .ant-form-item-label > label {
    height: auto;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  .ant-form-item-extra {
    font-size: 11px;
    line-height: 1.35;
  }
`;

/** A field that should keep more than its share of the grid, such as a name. */
const Wide = styled.div`
  grid-column: span 2;
  min-width: 0;

  @media (max-width: 520px) {
    grid-column: span 1;
  }
`;

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
        <Fields>
          <Wide>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 160 }]}>
              <Input placeholder="Parag Parikh Flexi Cap Direct Growth" />
            </Form.Item>
          </Wide>
          <Form.Item name="kind" label="Type" rules={[{ required: true }]}>
            <Select options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="assetClass" label="Asset class" extra="Defaults from the type">
            <Select allowClear options={Object.entries(ASSET_CLASS_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="isin" label="ISIN">
            <Input placeholder="INF879O01027" />
          </Form.Item>
          <Form.Item name="schemeCode" label="AMFI scheme code" extra="Lets a NAV file price it">
            <Input placeholder="122639" />
          </Form.Item>
          <Form.Item name="symbol" label="Symbol">
            <Input placeholder="INFY" />
          </Form.Item>
          <Form.Item name="folio" label="Folio or account number">
            <Input placeholder="12345678 / 90" />
          </Form.Item>
          <Form.Item name="amc" label="AMC or issuer">
            <Input placeholder="PPFAS" />
          </Form.Item>
          <Form.Item name="sector" label="Sector">
            <Input placeholder="Diversified" />
          </Form.Item>
          <Form.Item name="marketCap" label="Market cap">
            <Select allowClear options={[{ value: 'LARGE', label: 'Large cap' }, { value: 'MID', label: 'Mid cap' }, { value: 'SMALL', label: 'Small cap' }]} />
          </Form.Item>
          {isFund && (
            <>
              <Form.Item name="plan" label="Plan">
                <Select allowClear options={[{ value: 'DIRECT', label: 'Direct' }, { value: 'REGULAR', label: 'Regular' }]} />
              </Form.Item>
              <Form.Item name="expenseRatio" label="Expense ratio %" rules={[PERCENT_RULE]}>
                <Input inputMode="decimal" placeholder="0.63" />
              </Form.Item>
              <Form.Item name="directExpenseRatio" label="Direct plan %" extra="To price the regular-plan gap" rules={[PERCENT_RULE]}>
                <Input inputMode="decimal" placeholder="0.35" />
              </Form.Item>
              <Form.Item name="exitLoadDays" label="Exit load days">
                <InputNumber style={{ width: '100%' }} min={0} max={3660} placeholder="365" />
              </Form.Item>
            </>
          )}
          <Form.Item name="lockInMonths" label="Lock-in months" extra="ELSS is 36">
            <InputNumber style={{ width: '100%' }} min={0} max={600} placeholder="36" />
          </Form.Item>
          {priced && (
            <>
              <Form.Item name="latestPrice" label="Latest price or NAV" rules={[MONEY_RULE]}>
                <Input inputMode="decimal" placeholder="89.4512" />
              </Form.Item>
              <Form.Item name="latestPriceDate" label="Priced on">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          <Form.Item name="goalId" label="Earmarked for">
            <Select
              allowClear
              placeholder="No goal"
              loading={goals.isPending}
              options={(goals.data ?? []).map((goal) => ({ value: goal.id, label: goal.name }))}
            />
          </Form.Item>
        </Fields>

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
        <Fields $min={140}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={Object.entries(TRANSACTION_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          {!cashOnly && (
            <>
              <Form.Item name="units" label="Units" rules={[UNITS_RULE, { required: needsUnits, message: 'Units are needed for this instrument' }]}>
                <Input inputMode="decimal" placeholder="1043.514" />
              </Form.Item>
              <Form.Item name="price" label="Price or NAV" rules={[MONEY_RULE]}>
                <Input inputMode="decimal" placeholder="47.9127" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="amount"
            label={type === 'VALUE_UPDATE' ? 'Value on that date' : 'Amount'}
            rules={[MONEY_RULE, { required: cashOnly, message: 'An amount is required' }]}
            extra={cashOnly ? undefined : 'Left empty, it is units × price'}
          >
            <Input inputMode="decimal" placeholder="50000" />
          </Form.Item>
          <Form.Item name="charges" label="Charges" extra="Brokerage, STT, stamp duty, exit load" rules={[MONEY_RULE]}>
            <Input inputMode="decimal" placeholder="0" />
          </Form.Item>
        </Fields>
        <Form.Item name="note" label="Note">
          <Input maxLength={300} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
