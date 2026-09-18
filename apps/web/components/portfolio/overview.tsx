'use client';

import { ChartPieSlice, Coins, TrendUp, Vault } from '@phosphor-icons/react';
import { Alert, Card, Col, Empty, Row, Skeleton, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import { DataTable, useTableColumns } from '../data-table';
import { Eyebrow, Stamp } from '../planning';
import { StatCard } from '../stat-card';
import { formatDate } from '../../lib/format';
import { usePortfolioReturns, usePortfolioSummary } from '../../lib/queries';
import type { HoldingSummary } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { AllocationDonut, AllocationLegend, ASSET_CLASS_LABELS, KIND_LABELS, NotAdvice, ReturnPercent } from './shared';

/** Net investments, value, return against the index, allocation and the biggest holdings. */
export function PortfolioOverview({ asOf }: { asOf?: string }) {
  const money = useMoney();
  const summary = usePortfolioSummary(asOf);
  const returns = usePortfolioReturns({ asOf });
  const data = summary.data;
  const benchmark = returns.data?.benchmark ?? null;

  const columns = useTableColumns<HoldingSummary>('portfolio-top-holdings', [
    {
      key: 'name',
      title: 'Holding',
      alwaysVisible: true,
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <Link href={`/portfolio/${row.id}`}>{row.name}</Link>
          <div>
            <Eyebrow>
              {KIND_LABELS[row.kind]} · {ASSET_CLASS_LABELS[row.assetClass]}
            </Eyebrow>
          </div>
        </div>
      ),
    },
    { key: 'value', title: 'Value', align: 'right', render: (_, row) => money(row.value, row.currency) },
    { key: 'share', title: 'Share', align: 'right', render: (_, row) => `${row.percentOfPortfolio}%` },
    { key: 'invested', title: 'Invested', align: 'right', render: (_, row) => money(row.invested, row.currency) },
    {
      key: 'gain',
      title: 'Gain',
      align: 'right',
      render: (_, row) => (
        <div>
          <div>{money(row.unrealisedGain, row.currency)}</div>
          <ReturnPercent value={row.absoluteReturnPercent} />
        </div>
      ),
    },
    {
      key: 'xirr',
      title: 'XIRR',
      align: 'right',
      render: (_, row) => (
        <Tooltip title="Money-weighted annual return on this holding's own cashflows">
          <span>
            <ReturnPercent value={row.xirrPercent} />
          </span>
        </Tooltip>
      ),
    },
  ]);

  if (summary.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }
  if (!data || data.holdingCount === 0) {
    return (
      <Card>
        <Empty
          style={{ padding: '32px 0' }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No holdings yet. Add one by hand, or import a CAS statement or a broker CSV."
        />
      </Card>
    );
  }

  const currency = data.currency;
  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <StatCard
            variant="hero"
            label="Current value"
            icon={<Vault size={16} weight="duotone" />}
            value={money(data.currentValue, currency)}
            hint={`${data.holdingCount} holding${data.holdingCount === 1 ? '' : 's'} · as of ${formatDate(data.asOf)}`}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="Net invested" icon={<Coins size={17} weight="duotone" />} value={money(data.netInvested, currency)} hint={`${money(data.totalInvested, currency)} put in`} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label="Gain"
            icon={<TrendUp size={17} weight="duotone" />}
            iconTone={Number(data.totalGain) < 0 ? 'negative' : 'positive'}
            tone={Number(data.totalGain) < 0 ? 'negative' : 'positive'}
            value={money(data.totalGain, currency)}
            hint={<ReturnPercent value={data.absoluteReturnPercent} />}
          />
        </Col>
        <Col xs={24} md={6}>
          <StatCard
            label="XIRR"
            icon={<ChartPieSlice size={17} weight="duotone" />}
            iconTone="info"
            value={<ReturnPercent value={data.xirrPercent} />}
            hint={
              benchmark
                ? `${benchmark.series}: ${benchmark.xirrPercent === null ? '—' : `${benchmark.xirrPercent.toFixed(2)}%`}`
                : 'Import an index CSV to compare'
            }
          />
        </Col>
      </Row>

      {data.stalePriceCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${data.stalePriceCount} holding${data.stalePriceCount === 1 ? '' : 's'} have no price`}
          description="Their value falls back to what you paid. Enter a price on the holding, or import an AMFI NAV file to price every fund with a scheme code."
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Where the money is" styles={{ body: { height: 300 } }}>
            <Row gutter={12} align="middle">
              <Col span={11}>
                <AllocationDonut data={data.byAssetClass} currency={currency} height={220} />
              </Col>
              <Col span={13}>
                <AllocationLegend data={data.byAssetClass} currency={currency} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            title="Against the index"
            styles={{ body: { height: 300, overflowY: 'auto' } }}
            extra={benchmark ? <Stamp $tone={(benchmark.differencePercent ?? 0) >= 0 ? 'positive' : 'warning'}>{benchmark.series}</Stamp> : null}
          >
            {benchmark ? (
              <>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  {benchmark.note}
                </Typography.Paragraph>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Eyebrow>Your portfolio</Eyebrow>
                    <div style={{ fontSize: 24, fontFamily: 'var(--font-serif), Georgia, serif' }}>{money(data.currentValue, currency)}</div>
                    <ReturnPercent value={data.xirrPercent} />
                  </Col>
                  <Col span={12}>
                    <Eyebrow>Same cashflows, in the index</Eyebrow>
                    <div style={{ fontSize: 24, fontFamily: 'var(--font-serif), Georgia, serif' }}>{money(benchmark.value, currency)}</div>
                    <ReturnPercent value={benchmark.xirrPercent} />
                  </Col>
                </Row>
                {benchmark.warnings.map((warning) => (
                  <Alert key={warning} type="warning" showIcon message={warning} style={{ marginTop: 12 }} />
                ))}
              </>
            ) : (
              <Empty
                style={{ padding: '32px 0' }}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Import a Nifty 50 or Nifty 500 TRI CSV under Import to see what the same SIPs would have done in the index."
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Largest holdings" style={{ marginTop: 16 }} extra={columns.settings}>
        <DataTable<HoldingSummary> rowKey="id" size="small" columns={columns.columns} dataSource={data.topHoldings} pagination={false} scroll={{ x: 720 }} />
      </Card>

      <NotAdvice text={data.disclaimer} style={{ marginTop: 16 }} />
    </>
  );
}
