'use client';

import { TransactionType } from '@arvo/types';
import { App, AutoComplete, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { api, errorMessage } from '../lib/api';
import { titleCase } from '../lib/format';
import { useAccounts, useLedgerMutation, useMerchants } from '../lib/queries';
import type { Transaction } from '../lib/types';
import { CategorySelect } from './category-select';
import { FormGrid, FullWidthField } from './mono-label';

interface Values {
  accountId: string;
  date: Dayjs;
  description: string;
  direction: 'OUT' | 'IN';
  amount: string;
  type: TransactionType;
  categoryId?: string | null;
  merchantName?: string;
  notes?: string;
}

const OUTFLOW_TYPES = [TransactionType.EXPENSE, TransactionType.FEE];
const INFLOW_TYPES = [TransactionType.INCOME, TransactionType.REFUND];

export function TransactionFormModal({
  open,
  transaction,
  defaultAccountId,
  onClose,
}: {
  open: boolean;
  transaction?: Transaction;
  defaultAccountId?: string;
  onClose: () => void;
}) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const accounts = useAccounts();
  const merchants = useMerchants();
  const merchantName = useMemo(() => new Map((merchants.data ?? []).map((m) => [m.id, m.name])), [merchants.data]);
  const type = Form.useWatch('type', form);

  const save = useLedgerMutation((values: Values) => {
    const magnitude = values.amount.replace(/^[+-]/, '');
    const body = {
      accountId: values.accountId,
      date: values.date.format('YYYY-MM-DD'),
      description: values.description,
      amount: values.direction === 'OUT' ? `-${magnitude}` : magnitude,
      type: values.type,
      categoryId: values.categoryId ?? null,
      notes: values.notes || null,
      ...(values.merchantName ? { merchantName: values.merchantName } : transaction ? { merchantId: null } : {}),
    };
    if (transaction) return api(`/transactions/${transaction.id}`, { method: 'PATCH', body });
    const { categoryId, notes, ...rest } = body;
    return api('/transactions', {
      method: 'POST',
      body: { ...rest, categoryId: categoryId ?? undefined, notes: notes ?? undefined },
    });
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (transaction) {
      form.setFieldsValue({
        accountId: transaction.accountId,
        date: dayjs(transaction.date),
        description: transaction.description,
        direction: transaction.amount.startsWith('-') ? 'OUT' : 'IN',
        amount: transaction.amount.replace('-', ''),
        type: transaction.type,
        categoryId: transaction.categoryId,
        merchantName: transaction.merchantId ? merchantName.get(transaction.merchantId) : undefined,
        notes: transaction.notes ?? undefined,
      });
    } else {
      form.setFieldsValue({ accountId: defaultAccountId, date: dayjs(), direction: 'OUT', type: TransactionType.EXPENSE });
    }
  }, [open, transaction, defaultAccountId, form, merchantName]);

  // Keep the direction consistent with types that have a fixed sign.
  useEffect(() => {
    if (OUTFLOW_TYPES.includes(type)) form.setFieldValue('direction', 'OUT');
    if (INFLOW_TYPES.includes(type)) form.setFieldValue('direction', 'IN');
  }, [type, form]);

  const onOk = async () => {
    const values = await form.validateFields();
    try {
      await save.mutateAsync(values);
      message.success(transaction ? 'Transaction updated' : 'Transaction added');
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const fixedSign = OUTFLOW_TYPES.includes(type) || INFLOW_TYPES.includes(type);

  return (
    <Modal
      open={open}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      okText={transaction ? 'Save' : 'Add'}
      onOk={onOk}
      onCancel={onClose}
      confirmLoading={save.isPending}
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <FormGrid $min={160}>
          <Form.Item name="accountId" label="Account" rules={[{ required: true }]}>
            <Select
              loading={accounts.isPending}
              options={accounts.data?.filter((a) => a.isActive || a.id === transaction?.accountId).map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="D MMM YYYY" />
          </Form.Item>
          <FullWidthField>
            <Form.Item name="description" label="Description" rules={[{ required: true, max: 500 }]}>
              <Input placeholder="Swiggy order" />
            </Form.Item>
          </FullWidthField>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={Object.values(TransactionType).map((t) => ({ value: t, label: titleCase(t) }))} />
          </Form.Item>
          <Form.Item name="direction" label="Direction">
            <Select
              disabled={fixedSign}
              options={[
                { value: 'OUT', label: 'Out' },
                { value: 'IN', label: 'In' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Amount"
            rules={[
              { required: true },
              { pattern: /^\d{1,15}(\.\d{1,4})?$/, message: 'A positive number' },
            ]}
          >
            <Input inputMode="decimal" placeholder="0.00" />
          </Form.Item>
          <Form.Item name="categoryId" label="Category">
            <CategorySelect style={{ width: '100%', minWidth: 0 }} />
          </Form.Item>
          <Form.Item name="merchantName" label="Merchant">
            <AutoComplete
              allowClear
              placeholder="Swiggy"
              options={merchants.data?.map((m) => ({ value: m.name }))}
              showSearch={{ filterOption: (input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase()) }}
            />
          </Form.Item>
          <FullWidthField>
            <Form.Item name="notes" label="Notes">
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
            </Form.Item>
          </FullWidthField>
        </FormGrid>
      </Form>
    </Modal>
  );
}
