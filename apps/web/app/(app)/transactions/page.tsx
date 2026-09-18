'use client';

import { ClearOutlined, FilterOutlined, PlusOutlined, ShopOutlined, TagsOutlined } from '@ant-design/icons';
import { TransactionSource, TransactionType } from '@arvo/types';
import { App, AutoComplete, Badge, Button, Card, Checkbox, DatePicker, Flex, Input, Segmented, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { CategorySelect } from '../../../components/category-select';
import { usePagedTable } from '../../../components/data-table';
import { MerchantSelect } from '../../../components/merchant-select';
import { PageHeader } from '../../../components/page-header';
import { TransactionFormModal } from '../../../components/transaction-form-modal';
import { TransactionsTable } from '../../../components/transactions-table';
import { api, errorMessage } from '../../../lib/api';
import { titleCase } from '../../../lib/format';
import { usePreferences } from '../../../lib/preferences';
import { useAccounts, useLedgerMutation, useMerchantSearch, useTransactions, type TransactionFilters } from '../../../lib/queries';
import type { Transaction } from '../../../lib/types';

const AMOUNT_PATTERN = /^\d{0,15}(\.\d{0,4})?$/;
const ADVANCED_KEYS = ['merchantId', 'withoutMerchant', 'uncategorized', 'direction', 'minAmount', 'maxAmount', 'source'] as const;

function TransactionsView() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const accounts = useAccounts();
  const { preferences } = usePreferences();

  // Filters live in the URL so views are shareable and survive reloads.
  const filters: TransactionFilters = useMemo(() => {
    const list = (key: string) => params.get(key)?.split(',').filter(Boolean);
    return {
      search: params.get('search') ?? undefined,
      accountId: params.get('accountId') ?? undefined,
      categoryId: params.get('categoryId') ?? undefined,
      uncategorized: params.get('uncategorized') === 'true' || undefined,
      merchantId: params.get('merchantId') ?? undefined,
      withoutMerchant: params.get('withoutMerchant') === 'true' || undefined,
      type: list('type') as TransactionType[] | undefined,
      source: list('source'),
      direction: (params.get('direction') as 'IN' | 'OUT' | null) ?? undefined,
      minAmount: params.get('minAmount') ?? undefined,
      maxAmount: params.get('maxAmount') ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    };
  }, [params]);
  const page = Number(params.get('page') ?? '1');

  const setFilters = (patch: Record<string, string | string[] | boolean | undefined | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      const v = Array.isArray(value) ? value.join(',') : value === true ? 'true' : value || '';
      if (v) next.set(key, v);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`/transactions?${next.toString()}`);
  };

  const query = useTransactions({ ...filters, limit: preferences.pageSize, offset: (page - 1) * preferences.pageSize });
  const pagination = usePagedTable(query.data?.total, page, (p) => setFilters({ page: p > 1 ? String(p) : undefined }));

  const [searchText, setSearchText] = useState(filters.search ?? '');
  useEffect(() => setSearchText(filters.search ?? ''), [filters.search]);
  const [amounts, setAmounts] = useState({ min: filters.minAmount ?? '', max: filters.maxAmount ?? '' });
  useEffect(() => setAmounts({ min: filters.minAmount ?? '', max: filters.maxAmount ?? '' }), [filters.minAmount, filters.maxAmount]);

  const advancedCount = ADVANCED_KEYS.filter((k) => params.has(k)).length;
  const [showAdvanced, setShowAdvanced] = useState(advancedCount > 0);

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [bulkMerchant, setBulkMerchant] = useState('');
  const merchantSuggestions = useMerchantSearch(bulkMerchant);
  const [modal, setModal] = useState<{ open: boolean; transaction?: Transaction }>({ open: false });

  const bulk = useLedgerMutation((body: Record<string, unknown>) =>
    api<{ updated: number }>('/transactions/bulk-update', { method: 'POST', body: { transactionIds: selected, ...body } }),
  );
  const applyBulk = async (body: Record<string, unknown>, label: string) => {
    try {
      const { updated } = await bulk.mutateAsync(body);
      message.success(`${label} for ${updated} transactions`);
      setSelected([]);
      setBulkMerchant('');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const applyAmounts = () => {
    const clean = (v: string) => (v && AMOUNT_PATTERN.test(v) && v !== '.' ? v : undefined);
    setFilters({ minAmount: clean(amounts.min), maxAmount: clean(amounts.max) });
  };

  const hasFilters = [...params.keys()].some((k) => k !== 'page');

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Search, filter and tidy up your ledger."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
            Add transaction
          </Button>
        }
      />

      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <Flex wrap gap={12} align="center">
          <Input.Search
            placeholder="Search description or merchant"
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={(value) => setFilters({ search: value })}
            /* Grows into spare space on a desktop, shrinks to the card width on a phone. */
            style={{ flex: '1 1 240px', minWidth: 200, maxWidth: 320 }}
          />
          <DatePicker.RangePicker
            style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 300 }}
            value={filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null}
            onChange={(range) => setFilters({ from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') })}
            format="D MMM YY"
          />
          <Select
            placeholder="Account"
            allowClear
            showSearch
            optionFilterProp="label"
            popupMatchSelectWidth={false}
            style={{ flex: '1 1 170px', minWidth: 150, maxWidth: 240 }}
            value={filters.accountId}
            onChange={(accountId) => setFilters({ accountId })}
            options={accounts.data?.map((a) => ({ value: a.id, label: a.name }))}
          />
          <CategorySelect
            style={{ flex: '1 1 180px', minWidth: 150, maxWidth: 240 }}
            value={filters.categoryId}
            onChange={(categoryId) => setFilters({ categoryId, uncategorized: undefined })}
          />
          <Select
            mode="multiple"
            placeholder="Type"
            allowClear
            maxTagCount="responsive"
            style={{ flex: '1 1 170px', minWidth: 150, maxWidth: 240 }}
            value={filters.type ?? []}
            onChange={(type) => setFilters({ type })}
            options={Object.values(TransactionType).map((t) => ({ value: t, label: titleCase(t) }))}
          />
          <Badge count={advancedCount} size="small" color="var(--ant-color-primary)">
            <Button icon={<FilterOutlined />} type={showAdvanced ? 'primary' : 'default'} ghost={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
              More filters
            </Button>
          </Badge>
          {hasFilters && (
            <Button type="text" icon={<ClearOutlined />} onClick={() => router.replace('/transactions')}>
              Clear
            </Button>
          )}
        </Flex>

        {showAdvanced && (
          <Flex wrap gap={16} align="center" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--ant-color-border)' }}>
            <Segmented
              value={filters.direction ?? 'ALL'}
              onChange={(v) => setFilters({ direction: v === 'ALL' ? undefined : v })}
              options={[
                { value: 'ALL', label: 'All money' },
                { value: 'OUT', label: 'Money out' },
                { value: 'IN', label: 'Money in' },
              ]}
            />
            <Space.Compact style={{ flex: '0 1 240px' }}>
              <Input
                style={{ minWidth: 0 }}
                placeholder="Min ₹"
                inputMode="decimal"
                value={amounts.min}
                onChange={(e) => AMOUNT_PATTERN.test(e.target.value) && setAmounts((a) => ({ ...a, min: e.target.value }))}
                onPressEnter={applyAmounts}
                onBlur={applyAmounts}
                aria-label="Minimum amount"
              />
              <Input
                style={{ minWidth: 0 }}
                placeholder="Max ₹"
                inputMode="decimal"
                value={amounts.max}
                onChange={(e) => AMOUNT_PATTERN.test(e.target.value) && setAmounts((a) => ({ ...a, max: e.target.value }))}
                onPressEnter={applyAmounts}
                onBlur={applyAmounts}
                aria-label="Maximum amount"
              />
            </Space.Compact>
            <MerchantSelect
              style={{ flex: '1 1 180px', minWidth: 150, maxWidth: 240 }}
              value={filters.merchantId}
              onChange={(merchantId) => setFilters({ merchantId, withoutMerchant: undefined })}
            />
            <Select
              mode="multiple"
              placeholder="Source"
              allowClear
              style={{ minWidth: 160 }}
              value={filters.source ?? []}
              onChange={(source) => setFilters({ source })}
              options={Object.values(TransactionSource).map((s) => ({ value: s, label: titleCase(s) }))}
            />
            <Checkbox
              checked={!!filters.uncategorized}
              disabled={!!filters.categoryId}
              onChange={(e) => setFilters({ uncategorized: e.target.checked || undefined })}
            >
              Uncategorized only
            </Checkbox>
            <Checkbox
              checked={!!filters.withoutMerchant}
              disabled={!!filters.merchantId}
              onChange={(e) => setFilters({ withoutMerchant: e.target.checked || undefined })}
            >
              No merchant
            </Checkbox>
          </Flex>
        )}
      </Card>

      {selected.length > 0 && (
        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
          <Flex align="center" gap={12} wrap>
            <Typography.Text strong>{selected.length} selected</Typography.Text>
            <Space.Compact style={{ flex: '1 1 280px', maxWidth: 360 }}>
              <CategorySelect
                style={{ flex: 1, minWidth: 0 }}
                value={bulkCategory}
                onChange={setBulkCategory}
                placeholder="Set category (empty clears)"
              />
              <Button
                icon={<TagsOutlined />}
                loading={bulk.isPending}
                onClick={() => applyBulk({ categoryId: bulkCategory }, bulkCategory ? 'Category set' : 'Category cleared')}
              >
                Apply
              </Button>
            </Space.Compact>
            <Space.Compact style={{ flex: '1 1 260px', maxWidth: 340 }}>
              <AutoComplete
                style={{ flex: 1, minWidth: 0 }}
                placeholder="Set merchant"
                value={bulkMerchant}
                onChange={setBulkMerchant}
                options={merchantSuggestions.data?.map((m) => ({ value: m.name }))}
              />
              <Button
                icon={<ShopOutlined />}
                loading={bulk.isPending}
                disabled={!bulkMerchant.trim()}
                onClick={() => applyBulk({ merchantName: bulkMerchant.trim() }, 'Merchant set')}
              >
                Apply
              </Button>
            </Space.Compact>
            <Button type="text" danger onClick={() => applyBulk({ merchantId: null }, 'Merchant cleared')}>
              Clear merchant
            </Button>
            <Button type="text" onClick={() => setSelected([])}>
              Deselect
            </Button>
          </Flex>
        </Card>
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <TransactionsTable
          toolbar={query.data ? `${query.data.total.toLocaleString('en-IN')} transactions` : ' '}
          data={query.data?.items ?? []}
          loading={query.isFetching}
          onEdit={(transaction) => setModal({ open: true, transaction })}
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]), preserveSelectedRowKeys: true }}
          pagination={pagination}
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
