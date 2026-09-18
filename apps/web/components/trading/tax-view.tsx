'use client';

import { DownloadSimple, Scales, Warning } from '@phosphor-icons/react';
import { Alert, Button, Card, Col, Descriptions, Empty, Row, Select, Skeleton, Space, Table } from 'antd';
import { API_URL } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useTradingTax } from '../../lib/queries';
import type { TradingTaxSummary } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, Figure } from '../planning';
import { Panel } from '../panel';
import { StatCard } from '../stat-card';
import { CHARGE_LABELS, Muted, NotAdvice, Pnl, num } from './shared';

/**
 * The three buckets the Income Tax Department cares about, with the turnover figure the audit
 * threshold is actually tested against — which is not the value of the trades, and is the thing
 * most people get wrong.
 */
export function TaxView({ asOf, financialYear, onYearChange }: { asOf: string; financialYear?: string; onYearChange: (fy: string) => void }) {
  const money = useMoney();
  const query = useTradingTax(asOf, financialYear);
  const currency = 'INR';

  if (query.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }
  const data = query.data;
  if (!data) return null;
  if (data.availableYears.length === 0) {
    return (
      <Card>
        <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="No closed trades yet, so there is nothing to classify." />
      </Card>
    );
  }

  const buckets = [
    { key: 'speculative', ...data.speculative, note: 'Intraday equity. Losses carry forward four years, and only against speculative income.' },
    { key: 'nonSpeculative', ...data.nonSpeculative, note: 'Futures and options, including currency and commodity. Taxed at slab; losses carry forward eight years.' },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Eyebrow>Financial year</Eyebrow>
        <Select
          value={data.financialYear}
          onChange={onYearChange}
          style={{ minWidth: 140 }}
          options={data.availableYears.map((year) => ({ value: year, label: year }))}
        />
        <Muted>
          {formatDate(data.from)} to {formatDate(data.to)}
        </Muted>
        <Button
          icon={<DownloadSimple size={15} weight="duotone" />}
          href={`${API_URL}/trading/exports/itr3?fy=${data.financialYear}&asOf=${asOf}`}
          target="_blank"
          rel="noreferrer"
        >
          ITR-3 helper (CSV)
        </Button>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <StatCard
            variant="hero"
            label="Business turnover"
            icon={<Scales size={16} weight="duotone" />}
            value={money(data.businessTurnover, currency)}
            hint="Absolute-profit method, speculative plus non-speculative"
          />
        </Col>
        <Col xs={12} md={8}>
          <StatCard
            label="Audit threshold"
            icon={<Warning size={17} weight="duotone" />}
            iconTone={data.audit.aboveThreshold ? 'warning' : 'info'}
            value={data.audit.aboveDigitalThreshold ? 'Above ₹10 crore' : data.audit.aboveThreshold ? 'Above ₹1 crore' : 'Below ₹1 crore'}
            hint={data.audit.presumptiveAvailable ? 'Presumptive taxation under 44AD is still available' : 'Above the 44AD limit'}
          />
        </Col>
        <Col xs={12} md={8}>
          <StatCard
            label="Charges claimable"
            value={money(data.chargesSummary.deductibleAgainstBusiness, currency)}
            hint={`of ${money(data.chargesSummary.total, currency)} paid; delivery charges belong to capital gains`}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {buckets.map((bucket) => (
          <Col xs={24} md={12} key={bucket.key}>
            <Panel height={250} title={bucket.label}>
              <Eyebrow>Net after charges</Eyebrow>
              <div>
                <Figure>
                  <Pnl $value={num(bucket.netPnl)}>{money(bucket.netPnl, currency)}</Pnl>
                </Figure>
              </div>
              <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
                <Descriptions.Item label="Positions">{bucket.trades}</Descriptions.Item>
                <Descriptions.Item label="Gross">{money(bucket.grossPnl, currency)}</Descriptions.Item>
                <Descriptions.Item label="Charges">{money(bucket.charges, currency)}</Descriptions.Item>
                <Descriptions.Item label="Turnover">{money(bucket.turnover, currency)}</Descriptions.Item>
              </Descriptions>
              <Muted>{bucket.note}</Muted>
            </Panel>
          </Col>
        ))}

        <Col span={24}>
          <Card title="Capital gains on delivery" extra={<Eyebrow>Estimated tax at the current rates</Eyebrow>}>
            <Table<TradingTaxSummary['capitalGains']['buckets'][number]>
              rowKey="term"
              dataSource={data.capitalGains.buckets}
              pagination={false}
              size="small"
              columns={[
                { key: 'term', title: 'Term', render: (_, row) => (row.term === 'SHORT' ? 'Short term (under 12 months)' : 'Long term (over 12 months)') },
                { key: 'trades', title: 'Positions', align: 'right', render: (_, row) => row.trades },
                { key: 'proceeds', title: 'Proceeds', align: 'right', render: (_, row) => money(row.proceeds, currency) },
                { key: 'cost', title: 'Cost', align: 'right', render: (_, row) => money(row.cost, currency) },
                { key: 'gain', title: 'Gain', align: 'right', render: (_, row) => <Pnl $value={num(row.gain)}>{money(row.gain, currency)}</Pnl> },
                { key: 'taxable', title: 'Taxable', align: 'right', render: (_, row) => money(row.taxable, currency) },
                { key: 'rate', title: 'Rate', align: 'right', render: (_, row) => `${row.ratePercent}%` },
                { key: 'tax', title: 'Estimated tax', align: 'right', render: (_, row) => money(row.estimatedTax, currency) },
              ]}
            />
            <Muted style={{ display: 'block', marginTop: 10 }}>
              {num(data.capitalGains.exemptionUsed) > 0
                ? `${money(data.capitalGains.exemptionUsed, currency)} of the section 112A exemption was used.`
                : 'None of the section 112A exemption was used this year.'}
            </Muted>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Charges summary">
            {CHARGE_LABELS.map(([key, label]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
                <span>{label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(data.chargesSummary[key] as string, currency)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 600 }}>
              <span>Total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(data.chargesSummary.total, currency)}</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Turnover, and why it is that number">
            <p style={{ marginTop: 0 }}>{data.audit.note}</p>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Speculative turnover">{money(data.speculative.turnover, currency)}</Descriptions.Item>
              <Descriptions.Item label="Non-speculative turnover">{money(data.nonSpeculative.turnover, currency)}</Descriptions.Item>
              <Descriptions.Item label="Option premium received on sales">{money(data.optionSellPremium, currency)}</Descriptions.Item>
            </Descriptions>
            <Muted>
              The 2022 revision of the ICAI guidance note leaves option sale premium out of turnover, so it is shown here separately rather than added in.
            </Muted>
          </Card>
        </Col>

        <Col span={24}>
          <Alert type="warning" showIcon message="A worksheet, not a filing" description={data.disclaimer} />
        </Col>
        <Col span={24}>
          <NotAdvice text="Arvo classifies your own imported trades using the ordinary reading of the rules. Your circumstances may differ, and your accountant has the final word." />
        </Col>
      </Row>
    </>
  );
}
