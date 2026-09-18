'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, DatePicker, Divider, Empty, Input, InputNumber, Row, Select, Space, Table, Tooltip } from 'antd';
import dayjs from 'dayjs';
import styled from 'styled-components';
import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../lib/api';
import {
  useCompute,
  useTemplates,
  type ImpliedVolatilityReport,
  type LegAnalysis,
  type MarketAssumptions,
  type PayoffReport,
  type StrategyLeg,
} from '../../lib/lab';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, Figure, Stamp } from '../planning';
import { Panel } from '../panel';
import { PayoffChart } from './payoff-chart';
import { ResultStrip } from '../result-strip';
import { Advanced, Extreme, Field, Fields, FormScroll, LEG_KIND_LABELS, LabNote, Muted, OUTLOOK_LABELS, Signed, num } from './shared';

/*
 * The payoff builder.
 *
 * A leg editor on the left, a chart and the numbers on the right, recomputed on every change
 * through a stateless POST. Nothing is saved, because there is nothing worth saving: the whole
 * thing is a function of the form, and a stored copy would only go stale.
 *
 * The margin figure and the probability of profit both carry their own caveat inline rather
 * than in a footnote, because both are the kind of number people quote without the asterisk.
 */

const OPTION_KINDS = new Set(['CALL', 'PUT']);

const emptyLeg = (over: Partial<StrategyLeg> = {}): StrategyLeg => ({
  kind: 'CALL',
  action: 'BUY',
  lots: 1,
  lotSize: 75,
  strike: '24000',
  premium: '150',
  expiry: dayjs().add(30, 'day').format('YYYY-MM-DD'),
  impliedVolatilityPercent: null,
  label: null,
  ...over,
});

const LegHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto;
  align-items: center;
  gap: 8px;
