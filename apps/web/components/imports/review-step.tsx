'use client';

import { CheckOutlined, CloseOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons';
import { TransactionType } from '@arvo/types';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Flex,
  Form,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { api, errorMessage } from '../../lib/api';
import { formatDate, titleCase } from '../../lib/format';
import { useImportMutation, useImportRows } from '../../lib/queries';
import type { ImportRow, ImportRowStatus, ImportSummary } from '../../lib/types';
import { Amount } from '../amount';
import { CategorySelect } from '../category-select';
import { RowStatusTag } from './status-tags';

const PAGE_SIZE = 50;

type Filter = 'ALL' | ImportRowStatus | 'PENDING';

const Stat = styled.button<{ $active: boolean; $tone: string }>`
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: block;
  width: 100%;
  padding: ${({ theme }) => theme.space[4]}px ${({ theme }) => theme.space[5]}px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.brand : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.brandSubtle : theme.colors.bgSurface)};
  transition: border-color ${({ theme }) => theme.motion.fast};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 2px;
  }

  strong {
    display: block;
    font-size: ${({ theme }) => theme.typography.fontSize['2xl']}px;
    font-variant-numeric: tabular-nums;
    color: ${({ $tone }) => $tone};
  }

  span {
    font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const SkippedRows = styled.div`
  .arvo-row-skipped td {
    opacity: 0.5;
  }
`;

const SOURCE_LABEL = { RULE: 'Rule', MERCHANT: 'Merchant', HISTORY: 'History', AI: 'AI', USER: 'You' } as const;

export function ReviewStep({ summary, onRemap }: { summary: ImportSummary; onRemap: () => void }) {
  const { message, modal } = App.useApp();
  const theme = useTheme();
  const batchId = summary.batch.id;
  const [filter, setFilter] = useState<Filter>('ALL');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ImportRow | null>(null);

  const rows = useImportRows(batchId, {
    status: filter === 'ALL' || filter === 'PENDING' ? undefined : [filter],
    decision: filter === 'PENDING' ? ['PENDING'] : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const update = useImportMutation(({ id, ...patch }: { id: string } & Record<string, unknown>) =>
    api<ImportRow>(`/imports/${batchId}/rows/${id}`, { method: 'PATCH', body: patch }),
  );
  const decide = useImportMutation((body: { decision: string; statuses?: ImportRowStatus[]; rowIds?: string[] }) =>
    api<{ updated: number }>(`/imports/${batchId}/decisions`, { method: 'POST', body }),
  );
  const commit = useImportMutation(() => api<ImportSummary>(`/imports/${batchId}/commit`, { method: 'POST' }), { ledger: true });
  const cancel = useImportMutation(() => api(`/imports/${batchId}/cancel`, { method: 'POST' }));

  const run = async <T,>(promise: Promise<T>, success?: string) => {
    try {
      const result = await promise;
      if (success) message.success(success);
      return result;
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const { counts } = summary;
  const toImport = counts.byDecision.ACCEPT;
  const pending = counts.byDecision.PENDING;
  const skippedLines = summary.errors.filter((e) => e.code === 'ROW_SKIPPED');
  const fileWarnings = summary.errors.filter((e) => e.code === 'FILE_WARNING');

  const stats: { key: Filter; label: string; value: number; tone: string }[] = [
    { key: 'ALL', label: 'transactions detected', value: counts.total, tone: theme.colors.textPrimary },
    { key: 'VALID', label: 'valid', value: counts.byStatus.VALID, tone: theme.colors.success },
    { key: 'POSSIBLE_DUPLICATE', label: 'possible duplicates', value: counts.byStatus.POSSIBLE_DUPLICATE, tone: theme.colors.warning },
    { key: 'AMBIGUOUS', label: 'ambiguous', value: counts.byStatus.AMBIGUOUS, tone: theme.colors.info },
    { key: 'INVALID', label: 'invalid', value: counts.byStatus.INVALID, tone: theme.colors.danger },
  ];

  const confirmCommit = () =>
    modal.confirm({
      title: `Add ${toImport} transactions to your ledger?`,
      content: `${counts.byDecision.REJECT} rows will be skipped. You can delete imported transactions later, but duplicates you accept will be counted.`,
      okText: 'Commit',
      onOk: () => run(commit.mutateAsync(undefined), `${toImport} transactions added`),
    });

  return (
    <Flex vertical gap={16}>
      {fileWarnings.map((w) => (
        <Alert key={w.message} type="warning" showIcon title={w.message} />
      ))}

      <Row gutter={[12, 12]}>
        {stats.map((s) => (
          <Col key={s.key} xs={12} md={8} xl={{ flex: '1 1 0' }}>
            <Stat
              $active={filter === s.key}
              $tone={s.tone}
              onClick={() => {
                setFilter(s.key);
                setPage(1);
              }}
            >
              <strong>{s.value.toLocaleString('en-IN')}</strong>
              <span>{s.label}</span>
            </Stat>
          </Col>
        ))}
      </Row>

      {pending > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          title={`${pending} ${pending === 1 ? 'row needs' : 'rows need'} your decision before committing`}
          description="Possible duplicates match a transaction already in your ledger (or an earlier line in this file). Ambiguous rows have an unclear direction or type. Nothing is ever dropped silently."
          action={
            <Button
              size="small"
              onClick={() => {
                setFilter('PENDING');
                setPage(1);
              }}
            >
              Show them
            </Button>
          }
        />
      )}

      <Card
        styles={{ body: { padding: 0 } }}
        title={
          <Segmented<Filter>
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'PENDING', label: `Needs decision (${pending})` },
              { value: 'POSSIBLE_DUPLICATE', label: 'Duplicates' },
              { value: 'AMBIGUOUS', label: 'Ambiguous' },
              { value: 'INVALID', label: 'Invalid' },
            ]}
          />
        }
        extra={
          <Dropdown
            menu={{
              items: [
                { key: 'dup-reject', label: 'Skip all possible duplicates' },
                { key: 'dup-accept', label: 'Import all possible duplicates' },
                { type: 'divider' },
                { key: 'amb-accept', label: 'Import all ambiguous rows as they are' },
                { key: 'amb-reject', label: 'Skip all ambiguous rows' },
              ],
              onClick: ({ key }) => {
                const [kind, decision] = key.split('-');
                const status: ImportRowStatus = kind === 'dup' ? 'POSSIBLE_DUPLICATE' : 'AMBIGUOUS';
                void run(
                  decide.mutateAsync({ decision: decision === 'accept' ? 'ACCEPT' : 'REJECT', statuses: [status] }),
                  'Updated',
                );
              },
            }}
          >
            <Button>Bulk decisions</Button>
          </Dropdown>
        }
      >
        <SkippedRows>
        <Table<ImportRow>
          rowKey="id"
          size="middle"
          loading={rows.isFetching}
          dataSource={rows.data?.items}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: rows.data?.total,
            showSizeChanger: false,
            onChange: setPage,
          }}
          rowClassName={(r) => (r.decision === 'REJECT' ? 'arvo-row-skipped' : '')}
          columns={[
            { title: '#', dataIndex: 'rowNumber', width: 56 },
            { title: 'Status', width: 150, render: (_, r) => <RowStatusTag status={r.status} /> },
            {
              title: 'Date',
              width: 124,
              render: (_, r) => (r.date ? <span style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</span> : <Typography.Text type="danger">{r.raw.find(Boolean) ?? '—'}</Typography.Text>),
            },
            {
              title: 'Description',
              render: (_, r) => (
                <div style={{ minWidth: 200 }}>
                  <Typography.Text ellipsis style={{ display: 'block', maxWidth: 320 }}>
                    {r.description ?? '—'}
                  </Typography.Text>
                  {r.issues.length > 0 && (
                    <Typography.Text type="danger" style={{ fontSize: 12 }}>
                      {r.issues.map((i) => i.message).join(' · ')}
                    </Typography.Text>
                  )}
                  {r.status === 'POSSIBLE_DUPLICATE' && (
                    <Typography.Text type="warning" style={{ fontSize: 12 }}>
                      {r.duplicateOfTransactionId ? 'Matches a transaction already in your ledger' : 'Same as an earlier line in this file'}
                    </Typography.Text>
                  )}
                </div>
              ),
            },
            {
              title: 'Amount',
              align: 'right',
              width: 140,
              render: (_, r) => (r.amount ? <Amount value={r.amount} currency={r.currency ?? 'INR'} type={r.type ?? undefined} /> : '—'),
            },
            {
              title: 'Type',
              width: 140,
              render: (_, r) => (
                <Select
                  size="small"
                  variant="borderless"
                  value={r.type ?? undefined}
                  placeholder="Type"
                  style={{ width: 130 }}
                  disabled={!r.amount}
                  onChange={(type) => void run(update.mutateAsync({ id: r.id, type }))}
                  options={Object.values(TransactionType).map((t) => ({ value: t, label: titleCase(t) }))}
                />
              ),
            },
            {
              title: 'Category',
              width: 220,
              render: (_, r) => (
                <Flex vertical>
                  <CategorySelect
                    value={r.categoryId}
                    style={{ width: 200, minWidth: 0 }}
                    onChange={(categoryId) => void run(update.mutateAsync({ id: r.id, categoryId }))}
                  />
                  {r.categorizationSource && (
                    <Typography.Text type="secondary" style={{ fontSize: 11, paddingLeft: 4 }}>
                      by {SOURCE_LABEL[r.categorizationSource]}
                      {r.merchantName ? ` · ${r.merchantName}` : ''}
                    </Typography.Text>
                  )}
                </Flex>
              ),
            },
            {
              title: 'Decision',
              width: 190,
              render: (_, r) => (
                <Flex gap={4} align="center">
                  <Tooltip title={r.status === 'INVALID' ? 'Fix the row first' : 'Import this row'}>
                    <Button
                      size="small"
                      type={r.decision === 'ACCEPT' ? 'primary' : 'default'}
                      icon={<CheckOutlined />}
                      disabled={r.status === 'INVALID'}
                      onClick={() => void run(update.mutateAsync({ id: r.id, decision: 'ACCEPT' }))}
                      aria-label="Import row"
                    />
                  </Tooltip>
                  <Tooltip title="Skip this row">
                    <Button
                      size="small"
                      danger={r.decision === 'REJECT'}
                      type={r.decision === 'REJECT' ? 'primary' : 'default'}
                      icon={<CloseOutlined />}
                      onClick={() => void run(update.mutateAsync({ id: r.id, decision: 'REJECT' }))}
                      aria-label="Skip row"
                    />
                  </Tooltip>
                  <Tooltip title="Edit">
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label="Edit row" />
                  </Tooltip>
                  {r.decision === 'PENDING' && (
                    <Typography.Text type="warning" style={{ fontSize: 12 }}>
                      Decide
                    </Typography.Text>
                  )}
                </Flex>
              ),
            },
          ]}
        />
        </SkippedRows>
      </Card>

      {skippedLines.length > 0 && (
        <Typography.Text type="secondary">
          {skippedLines.length} non-transaction {skippedLines.length === 1 ? 'line was' : 'lines were'} ignored (titles, totals, blank
          separators), e.g. line {skippedLines[0].rowNumber}: “{skippedLines[0].message}”.
        </Typography.Text>
      )}

      <Card>
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Flex gap={8} wrap>
            <Button onClick={onRemap}>Change column mapping</Button>
            <Button
              danger
              type="text"
              onClick={() =>
                modal.confirm({
                  title: 'Cancel this import?',
                  content: 'Nothing has been added to your ledger. You can delete the import afterwards.',
                  okText: 'Cancel import',
                  okButtonProps: { danger: true },
                  cancelText: 'Keep reviewing',
                  onOk: () => run(cancel.mutateAsync(undefined), 'Import cancelled'),
                })
              }
            >
              Cancel import
            </Button>
          </Flex>
          <Flex gap={16} align="center" wrap>
            <Typography.Text type="secondary">
              {toImport} to import · {counts.byDecision.REJECT} skipped
            </Typography.Text>
            <Tooltip title={pending > 0 ? `Decide on ${pending} rows first` : undefined}>
              <Button type="primary" size="large" disabled={pending > 0 || toImport === 0} loading={commit.isPending} onClick={confirmCommit}>
                Commit {toImport} transactions
              </Button>
            </Tooltip>
          </Flex>
        </Flex>
      </Card>

      <EditRowModal
        row={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          const saved = await run(update.mutateAsync({ id: editing.id, ...patch }), 'Row updated');
          if (saved) setEditing(null);
        }}
        saving={update.isPending}
      />
    </Flex>
  );
}

interface EditValues {
  date: Dayjs | null;
  description: string;
  direction: 'IN' | 'OUT';
  amount: string;
  type: TransactionType;
  merchantName?: string;
}

function EditRowModal({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: ImportRow | null;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [form] = Form.useForm<EditValues>();
  return (
    <Modal
      open={!!row}
      title={row ? `Edit row ${row.rowNumber}` : ''}
      okText="Save"
      onCancel={onClose}
      confirmLoading={saving}
      destroyOnHidden
      afterOpenChange={(open) => {
        if (!open || !row) return;
        form.setFieldsValue({
          date: row.date ? dayjs(row.date) : null,
          description: row.description ?? '',
          direction: row.amount?.startsWith('-') ? 'OUT' : 'IN',
          amount: row.amount?.replace('-', '') ?? '',
          type: row.type ?? TransactionType.EXPENSE,
          merchantName: row.merchantName ?? undefined,
        });
      }}
      onOk={async () => {
        const v = await form.validateFields();
        await onSave({
          date: v.date?.format('YYYY-MM-DD'),
          description: v.description,
          amount: v.direction === 'OUT' ? `-${v.amount}` : v.amount,
          type: v.type,
          merchantName: v.merchantName || null,
        });
      }}
    >
      {row && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Original line: {row.raw.filter(Boolean).join(' | ')}
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={12}>
          <Col span={10}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="D MMM YYYY" />
            </Form.Item>
          </Col>
          <Col span={14}>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select options={Object.values(TransactionType).map((t) => ({ value: t, label: titleCase(t) }))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="Description" rules={[{ required: true, max: 500 }]}>
          <Input />
        </Form.Item>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="direction" label="Direction">
              <Select options={[{ value: 'OUT', label: 'Out' }, { value: 'IN', label: 'In' }]} />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }, { pattern: /^\d{1,15}(\.\d{1,4})?$/, message: 'A positive number' }]}>
              <Input inputMode="decimal" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="merchantName" label="Merchant">
          <Input placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
