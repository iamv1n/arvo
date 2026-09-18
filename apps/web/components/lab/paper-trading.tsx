'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, DatePicker, Empty, Input, InputNumber, Modal, Row, Select, Skeleton, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useBarSeries, useLabMutation, usePaperAccount, usePaperAccounts, type PaperOrder } from '../../lib/lab';
import { useMoney } from '../../lib/use-money';
import { Eyebrow } from '../planning';
import { ResultStrip } from './result-strip';
import { LabNote, Muted, Signed, num } from './shared';

/*
 * Paper trading.
 *
 * Orders are evaluated against the bars the user imported, not against a live feed, which is
 * why every order carries the moment in the series it was placed at. A market order fills at
 * the next bar's open; a limit order waits for a bar that reaches its price and otherwise stays
 * working. Nothing is ever filled at a price the data does not contain.
 *
 * Every fill is written into the trading journal marked as paper, and the journal excludes
 * those by default — so practising here can never flatter the metrics that describe real money.
 */

const CURRENCY = 'INR';

const STATUS_COLOURS: Record<PaperOrder['status'], string> = {
  FILLED: 'green',
  PENDING: 'gold',
  CANCELLED: 'default',
  REJECTED: 'red',
};

export function PaperTrading() {
  const money = useMoney();
  const { message } = App.useApp();
  const accounts = usePaperAccounts();
  const series = useBarSeries();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const view = usePaperAccount(activeId);

  useEffect(() => {
    if (!activeId && accounts.data && accounts.data.length > 0) setActiveId(accounts.data[0].id);
  }, [accounts.data, activeId]);

  const create = useLabMutation((body: { name: string; startingCapital: string }) => api<{ id: string }>('/lab/paper', { method: 'POST', body }));
  const remove = useLabMutation((id: string) => api(`/lab/paper/${id}`, { method: 'DELETE' }));
  const cancel = useLabMutation((id: string) => api(`/lab/paper/orders/${id}`, { method: 'DELETE' }));

  if (accounts.isPending) return <Skeleton active paragraph={{ rows: 6 }} />;

  if ((accounts.data?.length ?? 0) === 0) {
    return (
      <Card>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '32px 0' }}
          description="No paper accounts yet. Open one to practise against the price data you imported — with the same charges a real trade would pay."
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Open a paper account
          </Button>
        </Empty>
        <NewAccountModal open={creating} onClose={() => setCreating(false)} onCreate={async (values) => {
          const account = await create.mutateAsync(values);
          setActiveId(account.id);
          setCreating(false);
        }} />
      </Card>
    );
  }

  const data = view.data;
  const symbols = series.data ?? [];

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space wrap>
            <Select
              style={{ minWidth: 220 }}
              value={activeId ?? undefined}
              onChange={setActiveId}
              options={(accounts.data ?? []).map((account) => ({ value: account.id, label: account.name }))}
            />
            <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              New account
            </Button>
            {activeId && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  Modal.confirm({
                    title: 'Delete this paper account?',
                    content: 'Its simulated fills go with it. Your real trades are untouched.',
                    okText: 'Delete',
                    okButtonProps: { danger: true },
                    onOk: async () => {
                      await remove.mutateAsync(activeId);
                      setActiveId(null);
                    },
                  })
                }
              >
                Delete
              </Button>
            )}
          </Space>
        </Col>

        {data && (
          <>
            <Col span={24}>
              <ResultStrip
                items={[
                  { label: 'Equity', value: money(data.equity, CURRENCY), caveat: `from ${money(data.account.startingCapital, CURRENCY)}` },
                  {
                    label: 'Total P&L',
                    tone: num(data.totalPnl) < 0 ? 'negative' : 'positive',
                    value: money(data.totalPnl, CURRENCY),
                    caveat: `${money(data.realisedPnl, CURRENCY)} realised`,
                  },
                  { label: 'Cash', value: money(data.account.cash, CURRENCY), caveat: 'Not in a position' },
                  { label: 'Charges paid', tone: 'negative', value: money(data.charges, CURRENCY), caveat: 'Statutory rates, same as a real fill' },
                ]}
              />
            </Col>

            <Col xs={24} lg={9}>
              <OrderTicket accountId={data.account.id} symbols={symbols} />
            </Col>

            <Col xs={24} lg={15}>
              <Card size="small" title="Positions">
                {data.positions.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Flat" />
                ) : (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="symbol"
                    dataSource={data.positions}
                    columns={[
                      { title: 'Symbol', dataIndex: 'symbol' },
                      {
                        title: 'Qty',
                        dataIndex: 'quantity',
                        align: 'right' as const,
                        render: (value: number) => <Signed $value={value}>{value.toLocaleString('en-IN')}</Signed>,
                      },
                      { title: 'Average', dataIndex: 'averagePrice', align: 'right' as const },
                      { title: 'Last', dataIndex: 'lastPrice', align: 'right' as const, render: (value: string | null) => value ?? '—' },
                      {
                        title: 'Unrealised',
                        dataIndex: 'unrealisedPnl',
                        align: 'right' as const,
                        render: (value: string | null) => (value === null ? '—' : <Signed $value={num(value)}>{money(value, CURRENCY)}</Signed>),
                      },
                      {
                        title: 'Realised',
                        dataIndex: 'realisedPnl',
                        align: 'right' as const,
                        render: (value: string) => <Signed $value={num(value)}>{money(value, CURRENCY)}</Signed>,
                      },
                    ]}
                  />
                )}
                <LabNote text="Positions are marked against the last bar you imported for each symbol, not a live price. Arvo has no market connection." />
              </Card>
            </Col>

            <Col span={24}>
              <Card size="small" title="Orders">
                <Table
                  size="small"
                  rowKey="id"
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  dataSource={[...data.orders].reverse()}
                  columns={[
                    { title: 'Placed', render: (_: unknown, row) => `${row.placedDate}${row.placedTime ? ` ${row.placedTime}` : ''}` },
                    { title: 'Symbol', dataIndex: 'symbol' },
                    { title: 'Side', dataIndex: 'side', render: (value: string) => <Tag color={value === 'BUY' ? 'green' : 'volcano'}>{value}</Tag> },
                    { title: 'Qty', dataIndex: 'quantity', align: 'right' as const },
                    { title: 'Type', render: (_: unknown, row) => (row.orderType === 'LIMIT' ? `Limit ${row.limitPrice ?? ''}` : 'Market') },
                    { title: 'Status', dataIndex: 'status', render: (value: PaperOrder['status']) => <Tag color={STATUS_COLOURS[value]}>{value}</Tag> },
                    { title: 'Fill', render: (_: unknown, row) => (row.fillPrice ? `${row.fillPrice} on ${row.filledDate ?? ''}` : '—') },
                    { title: 'Note', dataIndex: 'message', render: (value: string | null) => <Muted>{value ?? ''}</Muted> },
                    {
                      title: '',
                      align: 'right' as const,
                      render: (_: unknown, row) =>
                        row.status === 'PENDING' ? (
                          <Button size="small" onClick={() => cancel.mutate(row.id)}>
                            Cancel
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </Card>
            </Col>
          </>
        )}
      </Row>

      <NewAccountModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (values) => {
          const account = await create.mutateAsync(values);
          setActiveId(account.id);
          setCreating(false);
          message.success('Paper account opened');
        }}
      />
    </>
  );
}

