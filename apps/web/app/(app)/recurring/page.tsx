'use client';

import { EyeInvisibleOutlined, EyeOutlined, RiseOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Flex, Progress, Segmented, Tag, Tooltip, Typography } from 'antd';
import { DataTable, useTableColumns, type DataColumn } from '../../../components/data-table';
import { useState } from 'react';
import { PageHeader } from '../../../components/page-header';
import { ResultStrip } from '../../../components/result-strip';
import { api, errorMessage } from '../../../lib/api';
import { formatDate, formatMoney, titleCase } from '../../../lib/format';
import { useAccounts, useCategories, useLedgerMutation, useRecurring } from '../../../lib/queries';
import type { RecurringSeries } from '../../../lib/types';

type View = 'active' | 'stopped' | 'dismissed';

export default function RecurringPage() {
  const { message } = App.useApp();
  const recurring = useRecurring();
  const accounts = useAccounts();
  const categories = useCategories();
  const [view, setView] = useState<View>('active');
  const accountName = new Map((accounts.data ?? []).map((a) => [a.id, a.name]));
  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const toggle = useLedgerMutation(({ id, isDismissed }: { id: string; isDismissed: boolean }) =>
    api<RecurringSeries>(`/analytics/recurring/${id}`, { method: 'PATCH', body: { isDismissed } }),
  );

  const data = recurring.data;
  const currency = data?.currency ?? 'INR';
  const series = data?.series ?? [];
  const visible = series.filter((s) =>
    view === 'dismissed' ? s.isDismissed : !s.isDismissed && (view === 'active' ? s.status === 'ACTIVE' : s.status === 'STOPPED'),
  );
  const increases = series.filter((s) => !s.isDismissed && s.status === 'ACTIVE' && s.priceIncreased);

  const { columns, settings } = useTableColumns<RecurringSeries>('recurring', [
            {
              key: 'name',
              alwaysVisible: true,
              title: 'Name',
              width: 260,
              render: (_, s) => (
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong ellipsis style={{ display: 'block' }}>
                    {s.label}
                  </Typography.Text>
                  <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
                    {[s.categoryId && categoryName.get(s.categoryId), accountName.get(s.accountId)].filter(Boolean).join(' · ')}
                  </Typography.Text>
                </div>
              ),
            },
            { key: 'frequency', title: 'Frequency', width: 120, render: (_, s) => <Tag variant="filled">{titleCase(s.frequency)}</Tag> },
            {
              key: 'amount',
              title: 'Amount',
              align: 'right',
              width: 170,
              render: (_, s) => {
                const increased = s.priceIncreased;
                return (
                  <div>
                    <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(s.lastAmount, currency)}
                    </Typography.Text>
                    {increased && (
                      <Tooltip title={`Was ${formatMoney(s.previousAmount!, currency)}`}>
                        <Tag color="red" variant="filled" style={{ marginInlineStart: 6, marginInlineEnd: 0 }}>
                          <RiseOutlined /> up
                        </Tag>
                      </Tooltip>
                    )}
                  </div>
                );
              },
            },
            { key: 'monthlyCost', title: 'Monthly cost', align: 'right', width: 140, render: (_, s) => formatMoney(s.monthlyCost, currency) },
            { key: 'lastSeen', title: 'Last charged', width: 130, render: (_, s) => formatDate(s.lastSeen) },
            {
              key: 'nextExpected',
              title: 'Next expected',
              width: 140,
              render: (_, s) =>
                s.status === 'STOPPED' ? <Typography.Text type="secondary">Stopped</Typography.Text> : formatDate(s.nextExpected),
            },
            {
              key: 'confidence',
              title: 'Confidence',
              width: 130,
              render: (_, s) => (
                <Tooltip title={`${s.occurrences} payments detected`}>
                  <Progress percent={Math.round(s.confidence * 100)} size="small" showInfo={false} />
                </Tooltip>
              ),
            },
            {
              key: 'actions',
              alwaysVisible: true,
              label: 'Actions',
              width: 60,
              render: (_, s) => (
                <Tooltip title={s.isDismissed ? 'Restore' : 'Not recurring? Dismiss'}>
                  <Button
                    type="text"
                    icon={s.isDismissed ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                    aria-label={s.isDismissed ? 'Restore' : 'Dismiss'}
                    onClick={() =>
                      toggle.mutateAsync({ id: s.id, isDismissed: !s.isDismissed }).catch((e) => message.error(errorMessage(e)))
                    }
                  />
                </Tooltip>
              ),
            },
  ] as DataColumn<RecurringSeries>[]);

  return (
    <>
      <PageHeader title="Recurring" subtitle="Subscriptions, EMIs and bills detected from your transactions." />
      {/* Money totals and a list of names: long, not round, and the increases hint used to run
          past the edge of a stat card. A ruled ribbon lets each figure be as long as it is. */}
      <div style={{ marginBottom: 16 }}>
        <ResultStrip
          items={[
          {
            label: 'Per month',
            value: data ? formatMoney(data.monthlyTotal, currency) : '—',
            caveat: 'Active, not dismissed',
          },
          { label: 'Per year', value: data ? formatMoney(data.annualTotal, currency) : '—' },
          {
            label: 'Price increases',
            value: data ? String(data.priceIncreases) : '—',
            tone: increases.length ? 'negative' : 'neutral',
            caveat: increases.length ? increases.map((s) => s.label).join(', ') : 'None detected',
          },
          ]}
        />
      </div>


      <Card
        title={
          /* The view switch scrolls sideways on a phone instead of stretching the card header. */
          <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: `Active (${series.filter((s) => !s.isDismissed && s.status === 'ACTIVE').length})` },
              { value: 'stopped', label: 'Stopped' },
              { value: 'dismissed', label: 'Dismissed' },
            ]}
          />
          </div>
        }
        extra={settings}
        styles={{ body: { padding: 0 } }}
      >
        <DataTable<RecurringSeries>
          rowKey="id"
          loading={recurring.isFetching}
          dataSource={visible}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="Nothing here. Recurring charges appear after 3 regular payments." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          columns={columns}
        />
      </Card>
      <Flex justify="flex-end" style={{ marginTop: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Detected from the last 14 months. Dismissed items stay hidden when detection re-runs.
        </Typography.Text>
      </Flex>
    </>
  );
}
