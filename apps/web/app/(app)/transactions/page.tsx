'use client';

import { PlusOutlined, TagsOutlined } from '@ant-design/icons';
import { TransactionType } from '@arvo/types';
import { App, Button, Card, DatePicker, Flex, Input, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { CategorySelect } from '../../../components/category-select';
import { PageHeader } from '../../../components/page-header';
import { TransactionFormModal } from '../../../components/transaction-form-modal';
import { TransactionsTable } from '../../../components/transactions-table';
import { api, errorMessage } from '../../../lib/api';
import { titleCase } from '../../../lib/format';
import { useAccounts, useLedgerMutation, useTransactions, type TransactionFilters } from '../../../lib/queries';
import type { Transaction } from '../../../lib/types';

const PAGE_SIZE = 50;

function TransactionsView() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const accounts = useAccounts();

  // Filters live in the URL so views are shareable and survive reloads.
  const filters: TransactionFilters = useMemo(
    () => ({
      search: params.get('search') ?? undefined,
      accountId: params.get('accountId') ?? undefined,
      categoryId: params.get('categoryId') ?? undefined,
      type: (params.get('type')?.split(',').filter(Boolean) as TransactionType[] | undefined) ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    }),
    [params],
  );
  const page = Number(params.get('page') ?? '1');
  const setFilters = (patch: Record<string, string | string[] | undefined | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      const v = Array.isArray(value) ? value.join(',') : value;
      if (v) next.set(key, v);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`/transactions?${next.toString()}`);
  };

  const query = useTransactions({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const [searchText, setSearchText] = useState(filters.search ?? '');
  useEffect(() => setSearchText(filters.search ?? ''), [filters.search]);

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; transaction?: Transaction }>({ open: false });
  const bulk = useLedgerMutation(() =>
    api<{ updated: number }>('/transactions/bulk-categorize', {
      method: 'POST',
      body: { transactionIds: selected, categoryId: bulkCategory },
    }),
  );

  const applyBulk = async () => {
    try {
      const { updated } = await bulk.mutateAsync(undefined);
      message.success(`Categorized ${updated} transactions`);
      setSelected([]);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={query.data ? `${query.data.total.toLocaleString('en-IN')} transactions` : ' '}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
            Add transaction
          </Button>
        }
      />
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <Flex wrap gap={12}>
          <Input.Search
            placeholder="Search description or merchant"
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={(value) => setFilters({ search: value })}
            style={{ width: 260 }}
          />
          <DatePicker.RangePicker
            value={filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null}
            onChange={(range) =>
              setFilters({ from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') })
            }
            format="D MMM YY"
          />
          <Select
            placeholder="Account"
            allowClear
            style={{ minWidth: 180 }}
            value={filters.accountId}
            onChange={(accountId) => setFilters({ accountId })}
            options={accounts.data?.map((a) => ({ value: a.id, label: a.name }))}
          />
          <CategorySelect value={filters.categoryId} onChange={(categoryId) => setFilters({ categoryId })} />
          <Select
            mode="multiple"
            placeholder="Type"
            allowClear
            maxTagCount="responsive"
            style={{ minWidth: 180 }}
            value={filters.type ?? []}
            onChange={(type) => setFilters({ type })}
            options={Object.values(TransactionType).map((t) => ({ value: t, label: titleCase(t) }))}
          />
          {Object.values(filters).some(Boolean) && (
            <Button type="link" onClick={() => router.replace('/transactions')}>
              Clear filters
            </Button>
          )}
        </Flex>
      </Card>

      {selected.length > 0 && (
        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
          <Flex align="center" gap={12} wrap>
            <Typography.Text strong>{selected.length} selected</Typography.Text>
            <Space.Compact>
              <CategorySelect value={bulkCategory} onChange={setBulkCategory} placeholder="Set category (empty clears)" />
              <Button type="primary" icon={<TagsOutlined />} loading={bulk.isPending} onClick={applyBulk}>
                Apply
              </Button>
            </Space.Compact>
            <Button type="text" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </Flex>
        </Card>
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <TransactionsTable
          data={query.data?.items ?? []}
          loading={query.isFetching}
          onEdit={(transaction) => setModal({ open: true, transaction })}
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]), preserveSelectedRowKeys: true }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: query.data?.total,
            showSizeChanger: false,
            onChange: (p) => setFilters({ page: String(p) }),
          }}
        />
      </Card>
      <TransactionFormModal
        open={modal.open}
        transaction={modal.transaction}
        defaultAccountId={filters.accountId}
        onClose={() => setModal({ open: false })}
      />
    </>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsView />
    </Suspense>
  );
}
