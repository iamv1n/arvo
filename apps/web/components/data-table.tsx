'use client';

import { SettingOutlined } from '@ant-design/icons';
import { Button, Checkbox, Divider, Flex, Popover, Segmented, Switch, Table, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import { usePreferences, type Preferences } from '../lib/preferences';

export interface DataColumn<T> extends ColumnType<T> {
  key: string;
  /** Label in the column picker when the title is not plain text. */
  label?: string;
  /** Columns that must always show (e.g. the row actions or the primary name). */
  alwaysVisible?: boolean;
}

const DENSITY_OPTIONS: { value: Preferences['tableDensity']; label: string }[] = [
  { value: 'small', label: 'Compact' },
  { value: 'middle', label: 'Comfortable' },
  { value: 'large', label: 'Spacious' },
];

function columnLabel<T>(column: DataColumn<T>): string {
  if (column.label) return column.label;
  if (typeof column.title === 'string') return column.title;
  return column.key;
}

/**
 * Applies the user's saved column visibility for a table and returns a settings button
 * (column picker, density, striped rows) to place in the surrounding card's header.
 */
export function useTableColumns<T>(tableId: string, columns: DataColumn<T>[]): { columns: DataColumn<T>[]; settings: ReactNode } {
  const { preferences, update, setHiddenColumns } = usePreferences();
  const hidden = useMemo(() => new Set(preferences.hiddenColumns[tableId] ?? []), [preferences.hiddenColumns, tableId]);
  const visible = useMemo(() => columns.filter((c) => c.alwaysVisible || !hidden.has(c.key)), [columns, hidden]);
  const hideable = columns.filter((c) => !c.alwaysVisible);

  const content = (
    <Flex vertical gap={8} style={{ minWidth: 220 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Columns
      </Typography.Text>
      {hideable.map((column) => (
        <Checkbox
          key={column.key}
          checked={!hidden.has(column.key)}
          onChange={(e) => {
            const next = new Set(hidden);
            if (e.target.checked) next.delete(column.key);
            else next.add(column.key);
            setHiddenColumns(tableId, [...next]);
          }}
        >
          {columnLabel(column)}
        </Checkbox>
      ))}
      <Divider style={{ margin: '4px 0' }} />
      <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Density
      </Typography.Text>
      <Segmented
        size="small"
        block
        value={preferences.tableDensity}
        onChange={(tableDensity) => update({ tableDensity })}
        options={DENSITY_OPTIONS}
      />
      <Flex justify="space-between" align="center">
        <Typography.Text>Striped rows</Typography.Text>
        <Switch size="small" checked={preferences.stripedRows} onChange={(stripedRows) => update({ stripedRows })} />
      </Flex>
      <Flex justify="space-between" align="center" gap={12}>
        <Typography.Text>Limit table height</Typography.Text>
        <Switch size="small" checked={preferences.compactTables} onChange={(compactTables) => update({ compactTables })} />
      </Flex>
      {hidden.size > 0 && (
        <Button size="small" type="link" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setHiddenColumns(tableId, [])}>
          Show all columns
        </Button>
      )}
    </Flex>
  );

  const settings = (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Tooltip title="Table settings">
        <Button type="text" icon={<SettingOutlined />} aria-label="Table settings" />
      </Tooltip>
    </Popover>
  );
  return { columns: visible, settings };
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

/** Pagination props wired to the saved page size; call onChange to fetch another page. */
export function usePagedTable(total: number | undefined, page: number, onChange: (page: number, pageSize: number) => void) {
  const { preferences, update } = usePreferences();
  return {
    current: page,
    pageSize: preferences.pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    showTotal: (count: number, [from, to]: [number, number]) => `${from}–${to} of ${count.toLocaleString('en-IN')}`,
    onChange: (next: number, size: number) => {
      if (size !== preferences.pageSize) {
        update({ pageSize: size });
        onChange(1, size);
      } else {
        onChange(next, size);
      }
    },
  };
}

/**
 * antd Table with the user's density, striping and height preferences applied. With compact
 * tables on, long lists scroll inside a height-limited body under a sticky header instead of
 * stretching the page.
 */
export function DataTable<T extends object>({
  rowClassName,
  maxBodyHeight = 520,
  scroll,
  ...props
}: TableProps<T> & { maxBodyHeight?: number }) {
  const { preferences } = usePreferences();
  const limitHeight = preferences.compactTables && (props.dataSource?.length ?? 0) > 8;
  return (
    <Table<T>
      size={preferences.tableDensity}
      scroll={limitHeight ? { ...scroll, y: maxBodyHeight } : scroll}
      sticky={false}
      rowClassName={(record, index, indent) => {
        const base = typeof rowClassName === 'function' ? rowClassName(record, index, indent) : (rowClassName ?? '');
        return preferences.stripedRows && index % 2 === 1 ? `${base} arvo-row-striped` : base;
      }}
      {...props}
    />
  );
}

/** Slim bar above a table inside a flush card: context on the left, table settings on the right. */
export const TableToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
  min-height: 48px;
  padding: ${({ theme }) => theme.space[2]}px ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[2]}px ${({ theme }) => theme.space[4]}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
`;
