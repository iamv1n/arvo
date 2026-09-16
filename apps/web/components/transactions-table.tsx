'use client';

import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { TransactionType } from '@arvo/types';
import { App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useMemo } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';
import { useAccounts, useCategories, useLedgerMutation, useMerchants } from '../lib/queries';
import type { Transaction } from '../lib/types';
import { Amount } from './amount';

const TYPE_COLORS: Partial<Record<TransactionType, string>> = {
  INCOME: 'green',
  REFUND: 'cyan',
  TRANSFER: 'blue',
  FEE: 'orange',
  INTEREST: 'purple',
  UNKNOWN: 'gold',
};

export function TransactionsTable({
  data,
  loading,
  onEdit,
  hideAccount,
  ...tableProps
}: {
  data: Transaction[];
  loading?: boolean;
  onEdit: (t: Transaction) => void;
  hideAccount?: boolean;
} & Pick<TableProps<Transaction>, 'pagination' | 'rowSelection' | 'onChange'>) {
  const { message } = App.useApp();
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const names = useMemo(
    () => ({
      account: new Map((accounts.data ?? []).map((a) => [a.id, a.name])),
      category: new Map((categories.data ?? []).map((c) => [c.id, c])),
      merchant: new Map((merchants.data ?? []).map((m) => [m.id, m.name])),
    }),
    [accounts.data, categories.data, merchants.data],
  );
  const remove = useLedgerMutation((id: string) => api(`/transactions/${id}`, { method: 'DELETE' }));

  const columns: TableProps<Transaction>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 120, render: formatDate },
    {
      title: 'Merchant',
      dataIndex: 'merchantId',
      width: 160,
      ellipsis: true,
      render: (id: string | null) => (id ? names.merchant.get(id) : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      render: (description: string, t) => (
        <Space size={6}>
          <span>{description}</span>
          {t.type !== TransactionType.EXPENSE && (
            <Tag color={TYPE_COLORS[t.type]} variant="filled">
              {titleCase(t.type)}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'categoryId',
      width: 170,
      ellipsis: true,
      render: (id: string | null) => {
        const category = id ? names.category.get(id) : undefined;
        if (!category) return <Typography.Text type="secondary">Uncategorized</Typography.Text>;
        const parent = category.parentId ? names.category.get(category.parentId) : undefined;
        return (
          <span title={parent ? `${parent.name} › ${category.name}` : category.name}>
            {category.name}
          </span>
        );
      },
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      align: 'right',
      width: 150,
      render: (amount: string, t) => <Amount value={amount} currency={t.currency} type={t.type} />,
    },
    ...(hideAccount
      ? []
      : [
          {
            title: 'Account',
            dataIndex: 'accountId',
            width: 170,
            ellipsis: true,
            render: (id: string) => names.account.get(id),
          },
        ]),
    {
      key: 'actions',
      width: 88,
      align: 'right',
      render: (_: unknown, t: Transaction) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(t)} aria-label="Edit" />
          <Popconfirm
            title="Delete this transaction?"
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              remove.mutateAsync(t.id).then(
                () => message.success('Transaction deleted'),
                (e) => message.error(errorMessage(e)),
              )
            }
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Table<Transaction>
      rowKey="id"
      size="middle"
      columns={columns}
      dataSource={data}
      loading={loading}
      scroll={{ x: 960 }}
      {...tableProps}
    />
  );
}