function OrderTicket({ accountId, symbols }: { accountId: string; symbols: { symbol: string; timeframe: 'DAY' | 'MINUTE' }[] }) {
  const { message } = App.useApp();
  const [form, setForm] = useState({
    symbol: symbols[0]?.symbol ?? '',
    timeframe: symbols[0]?.timeframe ?? ('DAY' as 'DAY' | 'MINUTE'),
    side: 'BUY' as 'BUY' | 'SELL',
    quantity: 100,
    orderType: 'MARKET' as 'MARKET' | 'LIMIT',
    limitPrice: '',
    placedDate: dayjs().format('YYYY-MM-DD'),
    placedTime: '',
  });
  const place = useLabMutation((body: Record<string, unknown>) => api<PaperOrder>(`/lab/paper/${accountId}/orders`, { method: 'POST', body }));

  if (symbols.length === 0) {
    return (
      <Card size="small" title="Place an order">
        <Alert type="info" showIcon message="Import price data first" description="A simulated order fills against bars you have imported. Without any, there is nothing to fill against." />
      </Card>
    );
  }

  const submit = async () => {
    try {
      const order = await place.mutateAsync({
        symbol: form.symbol,
        timeframe: form.timeframe,
        side: form.side,
        quantity: String(form.quantity),
        orderType: form.orderType,
        limitPrice: form.orderType === 'LIMIT' ? form.limitPrice : null,
        placedDate: form.placedDate,
        placedTime: form.placedTime || null,
      });
      message.success(order.status === 'FILLED' ? `Filled at ${order.fillPrice ?? ''}` : 'Order is working');
    } catch (problem) {
      message.error(errorMessage(problem));
    }
  };

  return (
    <Card size="small" title="Place a simulated order">
      <Row gutter={[8, 8]}>
        <Col span={14}>
          <Select
            style={{ width: '100%' }}
            value={`${form.symbol}|${form.timeframe}`}
            onChange={(value) => {
              const [symbol, timeframe] = value.split('|');
              setForm({ ...form, symbol, timeframe: timeframe as 'DAY' | 'MINUTE' });
            }}
            options={symbols.map((item) => ({ value: `${item.symbol}|${item.timeframe}`, label: `${item.symbol} · ${item.timeframe === 'DAY' ? 'daily' : 'minute'}` }))}
          />
        </Col>
        <Col span={10}>
          <Select
            style={{ width: '100%' }}
            value={form.side}
            onChange={(value) => setForm({ ...form, side: value })}
            options={[
              { value: 'BUY', label: 'Buy' },
              { value: 'SELL', label: 'Sell' },
            ]}
          />
        </Col>
        <Col span={12}>
          <InputNumber style={{ width: '100%' }} addonBefore="Qty" min={1} value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value ?? 1 })} />
        </Col>
        <Col span={12}>
          <Select
            style={{ width: '100%' }}
            value={form.orderType}
            onChange={(value) => setForm({ ...form, orderType: value })}
            options={[
              { value: 'MARKET', label: 'Market' },
              { value: 'LIMIT', label: 'Limit' },
            ]}
          />
        </Col>
        {form.orderType === 'LIMIT' && (
          <Col span={24}>
            <Input addonBefore="Limit" value={form.limitPrice} onChange={(event) => setForm({ ...form, limitPrice: event.target.value })} inputMode="decimal" />
          </Col>
        )}
        <Col span={form.timeframe === 'MINUTE' ? 14 : 24}>
          <DatePicker
            style={{ width: '100%' }}
            allowClear={false}
            value={dayjs(form.placedDate)}
            onChange={(value) => setForm({ ...form, placedDate: (value ?? dayjs()).format('YYYY-MM-DD') })}
          />
        </Col>
        {form.timeframe === 'MINUTE' && (
          <Col span={10}>
            <Input placeholder="09:20" value={form.placedTime} onChange={(event) => setForm({ ...form, placedTime: event.target.value })} />
          </Col>
        )}
        <Col span={24}>
          <Button type="primary" block loading={place.isPending} onClick={submit}>
            Place the order
          </Button>
        </Col>
      </Row>
      <div style={{ marginTop: 10 }}>
        <Eyebrow>How it fills</Eyebrow>
        <div>
          <Muted>A market order fills at the open of the first bar after this moment. A limit order waits for a bar that reaches its price, and otherwise stays working.</Muted>
        </div>
      </div>
    </Card>
  );
}

function NewAccountModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (values: { name: string; startingCapital: string }) => Promise<void> }) {
  const [name, setName] = useState('Practice');
  const [capital, setCapital] = useState('500000');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Open a paper account"
      okText="Open"
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          await onCreate({ name, startingCapital: capital });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input addonBefore="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input addonBefore="Starting capital" value={capital} onChange={(event) => setCapital(event.target.value)} inputMode="decimal" />
        <Muted>Virtual money. This account has no connection to any broker and can never place a live order.</Muted>
      </Space>
    </Modal>
  );
}
