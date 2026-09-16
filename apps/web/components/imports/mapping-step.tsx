'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Flex, Select, Switch, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { api, errorMessage } from '../../lib/api';
import { useImportMutation } from '../../lib/queries';
import type { ColumnMapping, ImportBatch, ImportSummary } from '../../lib/types';

type Role = 'ignore' | 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'direction' | 'balance' | 'reference' | 'currency';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount (signed)' },
  { value: 'debit', label: 'Debit / withdrawal' },
  { value: 'credit', label: 'Credit / deposit' },
  { value: 'direction', label: 'Dr/Cr indicator' },
  { value: 'balance', label: 'Balance' },
  { value: 'reference', label: 'Reference' },
  { value: 'currency', label: 'Currency' },
];

const DATE_FORMATS = [
  'DD/MM/YYYY', 'DD/MM/YY', 'DD-MM-YYYY', 'DD-MM-YY', 'DD.MM.YYYY', 'DD-MMM-YYYY', 'DD MMM YYYY', 'DD-MMM-YY',
  'DD MMM YY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'MM/DD/YYYY', 'MM/DD/YY', 'MM-DD-YYYY', 'MMM DD, YYYY',
];

const SINGLE_ROLES: Role[] = ['date', 'amount', 'debit', 'credit', 'direction', 'balance', 'reference', 'currency'];

function rolesFromMapping(mapping: ColumnMapping | null, columnCount: number): Role[] {
  const roles: Role[] = Array.from({ length: columnCount }, () => 'ignore');
  if (!mapping) return roles;
  for (const role of SINGLE_ROLES) {
    const index = mapping[role as keyof ColumnMapping];
    if (typeof index === 'number' && index < columnCount) roles[index] = role;
  }
  for (const index of mapping.description) if (index < columnCount) roles[index] = 'description';
  return roles;
}

const HeaderCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]}px;
  min-width: 150px;

  span {
    font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
    color: ${({ theme }) => theme.colors.textMuted};
    font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export function MappingStep({ batch, onProcessed }: { batch: ImportBatch; onProcessed: (summary: ImportSummary) => void }) {
  const { message } = App.useApp();
  const detection = batch.detection;
  const initial = batch.mapping ?? detection?.suggestedMapping ?? null;
  const [tableIndex, setTableIndex] = useState(initial?.tableIndex ?? detection?.tables[0]?.index ?? 0);
  const table = detection?.tables.find((t) => t.index === tableIndex) ?? detection?.tables[0];
  const columnCount = table?.headers.length ?? 0;

  const [roles, setRoles] = useState<Role[]>(() =>
    initial && initial.tableIndex === tableIndex ? rolesFromMapping(initial, columnCount) : Array(columnCount).fill('ignore'),
  );
  const [dateFormat, setDateFormat] = useState(initial?.dateFormat ?? detection?.dateFormatCandidates[0] ?? 'DD/MM/YYYY');
  const [invert, setInvert] = useState(initial?.invertAmounts ?? false);

  const process = useImportMutation((mapping: ColumnMapping) =>
    api<ImportSummary>(`/imports/${batch.id}/process`, { method: 'POST', body: { mapping } }),
  );

  const switchTable = (index: number) => {
    setTableIndex(index);
    const next = detection?.tables.find((t) => t.index === index);
    setRoles(Array(next?.headers.length ?? 0).fill('ignore'));
  };

  const setRole = (column: number, role: Role) => {
    setRoles((current) =>
      current.map((r, i) => {
        if (i === column) return role;
        // Single-use roles move rather than duplicate; amount and debit/credit are exclusive.
        if (SINGLE_ROLES.includes(role) && r === role) return 'ignore';
        if (role === 'amount' && (r === 'debit' || r === 'credit')) return 'ignore';
        if ((role === 'debit' || role === 'credit') && (r === 'amount' || r === 'direction')) return 'ignore';
        return r;
      }),
    );
  };

  const mapping = useMemo((): { value: ColumnMapping | null; problem: string | null } => {
    const find = (role: Role) => {
      const i = roles.indexOf(role);
      return i >= 0 ? i : undefined;
    };
    const description = roles.flatMap((r, i) => (r === 'description' ? [i] : []));
    const date = find('date');
    const amount = find('amount');
    const debit = find('debit');
    const credit = find('credit');
    if (date === undefined) return { value: null, problem: 'Choose the date column' };
    if (description.length === 0) return { value: null, problem: 'Choose at least one description column' };
    if (amount === undefined && debit === undefined && credit === undefined) {
      return { value: null, problem: 'Choose an amount column, or debit and credit columns' };
    }
    return {
      value: {
        tableIndex: table?.index ?? 0,
        headerRowIndex: table?.headerRowIndex ?? -1,
        date,
        description,
        amount,
        debit,
        credit,
        direction: find('direction'),
        balance: find('balance'),
        reference: find('reference'),
        currency: find('currency'),
        dateFormat,
        invertAmounts: invert,
      },
      problem: null,
    };
  }, [roles, table, dateFormat, invert]);

  const submit = async () => {
    if (!mapping.value) return;
    try {
      onProcessed(await process.mutateAsync(mapping.value));
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  if (!detection || !table) {
    return <Alert type="error" showIcon title="Nothing could be read from this file" description={batch.errorMessage} />;
  }

  const candidates = detection.dateFormatCandidates;
  const dateOptions = [...candidates, ...DATE_FORMATS.filter((f) => !candidates.includes(f))].map((f) => ({
    value: f,
    label: candidates.includes(f) ? (
      <Flex justify="space-between" gap={8}>
        {f}
        <Tag color="green" variant="filled" style={{ margin: 0 }}>
          fits
        </Tag>
      </Flex>
    ) : (
      f
    ),
  }));

  return (
    <Flex vertical gap={16}>
      {detection.warnings.map((warning) => (
        <Alert key={warning} type="warning" showIcon title={warning} />
      ))}
      {detection.mappingSource === 'REMEMBERED' && (
        <Alert type="success" showIcon title="Using the column mapping you confirmed last time for this statement format." />
      )}
      {detection.mappingSource === 'AUTO' && (
        <Alert type="info" showIcon title="Columns were detected automatically. Check them against the preview below." />
      )}

      <Card>
        <Flex wrap gap={24} align="flex-end">
          {detection.tables.length > 1 && (
            <div>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                Sheet
              </Typography.Text>
              <Select
                value={table.index}
                onChange={switchTable}
                style={{ minWidth: 200 }}
                options={detection.tables.map((t) => ({ value: t.index, label: `${t.name} · ${t.rowCount} rows` }))}
              />
            </div>
          )}
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Date format
            </Typography.Text>
            <Select value={dateFormat} onChange={setDateFormat} style={{ width: 200 }} options={dateOptions} />
          </div>
          <Flex gap={8} align="center">
            <Switch checked={invert} onChange={setInvert} />
            <Typography.Text>Spending is shown as positive (flip signs)</Typography.Text>
          </Flex>
        </Flex>
      </Card>

      <Card title="Match columns" extra={<Typography.Text type="secondary">Preview of the first rows</Typography.Text>} styles={{ body: { padding: 0 } }}>
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          rowKey={(_, i) => String(i)}
          dataSource={table.sampleRows}
          columns={table.headers.map((header, index) => ({
            key: index,
            title: (
              <HeaderCell>
                <span title={header}>{header}</span>
                <Select
                  size="small"
                  value={roles[index] ?? 'ignore'}
                  onChange={(role: Role) => setRole(index, role)}
                  options={ROLE_OPTIONS}
                  aria-label={`Role of column ${header}`}
                />
              </HeaderCell>
            ),
            render: (_: unknown, row: string[]) => (
              <Typography.Text
                type={roles[index] === 'ignore' ? 'secondary' : undefined}
                ellipsis
                style={{ maxWidth: 260 }}
              >
                {row[index]}
              </Typography.Text>
            ),
          }))}
        />
      </Card>

      <Flex justify="flex-end" align="center" gap={16} wrap>
        {mapping.problem && <Typography.Text type="secondary">{mapping.problem}</Typography.Text>}
        <Button type="primary" size="large" icon={<ArrowRightOutlined />} iconPlacement="end" disabled={!mapping.value} loading={process.isPending} onClick={submit}>
          Review {table.rowCount} rows
        </Button>
      </Flex>
    </Flex>
  );
}
