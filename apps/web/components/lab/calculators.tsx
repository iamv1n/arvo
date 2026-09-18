'use client';

import { Coins } from '@phosphor-icons/react';
import { Alert, Button, Card, Col, DatePicker, Divider, Input, InputNumber, Row, Select, Space, Switch, Table } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useCompute, type FuturesCalculation, type RiskOfRuinResult, type SizingResult } from '../../lib/lab';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, Figure } from '../planning';
import { ResultStrip } from '../result-strip';
import { LabNote, Muted, Signed, num } from './shared';

/*
 * The two calculators nobody builds properly: what a futures position actually costs to hold
 * and roll, and how big a position a stated risk budget allows.
 *
 * Both are arithmetic the user could do on paper. The value is in showing the pieces that get
 * forgotten — the charges on both legs of a roll, the difference between capital deployed and
 * capital at risk — rather than in the headline number.
 */

const CURRENCY = 'INR';

export function FuturesCalculator() {
  const money = useMoney();
  const [form, setForm] = useState({
    underlying: 'NIFTY',
    segment: 'INDEX_FUTURES',
    exchange: 'NFO',
    date: dayjs().format('YYYY-MM-DD'),
    lots: 1,
    lotSize: 75,
    futuresPrice: '24100',
    spot: '24000',
    side: 'BUY' as 'BUY' | 'SELL',
    expiry: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    markPrice: '',
    marginPercentOfNotional: '12',
    rolling: false,
    nearPrice: '24100',
    farPrice: '24160',
  });
  const compute = useCompute<Record<string, unknown>, FuturesCalculation>('/lab/futures');
  const result = compute.data;

  const run = () =>
    compute.mutate({
      underlying: form.underlying,
      segment: form.segment,
      exchange: form.exchange,
      date: form.date,
      lots: form.lots,
      lotSize: form.lotSize,
      futuresPrice: form.futuresPrice,
      spot: form.spot,
      side: form.side,
      expiry: form.expiry,
      markPrice: form.markPrice || null,
      marginPercentOfNotional: form.marginPercentOfNotional,
      rollover: form.rolling ? { nearPrice: form.nearPrice, farPrice: form.farPrice } : null,
    });

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={9}>
        <Card title="Futures position" size="small">
          <Row gutter={[8, 8]}>
            <Col span={12}>
              <Input addonBefore="Symbol" value={form.underlying} onChange={(event) => setForm({ ...form, underlying: event.target.value.toUpperCase() })} />
            </Col>
            <Col span={12}>
              <Select
                style={{ width: '100%' }}
                value={form.side}
                onChange={(value) => setForm({ ...form, side: value })}
                options={[
                  { value: 'BUY', label: 'Long' },
                  { value: 'SELL', label: 'Short' },
                ]}
              />
            </Col>
            <Col span={12}>
              <InputNumber style={{ width: '100%' }} addonBefore="Lots" min={1} value={form.lots} onChange={(value) => setForm({ ...form, lots: value ?? 1 })} />
            </Col>
            <Col span={12}>
              <InputNumber style={{ width: '100%' }} addonBefore="Lot size" min={1} value={form.lotSize} onChange={(value) => setForm({ ...form, lotSize: value ?? 1 })} />
            </Col>
            <Col span={12}>
              <Input addonBefore="Future" value={form.futuresPrice} onChange={(event) => setForm({ ...form, futuresPrice: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={12}>
              <Input addonBefore="Spot" value={form.spot} onChange={(event) => setForm({ ...form, spot: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={12}>
              <DatePicker style={{ width: '100%' }} allowClear={false} value={dayjs(form.date)} onChange={(value) => setForm({ ...form, date: (value ?? dayjs()).format('YYYY-MM-DD') })} />
            </Col>
            <Col span={12}>
              <DatePicker
                style={{ width: '100%' }}
                allowClear={false}
                placeholder="Expiry"
                value={dayjs(form.expiry)}
                onChange={(value) => setForm({ ...form, expiry: (value ?? dayjs()).format('YYYY-MM-DD') })}
              />
            </Col>
            <Col span={12}>
              <Input addonBefore="Mark" placeholder="Optional" value={form.markPrice} onChange={(event) => setForm({ ...form, markPrice: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={12}>
              <Input addonBefore="Margin %" value={form.marginPercentOfNotional} onChange={(event) => setForm({ ...form, marginPercentOfNotional: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={12}>
              <Select
                style={{ width: '100%' }}
                value={form.segment}
                onChange={(value) => setForm({ ...form, segment: value, exchange: value === 'COMMODITY_FUTURES' ? 'MCX' : value === 'CURRENCY_FUTURES' ? 'CDS' : 'NFO' })}
                options={[
                  { value: 'INDEX_FUTURES', label: 'Index futures' },
                  { value: 'EQUITY_FUTURES', label: 'Stock futures' },
                  { value: 'CURRENCY_FUTURES', label: 'Currency futures' },
                  { value: 'COMMODITY_FUTURES', label: 'Commodity futures' },
                ]}
              />
            </Col>
            <Col span={24}>
              <Space>
                <Switch checked={form.rolling} onChange={(checked) => setForm({ ...form, rolling: checked })} />
                <span>Work out a rollover</span>
              </Space>
            </Col>
            {form.rolling && (
              <>
                <Col span={12}>
                  <Input addonBefore="Near" value={form.nearPrice} onChange={(event) => setForm({ ...form, nearPrice: event.target.value })} inputMode="decimal" />
                </Col>
                <Col span={12}>
                  <Input addonBefore="Far" value={form.farPrice} onChange={(event) => setForm({ ...form, farPrice: event.target.value })} inputMode="decimal" />
                </Col>
              </>
            )}
            <Col span={24}>
              <Button type="primary" block loading={compute.isPending} onClick={run} icon={<Coins size={16} weight="duotone" />}>
                Calculate
              </Button>
            </Col>
          </Row>
        </Card>
      </Col>

      <Col xs={24} lg={15}>
        {!result && <Alert type="info" showIcon message="Fill the form and press Calculate." style={{ marginBottom: 16 }} />}
        {result && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col span={24}>
                <ResultStrip
                  items={[
                    { label: 'Notional', value: money(result.notional, CURRENCY), caveat: `${result.quantity} units` },
                    { label: 'Margin estimate', value: money(result.margin.total, CURRENCY), caveat: 'Rough — check with your broker' },
                    {
                      label: 'Per point',
                      value: money(result.mtmPerPoint, CURRENCY),
                      caveat: result.mtm === null ? 'No mark price given' : `MTM ${money(result.mtm, CURRENCY)}`,
                    },
                    {
                      label: 'Basis',
                      value: result.basis,
                      caveat:
                        result.annualisedBasisPercent === null
                          ? `${result.basisPercent}% of spot`
                          : `${result.annualisedBasisPercent}% a year over ${result.daysToExpiry ?? 0} days`,
                    },
                  ]}
                />
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title="Round-trip charges" size="small">
                  <ChargesList charges={result.roundTripCharges} />
                  <Muted>From the statutory table in force on the trade date, so it matches what the journal will say for the same trade.</Muted>
                </Card>
              </Col>
              {result.rollover && (
                <Col xs={24} lg={12}>
                  <Card title="Rolling to the next series" size="small" style={{ position: 'relative' }}>
                    <Eyebrow>Spread</Eyebrow>
                    <div>
                      <Figure $size={22}>{result.rollover.spread}</Figure> <Muted>points</Muted>
                    </div>
                    <Divider style={{ margin: '10px 0' }} />
                    <Row gutter={[8, 4]}>
                      <Col span={14}>
                        <Muted>Cost of the spread</Muted>
                      </Col>
                      <Col span={10} style={{ textAlign: 'right' }}>
                        <Signed $value={-num(result.rollover.spreadCost)}>{money(result.rollover.spreadCost, CURRENCY)}</Signed>
                      </Col>
                      <Col span={14}>
                        <Muted>Charges on both legs</Muted>
                      </Col>
                      <Col span={10} style={{ textAlign: 'right' }}>
                        {money(result.rollover.charges.total, CURRENCY)}
                      </Col>
                      <Col span={14}>
                        <strong>Total to roll</strong>
                      </Col>
                      <Col span={10} style={{ textAlign: 'right' }}>
                        <strong>{money(result.rollover.total, CURRENCY)}</strong>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              )}
              <Col span={24}>
                <LabNote type="warning" text={result.margin.disclaimer} />
              </Col>
            </Row>
          </>
        )}
      </Col>
    </Row>
  );
}

function ChargesList({ charges }: { charges: FuturesCalculation['roundTripCharges'] }) {
  const money = useMoney();
  const rows: [string, string][] = [
    ['Brokerage', charges.brokerage],
    ['STT / CTT', charges.stt],
    ['Exchange transaction', charges.exchangeCharges],
    ['SEBI turnover fee', charges.sebiCharges],
    ['Stamp duty', charges.stampDuty],
    ['GST', charges.gst],
  ];
  return (
    <Row gutter={[8, 4]}>
      {rows.map(([label, value]) => (
        <Col span={24} key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Muted>{label}</Muted>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(value, CURRENCY)}</span>
        </Col>
      ))}
      <Col span={24} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid currentColor', paddingTop: 6, marginTop: 4 }}>
        <strong>Total</strong>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(charges.total, CURRENCY)}</strong>
      </Col>
    </Row>
  );
}

export function SizingCalculator() {
  const money = useMoney();
  const [form, setForm] = useState({
    capital: '500000',
    riskPercent: '1',
    useFlatRisk: false,
    riskAmount: '5000',
    entryPrice: '1000',
    stopPrice: '980',
    targetPrice: '1060',
    lotSize: 1,
  });
  const [ruin, setRuin] = useState({ winRatePercent: '45', payoffRatio: '2', riskPercent: '1', ruinDrawdownPercent: '100' });

  const size = useCompute<Record<string, unknown>, SizingResult>('/lab/sizing');
  const risk = useCompute<Record<string, unknown>, RiskOfRuinResult>('/lab/risk-of-ruin');

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card title="How big should the position be?" size="small">
          <Row gutter={[8, 8]}>
            <Col span={12}>
              <Input addonBefore="Capital" value={form.capital} onChange={(event) => setForm({ ...form, capital: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={12}>
              <InputNumber style={{ width: '100%' }} addonBefore="Lot size" min={1} value={form.lotSize} onChange={(value) => setForm({ ...form, lotSize: value ?? 1 })} />
            </Col>
            <Col span={24}>
              <Space>
                <Switch checked={form.useFlatRisk} onChange={(checked) => setForm({ ...form, useFlatRisk: checked })} />
                <span>{form.useFlatRisk ? 'A flat rupee risk per trade' : 'A percentage of capital'}</span>
              </Space>
            </Col>
            <Col span={12}>
              {form.useFlatRisk ? (
                <Input addonBefore="Risk" value={form.riskAmount} onChange={(event) => setForm({ ...form, riskAmount: event.target.value })} inputMode="decimal" />
              ) : (
                <Input addonBefore="Risk %" value={form.riskPercent} onChange={(event) => setForm({ ...form, riskPercent: event.target.value })} inputMode="decimal" />
              )}
            </Col>
            <Col span={12}>
              <Input addonBefore="Entry" value={form.entryPrice} onChange={(event) => setForm({ ...form, entryPrice: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={12}>
              <Input addonBefore="Stop" value={form.stopPrice} onChange={(event) => setForm({ ...form, stopPrice: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={12}>
              <Input addonBefore="Target" placeholder="Optional" value={form.targetPrice} onChange={(event) => setForm({ ...form, targetPrice: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={24}>
              <Button
                type="primary"
                block
                loading={size.isPending}
                onClick={() =>
                  size.mutate({
                    capital: form.capital,
                    riskPercent: form.riskPercent,
                    riskAmount: form.useFlatRisk ? form.riskAmount : null,
                    entryPrice: form.entryPrice,
                    stopPrice: form.stopPrice,
                    targetPrice: form.targetPrice || null,
                    lotSize: form.lotSize,
                  })
                }
              >
                Work out the size
              </Button>
            </Col>
          </Row>

          {size.data && (
            <div style={{ marginTop: 16 }}>
              <Eyebrow>Quantity</Eyebrow>
              <div>
                <Figure $size={30}>{size.data.quantity.toLocaleString('en-IN')}</Figure>{' '}
                <Muted>
                  units{size.data.lots !== size.data.quantity ? ` · ${size.data.lots} lot${size.data.lots === 1 ? '' : 's'}` : ''}
                </Muted>
              </div>
              <Divider style={{ margin: '10px 0' }} />
              <Row gutter={[8, 4]}>
                <Pair label="Risk budget" value={money(size.data.riskPerTrade, CURRENCY)} />
                <Pair label="Risk at the stop" value={money(size.data.riskAtStop, CURRENCY)} />
                <Pair label="Stop distance" value={size.data.stopDistance} />
                <Pair label="Position value" value={money(size.data.positionValue, CURRENCY)} />
                <Pair label="Capital deployed" value={`${size.data.exposurePercent}%`} />
                <Pair label="Reward to risk" value={size.data.rewardToRisk === null ? '—' : `${size.data.rewardToRisk} : 1`} />
              </Row>
              {size.data.notes.map((note) => (
                <LabNote key={note} type="warning" text={note} />
              ))}
              <div style={{ marginTop: 10 }}>
                <Muted>Capital deployed and capital at risk are different numbers. Confusing them is the commonest sizing mistake there is.</Muted>
              </div>
            </div>
          )}
          {size.isError && <Alert style={{ marginTop: 12 }} type="error" showIcon message="That cannot be sized" description="Check that the stop is away from the entry." />}
        </Card>
      </Col>

      <Col xs={24} lg={14}>
        <Card title="Risk of ruin" size="small" style={{ position: 'relative' }}>
          <Row gutter={[8, 8]}>
            <Col xs={12} xl={6}>
              <Input addonBefore="Win %" value={ruin.winRatePercent} onChange={(event) => setRuin({ ...ruin, winRatePercent: event.target.value })} inputMode="decimal" />
            </Col>
            <Col xs={12} xl={6}>
              <Input addonBefore="Payoff" value={ruin.payoffRatio} onChange={(event) => setRuin({ ...ruin, payoffRatio: event.target.value })} inputMode="decimal" />
            </Col>
            <Col xs={12} xl={6}>
              <Input addonBefore="Risk %" value={ruin.riskPercent} onChange={(event) => setRuin({ ...ruin, riskPercent: event.target.value })} inputMode="decimal" />
            </Col>
            <Col xs={12} xl={6}>
              <Input addonBefore="Ruin %" value={ruin.ruinDrawdownPercent} onChange={(event) => setRuin({ ...ruin, ruinDrawdownPercent: event.target.value })} inputMode="decimal" />
            </Col>
            <Col span={24}>
              <Button block loading={risk.isPending} onClick={() => risk.mutate(ruin)}>
                Work out the risk of ruin
              </Button>
            </Col>
          </Row>

          {risk.data && (
            <div style={{ marginTop: 16 }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={10}>
                  <Eyebrow>Chance of ruin</Eyebrow>
                  <div>
                    <Figure $size={30}>
                      <Signed $value={num(risk.data.percent) > 5 ? -1 : 1}>{Number(risk.data.percent) < 0.0001 && Number(risk.data.percent) > 0 ? '<0.0001' : risk.data.percent}%</Signed>
                    </Figure>
                  </div>
                  <Muted>
                    Expectancy {risk.data.expectancyR}R per trade · {risk.data.unitsOfRisk} units of risk before ruin
                  </Muted>
                </Col>
                <Col xs={24} md={14}>
                  <Eyebrow>Kelly</Eyebrow>
                  <Table
                    size="small"
                    pagination={false}
                    showHeader={false}
                    dataSource={[
                      { key: 'full', label: 'Full Kelly', value: `${risk.data.kelly.fullKellyPercent}%` },
                      { key: 'half', label: 'Half Kelly', value: `${risk.data.kelly.halfKellyPercent}%` },
                      { key: 'quarter', label: 'Quarter Kelly', value: `${risk.data.kelly.quarterKellyPercent}%` },
                    ]}
                    columns={[
                      { dataIndex: 'label' },
                      { dataIndex: 'value', align: 'right' as const },
                    ]}
                  />
                </Col>
                <Col span={24}>
                  <LabNote
                    type="warning"
                    text={
                      <>
                        <b>Kelly is an explainer, not a size to trade.</b> {risk.data.kelly.warning}
                      </>
                    }
                  />
                  <LabNote text={risk.data.disclaimer} />
                </Col>
              </Row>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Col span={14}>
        <Muted>{label}</Muted>
      </Col>
      <Col span={10} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Col>
    </>
  );
}
