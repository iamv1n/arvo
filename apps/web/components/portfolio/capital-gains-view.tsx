'use client';

import { Lock, Scales } from '@phosphor-icons/react';
import { Card, Col, Empty, Progress, Row, Skeleton, Table, Tabs, Typography } from 'antd';
import { formatDate } from '../../lib/format';
import { useCapitalGains } from '../../lib/queries';
import type { GainRow } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, SectionTitle, Stamp } from '../planning';
import { StatCard } from '../stat-card';
import { NotAdvice } from './shared';

/** Realised gains for the financial year, unrealised gains, exemption headroom and lock-ins. */
export function CapitalGainsView({ asOf }: { asOf?: string }) {
  const money = useMoney();
  const gains = useCapitalGains({ asOf });
  const data = gains.data;

  if (gains.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }
  if (!data) return null;

  const currency = data.currency;
  const exemption = Number(data.config.ltcgExemption);
  const used = Math.max(0, exemption - Number(data.harvestHeadroom));
  const usedPercent = exemption === 0 ? 0 : Math.round((used / exemption) * 100);

  const gainColumns = (realised: boolean) => [
    { key: 'name', title: 'Holding', dataIndex: 'holdingName' },
    { key: 'buy', title: 'Bought', render: (_: unknown, row: GainRow) => formatDate(row.buyDate) },
    ...(realised ? [{ key: 'sell', title: 'Sold', render: (_: unknown, row: GainRow) => (row.sellDate ? formatDate(row.sellDate) : '—') }] : []),
    { key: 'units', title: 'Units', align: 'right' as const, render: (_: unknown, row: GainRow) => Number(row.units).toLocaleString('en-IN', { maximumFractionDigits: 3 }) },
    { key: 'cost', title: 'Cost', align: 'right' as const, render: (_: unknown, row: GainRow) => money(row.cost, currency) },
    { key: 'value', title: realised ? 'Proceeds' : 'Value', align: 'right' as const, render: (_: unknown, row: GainRow) => money(row.value, currency) },
    { key: 'gain', title: 'Gain', align: 'right' as const, render: (_: unknown, row: GainRow) => money(row.gain, currency) },
    {
      key: 'term',
      title: 'Term',
      render: (_: unknown, row: GainRow) => (
        <div>
          <Stamp $tone={row.term === 'LONG' ? 'positive' : 'warning'}>{row.term === 'LONG' ? 'Long term' : 'Short term'}</Stamp>
          {row.term === 'SHORT' && row.daysToLongTerm > 0 && <div><Eyebrow>{row.daysToLongTerm} days to go</Eyebrow></div>}
        </div>
      ),
    },
  ];

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <StatCard
            variant="hero"
            label={`Realised, FY ${data.financialYear}`}
            icon={<Scales size={16} weight="duotone" />}
            value={money(Number(data.realised.shortTerm) + Number(data.realised.longTerm), currency)}
            hint={`${money(data.realised.longTerm, currency)} long term · ${money(data.realised.shortTerm, currency)} short term`}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="Estimated tax" value={money(data.realised.estimatedTax, currency)} hint={`${data.config.ltcgRatePercent}% LTCG, ${data.config.stcgRatePercent}% STCG`} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label="Unrealised"
            value={money(Number(data.unrealised.shortTerm) + Number(data.unrealised.longTerm), currency)}
            tone={Number(data.unrealised.shortTerm) + Number(data.unrealised.longTerm) < 0 ? 'negative' : 'positive'}
            hint={`${money(data.unrealised.longTerm, currency)} long term`}
          />
        </Col>
        <Col xs={24} md={6}>
          <Card style={{ height: '100%' }}>
            <Typography.Text type="secondary" style={{ fontWeight: 500 }}>
              Exemption headroom
            </Typography.Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <Progress type="circle" size={64} percent={usedPercent} format={(p) => `${p}%`} />
              <div>
                <div style={{ fontSize: 20, fontFamily: 'var(--font-serif), Georgia, serif' }}>{money(data.harvestHeadroom, currency)}</div>
                <Eyebrow>left of {money(data.config.ltcgExemption, currency)}</Eyebrow>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'realised',
            label: `Realised this year (${data.realised.rows.length})`,
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                {data.realised.rows.length === 0 ? (
                  <Empty style={{ padding: '48px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing sold in this financial year." />
                ) : (
                  <Table rowKey={(row) => `${row.holdingId}-${row.buyDate}-${row.sellDate}`} size="small" pagination={false} scroll={{ x: 800 }} dataSource={data.realised.rows} columns={gainColumns(true)} />
                )}
              </Card>
            ),
          },
          {
            key: 'unrealised',
            label: `Unrealised (${data.unrealised.rows.length})`,
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                {data.unrealised.rows.length === 0 ? (
                  <Empty style={{ padding: '48px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="No open lots yet." />
                ) : (
                  <Table rowKey={(row) => `${row.holdingId}-${row.buyDate}`} size="small" pagination={false} scroll={{ x: 760 }} dataSource={data.unrealised.rows} columns={gainColumns(false)} />
                )}
              </Card>
            ),
          },
          {
            key: 'harvest',
            label: `Harvesting room (${data.harvestSuggestions.length})`,
            children: (
              <Card>
                {data.harvestSuggestions.length === 0 ? (
                  <Empty
                    style={{ padding: '32px 0' }}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No long-term equity lots sitting on a gain, or the year's exemption is already used up."
                  />
                ) : (
                  <Table
                    rowKey={(row) => `${row.holdingId}-${row.buyDate}`}
                    size="small"
                    pagination={false}
                    scroll={{ x: 640 }}
                    dataSource={data.harvestSuggestions}
                    columns={[
                      { key: 'name', title: 'Holding', dataIndex: 'holdingName' },
                      { key: 'buy', title: 'Bought', render: (_, row) => formatDate(row.buyDate) },
                      { key: 'units', title: 'Units', align: 'right', render: (_, row) => Number(row.units).toLocaleString('en-IN', { maximumFractionDigits: 3 }) },
                      { key: 'gain', title: 'Gain inside the exemption', align: 'right', render: (_, row) => money(row.gain, currency) },
                      { key: 'warnings', title: 'Watch out for', render: (_, row) => (row.warnings.length === 0 ? '—' : row.warnings.join('; ')) },
                    ]}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      <SectionTitle>
        Lock-ins <small>
          <Lock size={12} weight="duotone" style={{ verticalAlign: -1, marginRight: 4 }} />
          ELSS and anything else you flagged
        </small>
      </SectionTitle>
      <Card styles={{ body: { padding: data.lockIns.length === 0 ? undefined : 0 } }}>
        {data.lockIns.length === 0 ? (
          <Empty style={{ padding: '24px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing is locked in." />
        ) : (
          <Table
            rowKey={(row) => `${row.holdingId}-${row.buyDate}`}
            size="small"
            pagination={false}
            scroll={{ x: 600 }}
            dataSource={data.lockIns}
            columns={[
              { key: 'name', title: 'Holding', dataIndex: 'holdingName' },
              { key: 'buy', title: 'Bought', render: (_, row) => formatDate(row.buyDate) },
              { key: 'unlocks', title: 'Unlocks', render: (_, row) => formatDate(row.unlocksOn) },
              { key: 'days', title: 'Days left', align: 'right', dataIndex: 'daysLeft' },
              { key: 'value', title: 'Value', align: 'right', render: (_, row) => money(row.value, currency) },
            ]}
          />
        )}
      </Card>

      <NotAdvice text={data.disclaimer} style={{ marginTop: 16 }} />
    </>
  );
}
