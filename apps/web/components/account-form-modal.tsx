'use client';

import { AccountType } from '@arvo/types';
import { App, Form, Input, Modal, Select, Switch } from 'antd';
import { useEffect } from 'react';
import { api, errorMessage } from '../lib/api';
import { titleCase } from '../lib/format';
import { useLedgerMutation } from '../lib/queries';
import type { Account } from '../lib/types';

interface Values {
  name: string;
  type: AccountType;
  institution?: string;
  currency?: string;
  openingBalance?: string;
  isActive?: boolean;
}

export function AccountFormModal({ open, account, onClose }: { open: boolean; account?: Account; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useLedgerMutation((values: Values) =>
    account
      ? api<Account>(`/accounts/${account.id}`, {
          method: 'PATCH',
          body: { name: values.name, type: values.type, institution: values.institution || null, openingBalance: values.openingBalance, isActive: values.isActive },
        })
      : api<Account>('/accounts', { method: 'POST', body: { ...values, institution: values.institution || undefined } }),
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (account) form.setFieldsValue({ ...account, institution: account.institution ?? undefined });
  }, [open, account, form]);

  const onOk = async () => {
    const values = await form.validateFields();
    try {
      await save.mutateAsync(values);
      message.success(account ? 'Account updated' : 'Account created');
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      title={account ? 'Edit account' : 'New account'}
      okText={account ? 'Save' : 'Create'}
      onOk={onOk}
      onCancel={onClose}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ type: AccountType.BANK, openingBalance: '0' }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
          <Input placeholder="HDFC Savings" autoFocus />
        </Form.Item>
        <Form.Item name="type" label="Type" rules={[{ required: true }]}>
          <Select options={Object.values(AccountType).map((t) => ({ value: t, label: titleCase(t) }))} />
        </Form.Item>
        <Form.Item name="institution" label="Institution">
          <Input placeholder="HDFC Bank" />
        </Form.Item>
        {!account && (
          <Form.Item name="currency" label="Currency" extra="Leave empty to use your base currency" rules={[{ pattern: /^[A-Z]{3}$/, message: '3-letter ISO code, e.g. INR' }]}>
            <Input placeholder="INR" maxLength={3} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
        )}
        <Form.Item
          name="openingBalance"
          label="Opening balance"
          extra="For credit cards and loans, enter what you owe as a negative number."
          rules={[{ pattern: /^[+-]?\d{1,15}(\.\d{1,4})?$/, message: 'A number like 25000 or -1200.50' }]}
        >
          <Input inputMode="decimal" />
        </Form.Item>
        {account && (
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
