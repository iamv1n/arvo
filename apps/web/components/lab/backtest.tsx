'use client';

import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Play } from '@phosphor-icons/react';
import { Alert, App, Button, Card, Col, DatePicker, Divider, Empty, Input, InputNumber, Row, Select, Skeleton, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import {
  useBacktests,
  useBarSeries,
  useLabMutation,
  useStrategies,
  type BacktestResult,
  type BacktestTrade,
  type CompareOp,
  type Condition,
  type IndicatorKind,
  type Operand,
  type StrategySpec,
} from '../../lib/lab';
import { useMoney } from '../../lib/use-money';
import { Eyebrow } from '../planning';
import { Panel } from '../panel';
import { EquityAndDrawdown } from './payoff-chart';
import { ResultStrip } from './result-strip';
import { EXIT_REASON_LABELS, LabNote, Muted, Signed, num } from './shared';

/*
 * The backtest tab.
 *
 * The rule editor is deliberately a form and not a code box. A strategy is a typed tree the
 * engine walks, so the worst a user can express is a condition that is never true — there is no
 * eval anywhere in the stack, and the form is the shape of the data rather than a veneer over
 * a scripting language.
 *
 * Every result screen leads with the caveats: the overfitting note, the walk-forward verdict
 * and the list of assumptions sit above the equity curve, not below it, because a good-looking
 * curve is the most persuasive and least reliable thing on the page.
 */

const CURRENCY = 'INR';

const INDICATORS: { value: IndicatorKind; label: string; usesPeriod: boolean }[] = [
  { value: 'SMA', label: 'Simple moving average', usesPeriod: true },
  { value: 'EMA', label: 'Exponential moving average', usesPeriod: true },
  { value: 'RSI', label: 'RSI', usesPeriod: true },
  { value: 'MACD', label: 'MACD line', usesPeriod: false },
  { value: 'VWAP', label: 'VWAP (session)', usesPeriod: false },
  { value: 'ATR', label: 'ATR', usesPeriod: true },
  { value: 'BOLLINGER', label: 'Bollinger band', usesPeriod: true },
  { value: 'SUPERTREND', label: 'Supertrend', usesPeriod: true },
  { value: 'PREV_DAY_HIGH', label: "Previous day's high", usesPeriod: false },
  { value: 'PREV_DAY_LOW', label: "Previous day's low", usesPeriod: false },
  { value: 'PREV_DAY_CLOSE', label: "Previous day's close", usesPeriod: false },
  { value: 'OPENING_RANGE_HIGH', label: 'Opening range high', usesPeriod: false },
  { value: 'OPENING_RANGE_LOW', label: 'Opening range low', usesPeriod: false },
];

const OPERATORS: { value: CompareOp; label: string }[] = [
  { value: 'GT', label: 'is above' },
  { value: 'GTE', label: 'is at or above' },
  { value: 'LT', label: 'is below' },
  { value: 'LTE', label: 'is at or below' },
  { value: 'CROSSES_ABOVE', label: 'crosses above' },
  { value: 'CROSSES_BELOW', label: 'crosses below' },
];

const defaultSpec = (symbol: string, timeframe: 'DAY' | 'MINUTE'): StrategySpec => ({
  name: 'Moving average crossover',
  symbol,
  timeframe,
  direction: 'LONG',
  startingCapital: '1000000',
  entry: { type: 'COMPARE', left: { type: 'PRICE', field: 'CLOSE' }, op: 'CROSSES_ABOVE', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 20 } } },
  exit: { type: 'COMPARE', left: { type: 'PRICE', field: 'CLOSE' }, op: 'CROSSES_BELOW', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 20 } } },
  stopLoss: null,
  target: null,
  trailingStop: null,
  maxBarsInTrade: null,
  intradaySquareOffTime: timeframe === 'MINUTE' ? '15:15' : null,
  maxPositions: 1,
  sizing: { method: 'FIXED_FRACTIONAL', percent: 25, lotSize: 1 },
  execution: { fill: 'NEXT_BAR_OPEN', slippageType: 'BPS', slippage: 5, segment: timeframe === 'MINUTE' ? 'EQUITY_INTRADAY' : 'EQUITY_DELIVERY', exchange: 'NSE', broker: 'estimate' },
});

