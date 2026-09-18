'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Input, Segmented, Space } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DataTable, TableToolbar, useTableColumns } from '../data-table';
import { Eyebrow, Stamp } from '../planning';
import { formatDate } from '../../lib/format';
import { usePortfolioSummary } from '../../lib/queries';
import type { AssetClass, HoldingSummary } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { ASSET_CLASS_LABELS, KIND_LABELS, ReturnPercent } from './shared';

const FILTERS: { value: AssetClass | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'DEBT', label: 'Debt' },
  { value: 'GOLD', label: 'Gold' },
  { value: 'REAL_ESTATE', label: 'Property' },
  { value: 'CASH', label: 'Cash' },
];

/** Every holding with its position; click through for transactions, lots and lock-ins. */
export function HoldingsTable({ asOf, onAdd }: { asOf?: string; onAdd: () => void }) {
  const money = useMoney();
  const summary = usePortfolioSummary(asOf);
  const [search, setSearch] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass | 'ALL'>('ALL');

  const rows = useMemo(() => {
    const all = summary.data?.holdings ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter(
      (row) => (assetClass === 'ALL' || row.assetClass === assetClass) && (!needle || row.name.toLowerCase().includes(needle) || (row.amc ?? '').toLowerCase().includes(needle)),
    );
  }, [summary.data, search, assetClass]);

  const columns = useTableColumns<HoldingSummary>('portfolio-holdings', [
    {
      key: 'name',
      title: 'Holding',
      alwaysVisible: true,
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <Link href={`/portfolio/${row.id}`}>{row.name}</Link>
          <div>
            <Eyebrow>
              {KIND_LABELS[row.kind]}
              {row.amc ? ` · ${row.amc}` : ''}
              {row.plan ? ` · ${row.plan === 'DIRECT' ? 'Direct' : 'Regular'}` : ''}
            </Eyebrow>
          </div>
        </div>
      ),
    },
    {
      key: 'assetClass',
      title: 'Class',
      render: (_, row) => <Stamp $tone="neutral">{ASSET_CLASS_LABELS[row.assetClass]}</Stamp>,
    },
    { key: 'units', title: 'Units', align: 'right', render: (_, row) => Number(row.units).toLocaleString('en-IN', { maximumFractionDigits: 3 }) },
    {
      key: 'price',
      title: 'Price',
      align: 'right',
      render: (_, row) =>
        row.price ? (
          <div>
            <div>{money(row.price, row.currency)}</div>
            {row.priceDate && <Eyebrow>{formatDate(row.priceDate)}</Eyebrow>}
          </div>
        ) : (
          <Eyebrow>{row.valueSource === 'STATED' ? 'Stated value' : 'At cost'}</Eyebrow>
        ),
    },
    { key: 'invested', title: 'Invested', align: 'right', render: (_, row) => money(row.invested, row.currency) },
    { key: 'value', title: 'Value', align: 'right', render: (_, row) => money(row.value, row.currency) },
    {
      key: 'gain',
      title: 'Unrealised',
      align: 'right',
      render: (_, row) => (
        <div>
          <div>{money(row.unrealisedGain, row.currency)}</div>
          <ReturnPercent value={row.absoluteReturnPercent} />
        </div>
      ),
    },
    { key: 'xirr', title: 'XIRR', align: 'right', render: (_, row) => <ReturnPercent value={row.xirrPercent} /> },
    { key: 'share', title: 'Share', align: 'right', render: (_, row) => `${row.percentOfPortfolio}%` },
  ]);

  return (
    <Card
      styles={{ body: { padding: 0 } }}
      loading={summary.isPending}
      title="Holdings"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          Add holding
        </Button>
      }
    >
      <TableToolbar>
        <Space wrap>
          {/* At 375px a fixed 240px search plus the segmented filter overflowed the toolbar. */}
          <Input.Search allowClear placeholder="Search by name or AMC" style={{ width: 'min(240px, 100%)' }} onChange={(e) => setSearch(e.target.value)} />
          <Segmented size="small" options={FILTERS} value={assetClass} style={{ maxWidth: '100%', overflowX: 'auto' }} onChange={(value) => setAssetClass(value as AssetClass | 'ALL')} />
        </Space>
        {columns.settings}
      </TableToolbar>
      {rows.length === 0 ? (
        <Empty style={{ padding: '48px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing matches" />
      ) : (
        <DataTable<HoldingSummary> rowKey="id" columns={columns.columns} dataSource={rows} pagination={false} scroll={{ x: 'max-content' }} />
      )}
    </Card>
  );
}
