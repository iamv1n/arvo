'use client';

import { Alert, Card, Empty, Segmented, Skeleton, Space, Tooltip } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable, TableToolbar, useTableColumns } from '../data-table';
import { Eyebrow, Stamp } from '../planning';
import { formatDate } from '../../lib/format';
import { usePositions, type TradeFilters } from '../../lib/queries';
import type { TradePosition } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { DIRECTION_TONES, SEGMENT_LABELS, STYLE_LABELS, Muted, Pnl, num } from './shared';

/**
 * Round trips, not fills. Each row is one position rebuilt from the matched fills, so the P&L
 * is a number that actually happened rather than a running mark.
 */
export function PositionsTable({ asOf, filters }: { asOf: string; filters: TradeFilters }) {
  const money = useMoney();
  const [status, setStatus] = useState<'ALL' | 'CLOSED' | 'OPEN'>('ALL');
  const query = usePositions(asOf, filters);
  const currency = 'INR';

  const columns = useTableColumns<TradePosition>('trading-positions', [
    {
      key: 'label',
      title: 'Position',
      alwaysVisible: true,
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <Link href={`/trading/${row.id}?asOf=${asOf}`}>{row.label}</Link>
          <div>
            <Eyebrow>
              {SEGMENT_LABELS[row.segment]} · {row.broker}
              {row.settledAtExpiry ? ' · settled at expiry' : ''}
              {row.rolledFrom ? ' · rolled' : ''}
            </Eyebrow>
          </div>
        </div>
      ),
    },
    {
      key: 'direction',
      title: 'Side',
      render: (_, row) => <Stamp $tone={DIRECTION_TONES[row.direction]}>{row.direction}</Stamp>,
    },
    {
      key: 'opened',
      title: 'Held',
      render: (_, row) => (
        <div>
          <div>{formatDate(row.openedAt)}</div>
          <Muted>
            {row.status === 'OPEN' ? 'still open' : `to ${formatDate(row.closedAt!)}`} · {STYLE_LABELS[row.style]}
          </Muted>
        </div>
      ),
    },
    { key: 'quantity', title: 'Qty', align: 'right', render: (_, row) => (row.status === 'OPEN' ? `${row.openQuantity} open` : row.quantity) },
    { key: 'entry', title: 'Entry', align: 'right', render: (_, row) => money(row.averageEntryPrice, currency) },
    { key: 'exit', title: 'Exit', align: 'right', render: (_, row) => (row.averageExitPrice === null ? '—' : money(row.averageExitPrice, currency)) },
    { key: 'gross', title: 'Gross', align: 'right', render: (_, row) => <Pnl $value={num(row.grossPnl)}>{money(row.grossPnl, currency)}</Pnl> },
    {
      key: 'charges',
      title: 'Charges',
      align: 'right',
      render: (_, row) => (
        <Tooltip title={`${row.chargesPercentOfGross === null ? 'No gross profit to compare against' : `${row.chargesPercentOfGross}% of the gross profit`}`}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(row.charges.total, currency)}</span>
        </Tooltip>
      ),
    },
    {
      key: 'net',
      title: 'Net P&L',
      align: 'right',
      alwaysVisible: true,
      render: (_, row) => <Pnl $value={num(row.netPnl)}>{money(row.netPnl, currency)}</Pnl>,
    },
  ]);

  if (query.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }
  const data = query.data;
  if (!data || data.items.length === 0) {
    return (
      <Card>
        <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="No positions yet. Import a tradebook to see them." />
      </Card>
    );
  }

  const rows = data.items.filter((row) => status === 'ALL' || row.status === status);
  return (
    <>
      {data.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Some contracts could not be matched cleanly"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.warnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          }
        />
      )}
      <Card styles={{ body: { padding: 0 } }}>
        <TableToolbar>
          <Space size={12} wrap>
            <Segmented
              value={status}
              onChange={(value) => setStatus(value as typeof status)}
              options={[
                { label: `All ${data.items.length}`, value: 'ALL' },
                { label: `Closed ${data.closedCount}`, value: 'CLOSED' },
                { label: `Open ${data.openCount}`, value: 'OPEN' },
              ]}
            />
            <Eyebrow>Matched first in, first out · as of {formatDate(data.asOf)}</Eyebrow>
          </Space>
          {columns.settings}
        </TableToolbar>
        <DataTable<TradePosition> rowKey="id" dataSource={rows} columns={columns.columns} pagination={{ pageSize: 25, showSizeChanger: true }} />
      </Card>
    </>
  );
}