export function BacktestTab() {
  const { message } = App.useApp();
  const money = useMoney();
  const series = useBarSeries();
  const strategies = useStrategies();
  const stored = useBacktests();
  const [spec, setSpec] = useState<StrategySpec | null>(null);
  const [range, setRange] = useState<[string | null, string | null]>([null, null]);
  const [walkForward, setWalkForward] = useState(true);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useLabMutation((body: Record<string, unknown>) => api<{ id: string | null; result: BacktestResult }>('/lab/backtests', { method: 'POST', body }));
  const save = useLabMutation((body: Record<string, unknown>) => api('/lab/strategies', { method: 'POST', body }));
  const removeRun = useLabMutation((id: string) => api(`/lab/backtests/${id}`, { method: 'DELETE' }));

  const available = series.data ?? [];
  const current = spec ?? (available.length > 0 ? defaultSpec(available[0].symbol, available[0].timeframe) : null);

  if (series.isPending) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (available.length === 0) {
    return (
      <Card>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '32px 0' }}
          description="No price data yet. Import an OHLCV file on the Market data tab, and this becomes a backtester."
        />
      </Card>
    );
  }

  const patch = (over: Partial<StrategySpec>) => setSpec({ ...(current as StrategySpec), ...over });

  const execute = async () => {
    if (!current) return;
    setError(null);
    try {
      const response = await run.mutateAsync({
        spec: current,
        from: range[0] ?? undefined,
        to: range[1] ?? undefined,
        walkForwardSplit: walkForward ? 0.7 : null,
      });
      setResult(response.result);
      message.success(`${response.result.stats.trades} trades over ${response.result.stats.bars} bars in ${response.result.elapsedMs} ms`);
    } catch (problem) {
      setError(errorMessage(problem));
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10} xxl={9}>
        <Card
          title="The rules"
          size="small"
          extra={
            <Button
              size="small"
              onClick={async () => {
                if (!current) return;
                await save.mutateAsync({ name: current.name, spec: current });
                message.success('Strategy saved');
              }}
            >
              Save
            </Button>
          }
        >
          <Row gutter={[8, 8]}>
            <Col span={24}>
              <Input addonBefore="Name" value={current?.name ?? ''} onChange={(event) => patch({ name: event.target.value })} />
            </Col>
            <Col span={14}>
              <Select
                style={{ width: '100%' }}
                value={`${current?.symbol}|${current?.timeframe}`}
                onChange={(value) => {
                  const [symbol, timeframe] = value.split('|');
                  patch({ symbol, timeframe: timeframe as 'DAY' | 'MINUTE' });
                }}
                options={available.map((item) => ({
                  value: `${item.symbol}|${item.timeframe}`,
                  label: `${item.symbol} · ${item.timeframe === 'DAY' ? 'daily' : 'minute'} · ${item.bars.toLocaleString('en-IN')} bars`,
                }))}
              />
            </Col>
            <Col span={10}>
              <Select
                style={{ width: '100%' }}
                value={current?.direction}
                onChange={(value) => patch({ direction: value })}
                options={[
                  { value: 'LONG', label: 'Long only' },
                  { value: 'SHORT', label: 'Short only' },
                ]}
              />
            </Col>
            <Col span={24}>
              <Input addonBefore="Capital" value={current?.startingCapital ?? ''} onChange={(event) => patch({ startingCapital: event.target.value })} inputMode="decimal" />
            </Col>

            <Col span={24}>
              <Divider style={{ margin: '6px 0' }}>
                <Eyebrow>Enter when</Eyebrow>
              </Divider>
              {current && <ConditionEditor value={current.entry} onChange={(value) => patch({ entry: value })} />}
            </Col>

            <Col span={24}>
              <Divider style={{ margin: '6px 0' }}>
                <Eyebrow>Exit when</Eyebrow>
              </Divider>
              {current?.exit ? (
                <ConditionEditor value={current.exit} onChange={(value) => patch({ exit: value })} onRemove={() => patch({ exit: null })} />
              ) : (
                <Button size="small" onClick={() => patch({ exit: { type: 'COMPARE', left: { type: 'PRICE', field: 'CLOSE' }, op: 'LT', right: { type: 'INDICATOR', indicator: { kind: 'SMA', period: 20 } } } })}>
                  Add an exit rule
                </Button>
              )}
            </Col>

            <Col span={24}>
              <Divider style={{ margin: '6px 0' }}>
                <Eyebrow>Risk</Eyebrow>
              </Divider>
            </Col>
            <Col span={12}>
              <ExitRuleInput label="Stop" value={current?.stopLoss ?? null} onChange={(value) => patch({ stopLoss: value })} />
            </Col>
            <Col span={12}>
              <ExitRuleInput label="Target" value={current?.target ?? null} onChange={(value) => patch({ target: value })} />
            </Col>
            <Col span={12}>
              <ExitRuleInput label="Trail" value={current?.trailingStop ?? null} onChange={(value) => patch({ trailingStop: value })} />
            </Col>
            <Col span={12}>
              <InputNumber
                style={{ width: '100%' }}
                addonBefore="Max bars"
                placeholder="None"
                min={1}
                value={current?.maxBarsInTrade ?? undefined}
                onChange={(value) => patch({ maxBarsInTrade: value ?? null })}
              />
            </Col>
            {current?.timeframe === 'MINUTE' && (
              <Col span={12}>
                <Input
                  addonBefore="Square off"
                  placeholder="15:15"
                  value={current.intradaySquareOffTime ?? ''}
                  onChange={(event) => patch({ intradaySquareOffTime: event.target.value || null })}
                />
              </Col>
            )}

            <Col span={24}>
              <Divider style={{ margin: '6px 0' }}>
                <Eyebrow>Size and execution</Eyebrow>
              </Divider>
            </Col>
            <Col span={12}>
              <Select
                style={{ width: '100%' }}
                value={current?.sizing.method}
                onChange={(value) => patch({ sizing: { ...(current as StrategySpec).sizing, method: value } })}
                options={[
                  { value: 'FIXED_QUANTITY', label: 'Fixed quantity' },
                  { value: 'FIXED_FRACTIONAL', label: 'Fraction of equity' },
                  { value: 'FIXED_RISK', label: 'Fixed risk (needs a stop)' },
                ]}
              />
            </Col>
            <Col span={12}>
              {current?.sizing.method === 'FIXED_QUANTITY' ? (
                <InputNumber
                  style={{ width: '100%' }}
                  addonBefore="Qty"
                  min={1}
                  value={current.sizing.quantity ?? 100}
                  onChange={(value) => patch({ sizing: { ...current.sizing, quantity: value ?? 1 } })}
                />
              ) : (
                <InputNumber
                  style={{ width: '100%' }}
                  addonBefore="%"
                  min={0.01}
                  max={100}
                  value={current?.sizing.percent ?? 25}
                  onChange={(value) => patch({ sizing: { ...(current as StrategySpec).sizing, percent: value ?? 1 } })}
                />
              )}
            </Col>
            <Col span={12}>
              <InputNumber
                style={{ width: '100%' }}
                addonBefore="Lot size"
                min={1}
                value={current?.sizing.lotSize ?? 1}
                onChange={(value) => patch({ sizing: { ...(current as StrategySpec).sizing, lotSize: value ?? 1 } })}
              />
            </Col>
            <Col span={12}>
              <InputNumber
                style={{ width: '100%' }}
                addonBefore="Slippage"
                addonAfter={current?.execution.slippageType === 'BPS' ? 'bps' : 'pts'}
                min={0}
                value={current?.execution.slippage ?? 0}
                onChange={(value) => patch({ execution: { ...(current as StrategySpec).execution, slippage: value ?? 0 } })}
              />
            </Col>

            <Col span={24}>
              <Divider style={{ margin: '6px 0' }} />
              <Space wrap>
                <DatePicker.RangePicker
                  onChange={(values) => setRange([values?.[0]?.format('YYYY-MM-DD') ?? null, values?.[1]?.format('YYYY-MM-DD') ?? null])}
                />
                <Space size={6}>
                  <Switch checked={walkForward} onChange={setWalkForward} />
                  <span>Walk-forward</span>
                </Space>
              </Space>
            </Col>
            <Col span={24}>
              <Button type="primary" block icon={<PlayCircleOutlined />} loading={run.isPending} onClick={execute}>
                Run the backtest
              </Button>
            </Col>
          </Row>
        </Card>

        {(strategies.data?.length ?? 0) > 0 && (
          <Card size="small" title="Saved strategies" style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              {strategies.data?.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div>{item.name}</div>
                    <Muted>
                      {item.spec.symbol} · {item.runCount} run{item.runCount === 1 ? '' : 's'}
                    </Muted>
                  </div>
                  <Button size="small" icon={<Play size={14} weight="duotone" />} onClick={() => setSpec(item.spec)}>
                    Load
                  </Button>
                </div>
              ))}
            </Space>
          </Card>
        )}
      </Col>

      <Col xs={24} lg={14} xxl={15}>
        {error && <Alert type="error" showIcon message="That run could not be made" description={error} style={{ marginBottom: 16 }} />}
        {!result && !error && (
          <Card>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} description="Set the rules and press Run. Nothing is traded; this replays the bars you imported." />
          </Card>
        )}
        {result && <BacktestResultView result={result} />}

        {(stored.data?.length ?? 0) > 0 && (
          <Card size="small" title="Stored runs" style={{ marginTop: 16 }}>
            <Table
              size="small"
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
              rowKey="id"
              dataSource={stored.data}
              columns={[
                { title: 'Run', dataIndex: 'name' },
                { title: 'Symbol', dataIndex: 'symbol' },
                { title: 'Trades', align: 'right' as const, render: (_: unknown, row) => row.stats.trades },
                {
                  title: 'Net',
                  align: 'right' as const,
                  render: (_: unknown, row) => <Signed $value={num(row.stats.netPnl)}>{money(row.stats.netPnl, CURRENCY)}</Signed>,
                },
                { title: 'Max DD', align: 'right' as const, render: (_: unknown, row) => `${row.stats.maxDrawdownPercent}%` },
                {
                  title: '',
                  align: 'right' as const,
                  render: (_: unknown, row) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRun.mutate(row.id)} />,
                },
              ]}
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}

