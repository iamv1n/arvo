'use client';

import { ArrowClockwise, ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react';
import { App, Button, Empty, Flex, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useTheme } from 'styled-components';
import { api } from '../../lib/api';
import { useMoney } from '../../lib/use-money';
import {
  useMarketMutation,
  useWatchlist,
  useWatchlists,
  type RefreshResult,
  type Watchlist,
  type WatchlistRow,
} from '../../lib/markets';
import { DataTable, useTableColumns, type DataColumn } from '../data-table';
import { MonoLabel } from '../mono-label';
import { Blank, PriceAge, Sparkline } from './shared';

/*
 * The watchlist tab.
 *
 * One editable table with the columns a person actually looks at: the price and where it came
 * from, the day change when two closes are known, the 52-week range where imported bars provide
 * one, and — when they hold the thing — their own quantity, average cost and unrealised P&L.
 *
 * Reordering is up/down buttons rather than drag-and-drop. A pointer-only drag handle is not
 * reachable from a keyboard, the lists are ten or twenty rows, and the server takes an explicit
 * order either way.
 */

const today = () => new Date().toISOString().slice(0, 10);

export function Watchlists() {
  const theme = useTheme();
  const { message } = App.useApp();
  const money = useMoney();
  const { data: lists, isLoading } = useWatchlists();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [priceFor, setPriceFor] = useState<WatchlistRow | null>(null);

  const activeId = selectedId ?? lists?.[0]?.id ?? null;
  const { data: view, isFetching } = useWatchlist(activeId);

  const createList = useMarketMutation((body: { name: string }) => api<Watchlist>('/watchlists', { method: 'POST', body }));
  const deleteList = useMarketMutation((id: string) => api<void>(`/watchlists/${id}`, { method: 'DELETE' }));
  const addItem = useMarketMutation((body: { symbol: string; exchange?: string; name?: string }) =>
    api(`/watchlists/${activeId as string}/items`, { method: 'POST', body }),
  );
  const removeItem = useMarketMutation((id: string) => api<void>(`/watchlists/items/${id}`, { method: 'DELETE' }));
  const reorder = useMarketMutation((ids: string[]) => api(`/watchlists/${activeId as string}/items/reorder`, { method: 'POST', body: { ids } }));
  const setQuote = useMarketMutation((body: { symbol: string; price: string; previousClose?: string; asOf: string }) =>
    api('/market/quotes', { method: 'POST', body }),
  );
  const refresh = useMarketMutation(() => api<RefreshResult>('/market/quotes/refresh', { method: 'POST', body: { asOf: today() } }));

  const rows = view?.rows ?? [];

  const move = (index: number, delta: number) => {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate(next.map((row) => row.item.id));
  };

  const columns = useMemo<DataColumn<WatchlistRow>[]>(
    () => [
      {
        key: 'symbol',
        title: 'Instrument',
        alwaysVisible: true,
        render: (_, row) => (
          <div>
            <div style={{ fontWeight: 600 }}>{row.item.symbol}</div>
            {row.item.name && <div style={{ fontSize: 12, color: theme.colors.textMuted }}>{row.item.name}</div>}
          </div>
        ),
      },
      {
        key: 'price',
        title: 'Last price',
        align: 'right',
        render: (_, row) => (
          <div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>{row.price ? money(row.price) : '—'}</div>
            <PriceAge asOf={row.asOf} source={row.source} isStale={row.isStale} />
          </div>
        ),
      },
      {
        key: 'change',
        title: 'Day',
        align: 'right',
        render: (_, row) => {
          if (!row.dayChange) return <span style={{ color: theme.colors.textMuted }}>—</span>;
          const up = !row.dayChange.startsWith('-');
          return (
            <span style={{ color: up ? theme.colors.income : theme.colors.expense, fontVariantNumeric: 'tabular-nums' }}>
              {money(row.dayChange)} ({row.dayChangePercent}%)
            </span>
          );
        },
      },
      {
        key: 'sparkline',
        title: 'Trend',
        label: '52-week trend',
        render: (_, row) => <Sparkline values={row.sparkline} />,
      },
      {
        key: 'range',
        title: '52-week range',
        align: 'right',
        render: (_, row) =>
          row.fiftyTwoWeekLow && row.fiftyTwoWeekHigh ? (
            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {money(row.fiftyTwoWeekLow)} – {money(row.fiftyTwoWeekHigh)}
            </span>
          ) : (
            <span style={{ color: theme.colors.textMuted, fontSize: 12 }}>Import bars to see this</span>
          ),
      },
      {
        key: 'quantity',
        title: 'You hold',
        align: 'right',
        render: (_, row) =>
          row.holding ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.holding.quantity}</span>
          ) : (
            <span style={{ color: theme.colors.textMuted }}>—</span>
          ),
      },
      {
        key: 'averageCost',
        title: 'Average cost',
        align: 'right',
        render: (_, row) => (row.holding?.averageCost ? money(row.holding.averageCost) : <span style={{ color: theme.colors.textMuted }}>—</span>),
      },
      {
        key: 'unrealised',
        title: 'Unrealised P&L',
        align: 'right',
        render: (_, row) => {
          if (!row.holding) return <span style={{ color: theme.colors.textMuted }}>—</span>;
          const up = !row.holding.unrealisedGain.startsWith('-');
          return <span style={{ color: up ? theme.colors.income : theme.colors.expense, fontVariantNumeric: 'tabular-nums' }}>{money(row.holding.unrealisedGain)}</span>;
        },
      },
      {
        key: 'actions',
        title: '',
        alwaysVisible: true,
        width: 148,
        render: (_, row, index) => (
          <Space size={0}>
            <Button type="text" size="small" icon={<ArrowUp size={14} />} aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} />
            <Button type="text" size="small" icon={<ArrowDown size={14} />} aria-label="Move down" disabled={index === rows.length - 1} onClick={() => move(index, 1)} />
            <Button type="text" size="small" onClick={() => setPriceFor(row)}>
              Price
            </Button>
            <Button
              type="text"
              size="small"
              danger
              icon={<Trash size={14} />}
              aria-label={`Remove ${row.item.symbol}`}
              onClick={() => removeItem.mutate(row.item.id)}
            />
          </Space>
        ),
      },
    ],
    [rows, theme, money, move, removeItem],
  );

  const { columns: visibleColumns, settings } = useTableColumns('markets-watchlist', columns);

  if (!isLoading && !lists?.length) {
    return (
      <Blank
        title="Nothing on your watchlists yet"
        body="A watchlist is a named list of instruments. Arvo shows the last price it knows, where that price came from, and — if you own the thing — your own position beside it."
        action={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setListOpen(true)}>
            Create a watchlist
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ minWidth: 220 }}
          value={activeId ?? undefined}
          onChange={setSelectedId}
          options={(lists ?? []).map((list) => ({ value: list.id, label: list.name }))}
          aria-label="Watchlist"
        />
        <Button icon={<Plus size={15} />} onClick={() => setListOpen(true)}>
          New list
        </Button>
        <Button icon={<Plus size={15} />} type="primary" disabled={!activeId} onClick={() => setAddOpen(true)}>
          Add instrument
        </Button>
        <Button
          icon={<ArrowClockwise size={15} />}
          loading={refresh.isPending || isFetching}
          onClick={() =>
            refresh.mutate(undefined, {
              onSuccess: (result) => {
                if (result.skippedReason) message.info(result.skippedReason);
                else message.success(`${result.updated} price${result.updated === 1 ? '' : 's'} updated`);
              },
            })
          }
        >
          Refresh prices
        </Button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <MonoLabel>
            {view?.driver === 'manual' ? 'Prices: your entries and imports' : `Provider: ${view?.driver ?? '—'}`}
            {view?.quotedAt ? ` · last checked ${new Date(view.quotedAt).toLocaleString()}` : ''}
          </MonoLabel>
          {settings}
        </div>
      </Flex>

      {activeId && !rows.length && !isFetching ? (
        <Empty
          description="This list is empty. Add an instrument by its exchange symbol."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '32px 0' }}
        />
      ) : (
        <DataTable<WatchlistRow>
          rowKey={(row) => row.item.id}
          columns={visibleColumns}
          dataSource={rows}
          loading={isLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}

      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        A price marked <em>stale as of</em> is the last one Arvo knows and the date it was true. Nothing is fetched unless you configure a quote provider, and a
        provider that fails leaves the last known price in place rather than blanking the row.
      </Typography.Paragraph>

      <ListModal open={listOpen} onClose={() => setListOpen(false)} onCreate={(name) => createList.mutate({ name }, { onSuccess: () => setListOpen(false) })} />

      <Modal
        open={addOpen}
        title="Add an instrument"
        onCancel={() => setAddOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          layout="vertical"
          onFinish={(values: { symbol: string; exchange?: string; name?: string }) =>
            addItem.mutate(values, { onSuccess: () => setAddOpen(false), onError: (error) => message.error((error as Error).message) })
          }
        >
          <Form.Item name="symbol" label="Symbol" rules={[{ required: true, message: 'An exchange symbol, e.g. INFY or NIFTY' }]}>
            <Input placeholder="INFY" autoFocus />
          </Form.Item>
          <Form.Item name="exchange" label="Exchange" tooltip="Optional. NSE, BSE, MCX …">
            <Input placeholder="NSE" />
          </Form.Item>
          <Form.Item name="name" label="Name" tooltip="Optional. Shown under the symbol.">
            <Input placeholder="Infosys" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={addItem.isPending}>
            Add
          </Button>
        </Form>
      </Modal>

      <Modal open={!!priceFor} title={`Price for ${priceFor?.item.symbol ?? ''}`} onCancel={() => setPriceFor(null)} footer={null} destroyOnHidden>
        <Typography.Paragraph type="secondary">
          Prices you enter here are your own data. Arvo stores the date the price was true so an alert can refuse to answer from an old one.
        </Typography.Paragraph>
        <Form
          layout="vertical"
          initialValues={{ price: priceFor?.price ?? '', previousClose: priceFor?.previousClose ?? '', asOf: today() }}
          onFinish={(values: { price: string; previousClose?: string; asOf: string }) =>
            setQuote.mutate({ ...values, symbol: priceFor!.item.symbol }, { onSuccess: () => setPriceFor(null) })
          }
        >
          <Form.Item name="price" label="Last price" rules={[{ required: true, message: 'A price is required' }]}>
            <Input inputMode="decimal" autoFocus />
          </Form.Item>
          <Form.Item name="previousClose" label="Previous close" tooltip="Optional. The day change needs two closes.">
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="asOf" label="Session date" rules={[{ required: true, message: 'The date this price was true' }]}>
            <Input type="date" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={setQuote.isPending}>
            Save price
          </Button>
        </Form>
      </Modal>

      {activeId && lists && lists.length > 1 && (
        <Button
          size="small"
          danger
          type="text"
          icon={<Trash size={14} />}
          style={{ marginTop: 8 }}
          onClick={() =>
            Modal.confirm({
              title: 'Delete this watchlist?',
              content: 'The instruments on it are removed from the list. Nothing in your portfolio or journal changes.',
              okText: 'Delete',
              okButtonProps: { danger: true },
              onOk: () => deleteList.mutateAsync(activeId).then(() => setSelectedId(null)),
            })
          }
        >
          Delete this list
        </Button>
      )}
    </>
  );
}

function ListModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  return (
    <Modal open={open} title="New watchlist" onCancel={onClose} footer={null} destroyOnHidden>
      <Form layout="vertical" onFinish={(values: { name: string }) => onCreate(values.name)}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the list a name' }]}>
          <Input placeholder="Core holdings" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          Create
        </Button>
      </Form>
    </Modal>
  );
}