`;

export function PayoffBuilder() {
  const money = useMoney();
  const templates = useTemplates();
  const [legs, setLegs] = useState<StrategyLeg[]>([emptyLeg()]);
  const [assumptions, setAssumptions] = useState<MarketAssumptions>({
    spot: '24000',
    asOf: dayjs().format('YYYY-MM-DD'),
    riskFreeRatePercent: '6.5',
    dividendYieldPercent: '0',
    impliedVolatilityPercent: '14',
  });
  const [strikeStep, setStrikeStep] = useState(50);
  const [lotSize, setLotSize] = useState(75);
  const [report, setReport] = useState<PayoffReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payoff = useCompute<{ legs: StrategyLeg[]; assumptions: MarketAssumptions }, PayoffReport>('/lab/payoff');
  const buildTemplate = useCompute<Record<string, unknown>, { legs: StrategyLeg[]; assumptions: MarketAssumptions; note: string }>('/lab/templates');

  // Recompute whenever anything the model depends on changes. The request is cheap and
  // stateless, so there is no reason to make the user press a button.
  const key = useMemo(() => JSON.stringify({ legs, assumptions }), [legs, assumptions]);
  useEffect(() => {
    let cancelled = false;
    payoff
      .mutateAsync({ legs, assumptions })
      .then((result) => {
        if (!cancelled) {
          setReport(result);
          setError(null);
        }
      })
      .catch((problem: unknown) => {
        if (!cancelled) setError(errorMessage(problem));
      });
    return () => {
      cancelled = true;
    };
    // The dependency is the serialised form on purpose: `legs` is a new array on every
    // keystroke, and the mutation object changes identity on every render.
  }, [key]);

  const applyTemplate = async (template: string) => {
    const chosen = templates.data?.templates.find((item) => item.id === template);
    const near = dayjs(assumptions.asOf).add(30, 'day');
    const built = await buildTemplate.mutateAsync({
      template,
      spot: assumptions.spot,
      strikeStep: String(strikeStep),
      lotSize,
      lots: 1,
      expiry: near.format('YYYY-MM-DD'),
      farExpiry: chosen?.needsFarExpiry ? near.add(28, 'day').format('YYYY-MM-DD') : null,
      asOf: assumptions.asOf,
      impliedVolatilityPercent: assumptions.impliedVolatilityPercent,
      riskFreeRatePercent: assumptions.riskFreeRatePercent,
      dividendYieldPercent: assumptions.dividendYieldPercent,
    });
    setLegs(built.legs);
  };

  const patchLeg = (index: number, patch: Partial<StrategyLeg>) =>
    setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  const currency = 'INR';


  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10} xxl={9}>
        <Card
          size="small"
          title="The structure"
          extra={
            <Button size="small" icon={<PlusOutlined />} onClick={() => setLegs((current) => [...current, emptyLeg({ lotSize })])} disabled={legs.length >= 12}>
              Leg
            </Button>
          }
        >
          <Eyebrow>Start from a template</Eyebrow>
          <Space wrap size={6} style={{ marginTop: 6, marginBottom: 2 }}>
            <Select
              size="small"
              style={{ minWidth: 170 }}
              placeholder="Pick a structure"
              loading={templates.isPending}
              onChange={applyTemplate}
              options={(templates.data?.templates ?? []).map((template) => ({
                value: template.id,
                label: template.name,
                title: template.summary,
              }))}
            />
            <Tooltip title="Distance between adjacent strikes: 50 for NIFTY, 100 for BANKNIFTY.">
              <InputNumber size="small" value={strikeStep} min={1} onChange={(value) => setStrikeStep(value ?? 50)} addonBefore="Step" style={{ width: 112 }} />
            </Tooltip>
            <Tooltip title="Contract multiplier.">
              <InputNumber size="small" value={lotSize} min={1} onChange={(value) => setLotSize(value ?? 1)} addonBefore="Lot" style={{ width: 112 }} />
            </Tooltip>
          </Space>
          <Muted>Template premiums are model prices, not quotes. Replace them with the real bid and ask.</Muted>

          <Divider style={{ margin: '10px 0' }} />

          <FormScroll $max={340}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {legs.map((leg, index) => (
              <Card key={index} size="small" styles={{ body: { padding: 8 } }}>
                <LegHead>
                  <Select
                    size="small"
                    value={leg.action}
                    onChange={(value) => patchLeg(index, { action: value })}
                    options={[
                      { value: 'BUY', label: 'Buy' },
                      { value: 'SELL', label: 'Sell' },
                    ]}
                  />
                  <Select
                    size="small"
                    value={leg.kind}
                    onChange={(value) =>
                      patchLeg(index, {
                        kind: value,
                        strike: OPTION_KINDS.has(value) ? (leg.strike ?? assumptions.spot) : null,
                        expiry: value === 'UNDERLYING' ? null : (leg.expiry ?? dayjs().add(30, 'day').format('YYYY-MM-DD')),
                      })
                    }
                    options={Object.entries(LEG_KIND_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setLegs((current) => current.filter((_, i) => i !== index))} />
                </LegHead>
                <Fields $min={110}>
                  <Field>
                    <span>Lots</span>
                    <InputNumber size="small" style={{ width: '100%' }} min={1} value={leg.lots} onChange={(value) => patchLeg(index, { lots: value ?? 1 })} />
                  </Field>
                  <Field>
                    <span>Lot size</span>
                    <InputNumber size="small" style={{ width: '100%' }} min={1} value={leg.lotSize} onChange={(value) => patchLeg(index, { lotSize: value ?? 1 })} />
                  </Field>
                  <Field>
                    <span>Premium</span>
                    <Input size="small" value={leg.premium} onChange={(event) => patchLeg(index, { premium: event.target.value })} inputMode="decimal" />
                  </Field>
                  {OPTION_KINDS.has(leg.kind) && (
                    <Field>
                      <span>Strike</span>
                      <Input size="small" value={leg.strike ?? ''} onChange={(event) => patchLeg(index, { strike: event.target.value })} inputMode="decimal" />
                    </Field>
                  )}
                  {leg.kind !== 'UNDERLYING' && (
                    <Field>
                      <span>Expiry</span>
                      <DatePicker
                        size="small"
                        style={{ width: '100%' }}
                        allowClear={false}
                        value={leg.expiry ? dayjs(leg.expiry) : null}
                        onChange={(value) => patchLeg(index, { expiry: value ? value.format('YYYY-MM-DD') : null })}
                      />
                    </Field>
                  )}
                  {OPTION_KINDS.has(leg.kind) && (
                    <Field>
                      <span>IV %</span>
                      <Input
                        size="small"
                        placeholder={`${assumptions.impliedVolatilityPercent} default`}
                        value={leg.impliedVolatilityPercent ?? ''}
                        onChange={(event) => patchLeg(index, { impliedVolatilityPercent: event.target.value || null })}
                        inputMode="decimal"
                      />
                    </Field>
                  )}
                </Fields>
              </Card>
            ))}
            {legs.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No legs yet" />}
          </Space>
          </FormScroll>

          <Divider style={{ margin: '10px 0' }} />
          <Eyebrow>Market assumptions</Eyebrow>
          <Fields $min={112}>
            <Field>
              <span>Spot</span>
              <Input size="small" value={assumptions.spot} onChange={(event) => setAssumptions({ ...assumptions, spot: event.target.value })} inputMode="decimal" />
            </Field>
            <Field>
              <span>As of</span>
              <DatePicker
                size="small"
                style={{ width: '100%' }}
                allowClear={false}
                value={dayjs(assumptions.asOf)}
                onChange={(value) => setAssumptions({ ...assumptions, asOf: (value ?? dayjs()).format('YYYY-MM-DD') })}
              />
            </Field>
            <Field>
              <span>IV %</span>
              <Input
                size="small"
                value={assumptions.impliedVolatilityPercent}
                onChange={(event) => setAssumptions({ ...assumptions, impliedVolatilityPercent: event.target.value })}
                inputMode="decimal"
              />
            </Field>
          </Fields>
          <Advanced label="Rates">
            <Fields $min={112}>
              <Field>
                <span>Risk-free %</span>
                <Input
                  size="small"
                  value={assumptions.riskFreeRatePercent}
                  onChange={(event) => setAssumptions({ ...assumptions, riskFreeRatePercent: event.target.value })}
                  inputMode="decimal"
                />
              </Field>
              <Field>
                <span>Dividend %</span>
                <Input
                  size="small"
                  value={assumptions.dividendYieldPercent}
                  onChange={(event) => setAssumptions({ ...assumptions, dividendYieldPercent: event.target.value })}
                  inputMode="decimal"
                />
              </Field>
            </Fields>
          </Advanced>
          <div style={{ marginTop: 8 }}>
            <Muted>Black&#8211;Scholes, European, ACT/365. IV, the risk-free rate and the dividend yield are your assumptions, not observations.</Muted>
          </div>
        </Card>

        <div style={{ marginTop: 16 }}>
          <ImpliedVolatilitySolver assumptions={assumptions} />
        </div>
      </Col>

      <Col xs={24} lg={14} xxl={15}>
        {error && <Alert type="error" showIcon message="That structure cannot be priced" description={error} style={{ marginBottom: 16 }} />}

        <ResultStrip
          className="payoff-results"
          items={[
            {
              label: num(report?.netCashflow) >= 0 ? 'Net credit' : 'Net debit',
              value: report ? money(Math.abs(num(report.netCashflow)), currency) : '—',
              caveat: num(report?.netCashflow) >= 0 ? 'Received to open' : 'Paid to open',
            },
            {
              label: 'Max profit',
              tone: 'positive',
              value: report ? <Extreme {...report.maxProfit} format={(value) => money(value, currency)} /> : '—',
              caveat: 'At nearest expiry',
            },
            {
              label: 'Max loss',
              tone: 'negative',
              value: report ? <Extreme {...report.maxLoss} format={(value) => money(value, currency)} /> : '—',
              caveat: 'Floor at spot zero',
            },
            {
              label: 'Breakevens',
              value: report && report.breakevens.length > 0 ? report.breakevens.map((value) => Number(value).toFixed(0)).join(' · ') : '—',
              caveat: report?.probabilityOfProfit ? `${report.probabilityOfProfit.percent}% chance of profit · estimate` : 'No crossing',
            },
          ]}
        />

        <Panel height={260} scroll={false} style={{ marginTop: 12 }} title="Payoff" extra={<Eyebrow>Solid: at expiry &nbsp;·&nbsp; dashed: today</Eyebrow>}>
          <PayoffChart series={report?.series ?? []} spot={assumptions.spot} breakevens={report?.breakevens ?? []} height={236} currency={currency} />
        </Panel>

        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} xxl={14}>
            <Card title="Greeks" size="small">
              <div style={{ overflowX: 'auto' }}>
                <GreeksTable legs={report?.legs ?? []} net={report?.netGreeks} />
              </div>
              <Muted>Position Greeks: per-unit sensitivity times quantity and direction. Theta is per calendar day; vega and rho per one point.</Muted>
            </Card>
          </Col>
          <Col xs={24} xxl={10}>
            <Card title="Margin estimate" size="small" style={{ position: 'relative' }}>
              <Figure $size={26}>{report ? money(report.margin.total, currency) : '—'}</Figure>
              <div style={{ marginTop: 8 }}>
                <Row gutter={[8, 4]}>
                  <Col span={14}>
                    <Muted>Short-leg margin</Muted>
                  </Col>
                  <Col span={10} style={{ textAlign: 'right' }}>
                    {report ? money(report.margin.shortLegMargin, currency) : '—'}
                  </Col>
                  <Col span={14}>
                    <Muted>Hedge credit</Muted>
                  </Col>
                  <Col span={10} style={{ textAlign: 'right' }}>
                    {report ? `− ${money(report.margin.hedgeCredit, currency)}` : '—'}
                  </Col>
                  <Col span={14}>
                    <Muted>Premium you pay out</Muted>
                  </Col>
                  <Col span={10} style={{ textAlign: 'right' }}>
                    {report ? money(report.margin.premiumDebit, currency) : '—'}
                  </Col>
                </Row>
              </div>
              {report && <LabNote type="warning" text={report.margin.disclaimer} />}
            </Card>
          </Col>
          {report?.probabilityOfProfit && (
            <Col span={24}>
              <Card size="small" style={{ position: 'relative' }}>
                <LabNote
                  text={
                    <>
                      <b>Estimated {report.probabilityOfProfit.percent}% chance of finishing above zero.</b> {report.probabilityOfProfit.method}{' '}
                      {report.probabilityOfProfit.caveat}
                    </>
                  }
                />
              </Card>
            </Col>
          )}
        </Row>
      </Col>
    </Row>
  );
}

function GreeksTable({ legs, net }: { legs: LegAnalysis[]; net?: PayoffReport['netGreeks'] }) {
  const rows = [
    ...legs.map((leg) => ({
      key: String(leg.index),
      label: leg.label,
      action: leg.action,
      quantity: leg.quantity,
      theoretical: leg.theoreticalValue,
      ...leg.greeks,
    })),
    ...(net ? [{ key: 'net', label: 'Net', action: '', quantity: 0, theoretical: null, ...net }] : []),
  ];
  return (
    <Table
      size="small"
      pagination={false}
      scroll={{ x: 'max-content' }}
      dataSource={rows}
      rowClassName={(row) => (row.key === 'net' ? 'arvo-net-row' : '')}
      columns={[
        {
          title: 'Leg',
          dataIndex: 'label',
          render: (value: string, row) =>
            row.key === 'net' ? (
              <strong>{value}</strong>
            ) : (
              <Space size={6}>
                <Stamp $tone={row.action === 'BUY' ? 'positive' : 'negative'}>{row.action === 'BUY' ? 'Long' : 'Short'}</Stamp>
                <span>{value}</span>
              </Space>
            ),
        },
        { title: 'Model', dataIndex: 'theoretical', align: 'right' as const, render: (value: string | null) => value ?? '—' },
        { title: 'Delta', dataIndex: 'delta', align: 'right' as const, render: (value: string) => <Signed $value={num(value)}>{value}</Signed> },
        { title: 'Gamma', dataIndex: 'gamma', align: 'right' as const },
        { title: 'Theta/day', dataIndex: 'theta', align: 'right' as const, render: (value: string) => <Signed $value={num(value)}>{value}</Signed> },
        { title: 'Vega', dataIndex: 'vega', align: 'right' as const, render: (value: string) => <Signed $value={num(value)}>{value}</Signed> },
        { title: 'Rho', dataIndex: 'rho', align: 'right' as const },
      ]}
    />
  );
}

/**
 * The implied-volatility solver, tucked under the leg editor because that is where it gets
 * used: you have a quote, you want the volatility it implies, and then you type it into a leg.
 */
function ImpliedVolatilitySolver({ assumptions }: { assumptions: MarketAssumptions }) {
  const [form, setForm] = useState({ strike: '24000', premium: '200', right: 'CE' as 'CE' | 'PE', expiry: dayjs().add(30, 'day').format('YYYY-MM-DD') });
  const solve = useCompute<Record<string, unknown>, ImpliedVolatilityReport>('/lab/iv');
  const result = solve.data;

  return (
    <Card title="Implied volatility from a quote" size="small">
      <Fields $min={110}>
        <Field>
          <span>Strike</span>
          <Input size="small" value={form.strike} onChange={(event) => setForm({ ...form, strike: event.target.value })} inputMode="decimal" />
        </Field>
        <Field>
          <span>Premium</span>
          <Input size="small" value={form.premium} onChange={(event) => setForm({ ...form, premium: event.target.value })} inputMode="decimal" />
        </Field>
        <Field>
          <span>Right</span>
          <Select
            size="small"
            value={form.right}
            onChange={(value) => setForm({ ...form, right: value })}
            options={[
              { value: 'CE', label: 'Call' },
              { value: 'PE', label: 'Put' },
            ]}
          />
        </Field>
        <Field>
          <span>Expiry</span>
          <DatePicker
            size="small"
            allowClear={false}
            value={dayjs(form.expiry)}
            onChange={(value) => setForm({ ...form, expiry: (value ?? dayjs()).format('YYYY-MM-DD') })}
          />
        </Field>
      </Fields>
      <Button
        size="small"
        block
        style={{ marginTop: 8 }}
        loading={solve.isPending}
        onClick={() =>
          solve.mutate({
            spot: assumptions.spot,
            strike: form.strike,
            premium: form.premium,
            right: form.right,
            expiry: form.expiry,
            asOf: assumptions.asOf,
            riskFreeRatePercent: assumptions.riskFreeRatePercent,
            dividendYieldPercent: assumptions.dividendYieldPercent,
          })
        }
      >
        Solve
      </Button>
      {result && (
        <div style={{ marginTop: 12 }}>
          {result.impliedVolatilityPercent !== null ? (
            <>
              <Eyebrow>Implied volatility</Eyebrow>
              <div>
                <Figure $size={24}>{result.impliedVolatilityPercent}%</Figure>
              </div>
              <Muted>
                {result.intrinsicValue} intrinsic · {result.timeValue} time value · {result.daysToExpiry} days · {result.iterations} iterations
              </Muted>
            </>
          ) : (
            <Alert type="warning" showIcon message={result.message} />
          )}
        </div>
      )}
    </Card>
  );
}

export { OUTLOOK_LABELS };