function BacktestResultView({ result }: { result: BacktestResult }) {
  const money = useMoney();
  const { stats } = result;

  return (
    <>
      {result.overfittingWarning && <Alert type="warning" showIcon message="Read this before the equity curve" description={result.overfittingWarning} style={{ marginBottom: 16 }} />}

      <ResultStrip
        items={[
          {
            label: 'Net P&L after charges',
            tone: num(stats.netPnl) < 0 ? 'negative' : 'positive',
            value: money(stats.netPnl, CURRENCY),
            caveat: `${stats.returnPercent}% on ${money(stats.startingCapital, CURRENCY)}${stats.cagrPercent ? ` · ${stats.cagrPercent}% a year` : ''}`,
          },
          { label: 'Max drawdown', tone: 'negative', value: `${stats.maxDrawdownPercent}%`, caveat: money(stats.maxDrawdownAmount, CURRENCY) },
          { label: 'Win rate', value: `${stats.winRatePercent}%`, caveat: `${stats.wins} won · ${stats.losses} lost of ${stats.trades}` },
          {
            label: 'Charges',
            tone: num(stats.totalCharges) > 0 ? 'negative' : 'neutral',
            value: money(stats.totalCharges, CURRENCY),
            caveat: stats.chargesPercentOfGross === null ? 'No gross profit to compare with' : `${stats.chargesPercentOfGross}% of gross profit`,
          },
        ]}
      />

      <Panel height={240} scroll={false} style={{ marginTop: 12 }} title="Equity and drawdown" extra={<Eyebrow>{`${stats.bars} bars · ${result.elapsedMs} ms`}</Eyebrow>}>
        <EquityAndDrawdown data={result.equityCurve} height={216} />
      </Panel>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={10}>
          <Card size="small" title="The numbers">
            <Row gutter={[8, 6]}>
              <Stat label="Sharpe" value={stats.sharpe ?? 'Not enough history'} />
              <Stat label="Expectancy" value={money(stats.expectancy, CURRENCY)} />
              <Stat label="Profit factor" value={stats.profitFactor ?? '—'} />
              <Stat label="Average win" value={money(stats.averageWin, CURRENCY)} />
              <Stat label="Average loss" value={money(stats.averageLoss, CURRENCY)} />
              <Stat label="Exposure" value={`${stats.exposurePercent}% of bars`} />
              <Stat label="Average hold" value={`${stats.averageBarsHeld} bars`} />
              <Stat label="Period" value={`${stats.from ?? '—'} to ${stats.to ?? '—'}`} />
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" title="What this run assumed">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.assumptions.map((line) => (
                <li key={line}>
                  <Muted>{line}</Muted>
                </li>
              ))}
            </ul>
            <LabNote type="warning" text={result.disclaimer} />
          </Card>
        </Col>

        {result.walkForward && (
          <Col span={24}>
            <Card size="small" title={`Walk-forward split at ${result.walkForward.splitDate}`}>
              <Alert type={num(result.walkForward.outOfSample.netPnl) > 0 ? 'info' : 'warning'} showIcon message={result.walkForward.verdict} style={{ marginBottom: 12 }} />
              <Table
                size="small"
                pagination={false}
                rowKey="key"
                dataSource={[
                  { key: 'in', half: `In-sample (first ${result.walkForward.splitPercent}%)`, ...result.walkForward.inSample },
                  { key: 'out', half: 'Out-of-sample', ...result.walkForward.outOfSample },
                ]}
                columns={[
                  { title: 'Half', dataIndex: 'half' },
                  { title: 'Bars', dataIndex: 'bars', align: 'right' as const },
                  { title: 'Trades', dataIndex: 'trades', align: 'right' as const },
                  { title: 'Return', dataIndex: 'returnPercent', align: 'right' as const, render: (value: string) => <Signed $value={num(value)}>{value}%</Signed> },
                  { title: 'Max DD', dataIndex: 'maxDrawdownPercent', align: 'right' as const, render: (value: string) => `${value}%` },
                  { title: 'Win rate', dataIndex: 'winRatePercent', align: 'right' as const, render: (value: string) => `${value}%` },
                ]}
              />
            </Card>
          </Col>
        )}

        <Col span={24}>
          <Card size="small">
            <Tabs
              items={[
                {
                  key: 'trades',
                  label: `Trades (${result.trades.length})`,
                  children: <TradeList trades={result.trades} />,
                },
                {
                  key: 'years',
                  label: 'By year',
                  children: (
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="year"
                      dataSource={result.perYear}
                      columns={[
                        { title: 'Year', dataIndex: 'year' },
                        { title: 'Trades', dataIndex: 'trades', align: 'right' as const },
                        { title: 'Win rate', dataIndex: 'winRatePercent', align: 'right' as const, render: (value: string) => `${value}%` },
                        { title: 'Return', dataIndex: 'returnPercent', align: 'right' as const, render: (value: string) => <Signed $value={num(value)}>{value}%</Signed> },
                        {
                          title: 'Net P&L',
                          dataIndex: 'netPnl',
                          align: 'right' as const,
                          render: (value: string) => <Signed $value={num(value)}>{money(value, CURRENCY)}</Signed>,
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}

function TradeList({ trades }: { trades: BacktestTrade[] }) {
  const money = useMoney();
  if (trades.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="The rules never fired" />;
  return (
    <Table
      size="small"
      rowKey="number"
      dataSource={trades}
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 20, showSizeChanger: false }}
      columns={[
        { title: '#', dataIndex: 'number', width: 56 },
        { title: 'Side', dataIndex: 'direction', render: (value: string) => <Tag color={value === 'LONG' ? 'green' : 'volcano'}>{value}</Tag> },
        { title: 'In', render: (_: unknown, row) => `${row.entryDate}${row.entryTime ? ` ${row.entryTime}` : ''} @ ${row.entryPrice}` },
        { title: 'Out', render: (_: unknown, row) => `${row.exitDate}${row.exitTime ? ` ${row.exitTime}` : ''} @ ${row.exitPrice}` },
        { title: 'Why', dataIndex: 'reason', render: (value: string) => EXIT_REASON_LABELS[value] ?? value },
        { title: 'Qty', dataIndex: 'quantity', align: 'right' as const },
        { title: 'Bars', dataIndex: 'barsHeld', align: 'right' as const },
        { title: 'Charges', align: 'right' as const, render: (_: unknown, row) => money(row.charges.total, CURRENCY) },
        { title: 'R', dataIndex: 'rMultiple', align: 'right' as const, render: (value: string | null) => (value === null ? '—' : `${value}R`) },
        {
          title: 'Net',
          dataIndex: 'netPnl',
          align: 'right' as const,
          render: (value: string) => <Signed $value={num(value)}>{money(value, CURRENCY)}</Signed>,
        },
      ]}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Col span={13}>
        <Muted>{label}</Muted>
      </Col>
      <Col span={11} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Col>
    </>
  );
}

/**
 * One comparison, as a sentence: "close crosses above the 20-period SMA". Nesting is supported
 * by the engine but not offered here — a form that can build an arbitrary tree is a form nobody
 * can read, and two conditions joined by AND covers almost everything people write.
 */
function ConditionEditor({ value, onChange, onRemove }: { value: Condition; onChange: (value: Condition) => void; onRemove?: () => void }) {
  if (value.type !== 'COMPARE') {
    return (
      <Space>
        <Typography.Text type="secondary">A rule this shape was built elsewhere; loading it keeps it intact.</Typography.Text>
        {onRemove && <Button size="small" onClick={onRemove}>Clear</Button>}
      </Space>
    );
  }
  return (
    <Row gutter={[6, 6]} align="middle">
      <Col span={9}>
        <OperandEditor value={value.left} onChange={(left) => onChange({ ...value, left })} />
      </Col>
      <Col span={6}>
        <Select size="small" style={{ width: '100%' }} value={value.op} onChange={(op) => onChange({ ...value, op })} options={OPERATORS} />
      </Col>
      <Col span={onRemove ? 7 : 9}>
        <OperandEditor value={value.right} onChange={(right) => onChange({ ...value, right })} />
      </Col>
      {onRemove && (
        <Col span={2}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onRemove} />
        </Col>
      )}
    </Row>
  );
}

function OperandEditor({ value, onChange }: { value: Operand; onChange: (value: Operand) => void }) {
  const kind = value.type === 'PRICE' ? `PRICE:${value.field}` : value.type === 'CONSTANT' ? 'CONSTANT' : `IND:${value.indicator.kind}`;
  const indicator = INDICATORS.find((item) => value.type === 'INDICATOR' && item.value === value.indicator.kind);
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Select
        size="small"
        style={{ width: indicator?.usesPeriod || value.type === 'CONSTANT' ? '62%' : '100%' }}
        value={kind}
        onChange={(next) => {
          if (next.startsWith('PRICE:')) onChange({ type: 'PRICE', field: next.slice(6) as 'CLOSE' });
          else if (next === 'CONSTANT') onChange({ type: 'CONSTANT', value: 0 });
          else onChange({ type: 'INDICATOR', indicator: { kind: next.slice(4) as IndicatorKind, period: 20 } });
        }}
        options={[
          {
            label: 'Price',
            options: [
              { value: 'PRICE:CLOSE', label: 'Close' },
              { value: 'PRICE:OPEN', label: 'Open' },
              { value: 'PRICE:HIGH', label: 'High' },
              { value: 'PRICE:LOW', label: 'Low' },
              { value: 'PRICE:VOLUME', label: 'Volume' },
            ],
          },
          { label: 'Indicator', options: INDICATORS.map((item) => ({ value: `IND:${item.value}`, label: item.label })) },
          { label: 'Other', options: [{ value: 'CONSTANT', label: 'A number' }] },
        ]}
      />
      {value.type === 'CONSTANT' && (
        <InputNumber size="small" style={{ width: '38%' }} value={value.value} onChange={(next) => onChange({ type: 'CONSTANT', value: next ?? 0 })} />
      )}
      {value.type === 'INDICATOR' && indicator?.usesPeriod && (
        <InputNumber
          size="small"
          style={{ width: '38%' }}
          min={1}
          max={500}
          value={value.indicator.period ?? 20}
          onChange={(next) => onChange({ type: 'INDICATOR', indicator: { ...value.indicator, period: next ?? 20 } })}
        />
      )}
    </Space.Compact>
  );
}

function ExitRuleInput({ label, value, onChange }: { label: string; value: StrategySpec['stopLoss']; onChange: (value: StrategySpec['stopLoss']) => void }) {
  return (
    <Space.Compact style={{ width: '100%' }}>
      <InputNumber
        style={{ width: '58%' }}
        addonBefore={label}
        placeholder="None"
        min={0.01}
        value={value?.value}
        onChange={(next) => onChange(next === null ? null : { type: value?.type ?? 'PERCENT', value: next })}
      />
      <Select
        style={{ width: '42%' }}
        value={value?.type ?? 'PERCENT'}
        disabled={!value}
        onChange={(type) => onChange(value ? { ...value, type } : null)}
        options={[
          { value: 'PERCENT', label: '%' },
          { value: 'POINTS', label: 'pts' },
          { value: 'ATR', label: 'ATR' },
        ]}
      />
    </Space.Compact>
  );
}

export { defaultSpec };
