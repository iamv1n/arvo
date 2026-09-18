'use client';

import {
  Button,
  Checkbox,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Slider,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styled, { useTheme } from 'styled-components';
import { MonoLabel } from '../mono-label';
import { ResultStrip, type ResultItem } from '../lab/result-strip';

/*
 * Shared fixtures for the layout studio.
 *
 * Every pattern renders exactly the same five sections from this file, so the only thing that
 * differs between them is the shell. Nothing here touches the API — the studio is a prototype
 * for choosing a navigation pattern, not a working screen.
 */

export interface SectionSpec {
  key: string;
  label: string;
  /** Small count shown in rails and indexes. */
  count?: number;
  status: 'ready' | 'stale' | 'empty';
  hint: string;
}

export const SECTIONS: SectionSpec[] = [
  { key: 'setup', label: 'Setup', count: 8, status: 'ready', hint: 'Rule, universe and risk budget' },
  { key: 'results', label: 'Results', count: 6, status: 'ready', hint: 'Headline figures for the last run' },
  { key: 'chart', label: 'Chart', status: 'stale', hint: 'Equity curve against the benchmark' },
  { key: 'trades', label: 'Trades', count: 12, status: 'ready', hint: 'Every fill the rule produced' },
  { key: 'notes', label: 'Notes', count: 3, status: 'empty', hint: 'Caveats recorded while reading' },
];

export interface AreaSpec {
  key: string;
  label: string;
  tabs: { key: string; label: string }[];
}

export const AREAS: AreaSpec[] = [
  {
    key: 'lab',
    label: 'Strategy lab',
    tabs: [
      { key: 'payoff', label: 'Payoff builder' },
      { key: 'backtest', label: 'Backtest' },
      { key: 'sizing', label: 'Position sizing' },
      { key: 'paper', label: 'Paper trading' },
    ],
  },
  {
    key: 'trading',
    label: 'Trading',
    tabs: [
      { key: 'orders', label: 'Orders' },
      { key: 'positions', label: 'Positions' },
      { key: 'journal', label: 'Journal' },
    ],
  },
  {
    key: 'portfolio',
    label: 'Portfolio',
    tabs: [
      { key: 'holdings', label: 'Holdings' },
      { key: 'allocation', label: 'Allocation' },
      { key: 'income', label: 'Income' },
    ],
  },
];

export const RESULTS: ResultItem[] = [
  { label: 'Net return', value: '+18.4%', tone: 'positive', caveat: 'Before costs and slippage.' },
  { label: 'Max drawdown', value: '-11.2%', tone: 'negative', caveat: 'Peak to trough, close basis.' },
  { label: 'Win rate', value: '54.1%' },
  { label: 'Trades', value: '12' },
  { label: 'Exposure', value: '61%', tone: 'muted', caveat: 'Share of bars in a position.' },
  { label: 'Sharpe', value: '1.08', caveat: 'Daily, annualised at 252.' },
];

export interface TradeRow {
  key: string;
  opened: string;
  symbol: string;
  side: 'Long' | 'Short';
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
}

const SYMBOLS = ['NIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ITC', 'SBIN', 'LT', 'AXISBANK', 'WIPRO', 'BAJFIN', 'MARUTI'];

export const TRADES: TradeRow[] = SYMBOLS.map((symbol, i) => {
  const entry = 480 + i * 37.5;
  const exit = entry * (1 + (((i * 7) % 11) - 5) / 100);
  return {
    key: `t${i}`,
    opened: `2026-0${(i % 9) + 1}-1${i % 9}`,
    symbol,
    side: i % 3 === 0 ? 'Short' : 'Long',
    qty: 25 * ((i % 4) + 1),
    entry: Number(entry.toFixed(2)),
    exit: Number(exit.toFixed(2)),
    pnl: Number(((exit - entry) * 25 * ((i % 4) + 1)).toFixed(2)),
  };
});

export const CURVE = Array.from({ length: 24 }, (_, i) => ({
  month: `M${i + 1}`,
  strategy: Number((100 * Math.exp(0.007 * i) + Math.sin(i / 2) * 3).toFixed(2)),
  benchmark: Number((100 * Math.exp(0.004 * i) + Math.cos(i / 3) * 2).toFixed(2)),
}));

/** Headline ribbon — the real lab component, fed fixtures. */
export function MockResults() {
  return <ResultStrip items={RESULTS} />;
}

/** Fixed-height equity curve. Heights never depend on data, so patterns stay comparable. */
export function MockChart({ height = 260 }: { height?: number }) {
  const theme = useTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={CURVE} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="studioCurve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.colors.chart[0]} stopOpacity={0.35} />
            <stop offset="100%" stopColor={theme.colors.chart[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={theme.colors.borderSubtle} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: theme.colors.textMuted, fontSize: 11 }} />
        <YAxis width={52} tickLine={false} axisLine={false} tick={{ fill: theme.colors.textMuted, fontSize: 11 }} domain={['dataMin - 4', 'dataMax + 4']} />
        <Tooltip
          contentStyle={{
            background: theme.colors.bgSurfaceRaised,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            color: theme.colors.textPrimary,
          }}
        />
        <Area type="monotone" dataKey="strategy" stroke={theme.colors.chart[0]} strokeWidth={2} fill="url(#studioCurve)" />
        <Line type="monotone" dataKey="benchmark" stroke={theme.colors.chart[1]} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Twelve fake fills. Uses antd Table directly — DataTable persists real user preferences. */
export function MockTable({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <Table<TradeRow>
      size={compact ? 'small' : 'middle'}
      dataSource={TRADES}
      pagination={false}
      scroll={{ x: 640 }}
      columns={[
        { title: 'Opened', dataIndex: 'opened', key: 'opened' },
        { title: 'Symbol', dataIndex: 'symbol', key: 'symbol' },
        {
          title: 'Side',
          dataIndex: 'side',
          key: 'side',
          render: (side: TradeRow['side']) => <Tag color={side === 'Long' ? 'green' : 'volcano'}>{side}</Tag>,
        },
        { title: 'Qty', dataIndex: 'qty', key: 'qty', align: 'right' },
        { title: 'Entry', dataIndex: 'entry', key: 'entry', align: 'right' },
        { title: 'Exit', dataIndex: 'exit', key: 'exit', align: 'right' },
        {
          title: 'P&L',
          dataIndex: 'pnl',
          key: 'pnl',
          align: 'right',
          render: (pnl: number) => (
            <span style={{ color: pnl >= 0 ? theme.colors.income : theme.colors.expense, fontVariantNumeric: 'tabular-nums' }}>
              {pnl >= 0 ? '+' : ''}
              {pnl.toFixed(2)}
            </span>
          ),
        },
      ]}
    />
  );
}

/** Eight inputs, the shape of a real backtest form. Nothing is submitted anywhere. */
export function MockForm() {
  return (
    <Form layout="vertical" size="middle" initialValues={{ name: 'Momentum 20/50', universe: 'nifty50', capital: 500000, risk: 1.5, slippage: 5 }}>
      <Form.Item label="Strategy name" name="name">
        <Input />
      </Form.Item>
      <Form.Item label="Universe" name="universe">
        <Select
          options={[
            { value: 'nifty50', label: 'NIFTY 50' },
            { value: 'nifty500', label: 'NIFTY 500' },
            { value: 'custom', label: 'Custom list' },
          ]}
        />
      </Form.Item>
      <Form.Item label="Period" name="period">
        <DatePicker.RangePicker style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="Starting capital" name="capital">
        <InputNumber style={{ width: '100%' }} prefix="₹" />
      </Form.Item>
      <Form.Item label="Risk per trade (%)" name="risk">
        <Slider min={0.25} max={5} step={0.25} />
      </Form.Item>
      <Form.Item label="Slippage (bps)" name="slippage">
        <InputNumber style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="Include costs" name="costs" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="compound" valuePropName="checked">
        <Checkbox>Compound position size</Checkbox>
      </Form.Item>
      <Button type="primary">Run backtest</Button>
    </Form>
  );
}

const NoteList = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  line-height: 1.7;
`;

export function MockNotes() {
  return (
    <NoteList>
      <li>Survivorship: the universe is today&apos;s constituents, so delisted names never appear.</li>
      <li>Fills are modelled at the next open, which flatters gap-driven rules.</li>
      <li>Costs are a flat 5 bps; real brokerage and impact will be higher on the small caps.</li>
    </NoteList>
  );
}

/** The body of one section, identical in every pattern. */
export function SectionBody({ section }: { section: string }) {
  switch (section) {
    case 'setup':
      return <MockForm />;
    case 'results':
      return <MockResults />;
    case 'chart':
      return <MockChart />;
    case 'trades':
      return <MockTable />;
    default:
      return <MockNotes />;
  }
}

export const Eyebrow = MonoLabel;

export function SectionHeading({ section }: { section: SectionSpec }) {
  return (
    <Flex vertical gap={2} style={{ marginBottom: 12 }}>
      <Eyebrow>{section.label}</Eyebrow>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {section.hint}
      </Typography.Text>
    </Flex>
  );
}

/** A status dot in theme colours — used by the rail and the sticky index. */
export const StatusDot = styled.span<{ $status: SectionSpec['status'] }>`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: ${({ theme, $status }) =>
    $status === 'ready' ? theme.colors.success : $status === 'stale' ? theme.colors.warning : theme.colors.textMuted};
`;

/** Shared small segmented switcher props so patterns look alike. */
export const RESULT_VIEWS = ['Summary', 'Chart', 'Trades'] as const;
export type ResultView = (typeof RESULT_VIEWS)[number];

export function ResultViewBody({ view }: { view: ResultView }) {
  if (view === 'Summary') return <MockResults />;
  if (view === 'Chart') return <MockChart height={300} />;
  return <MockTable compact />;
}

export function ResultViewSwitcher({ value, onChange }: { value: ResultView; onChange: (v: ResultView) => void }) {
  return <Segmented size="small" value={value} onChange={(v) => onChange(v as ResultView)} options={[...RESULT_VIEWS]} />;
}
