'use client';

import { Warning } from '@phosphor-icons/react';
import { Alert, Card, Col, Empty, Row, Skeleton, Table, Typography } from 'antd';
import { Eyebrow, SectionTitle } from '../planning';
import { StatCard } from '../stat-card';
import { usePortfolioAllocation, useFundOverlap } from '../../lib/queries';
import type { AllocationSlice } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { AllocationDonut, AllocationLegend, NotAdvice } from './shared';

function SliceCard({ title, data, currency, empty }: { title: string; data: AllocationSlice[]; currency: string; empty: string }) {
  return (
    <Card title={title} styles={{ body: { height: 300, overflowY: 'auto' } }}>
      {data.length === 0 ? (
        <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
      ) : (
        <Row gutter={12} align="middle">
          <Col span={11}>
            <AllocationDonut data={data} currency={currency} height={220} />
          </Col>
          <Col span={13}>
            <AllocationLegend data={data} currency={currency} />
          </Col>
        </Row>
      )}
    </Card>
  );
}

/** Allocation by every dimension the user recorded, concentration, cost drag and fund overlap. */
export function AllocationView({ asOf }: { asOf?: string }) {
  const money = useMoney();
  const allocation = usePortfolioAllocation(asOf);
  const overlap = useFundOverlap(asOf);
  const data = allocation.data;

  if (allocation.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }
  if (!data || data.holdings.length === 0) {
    return (
      <Card>
        <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Add or import holdings to see how they are split." />
      </Card>
    );
  }

  const currency = data.currency;
  const drag = data.costDrag;
  return (
    <>
      {data.concentration.warnings.map((warning) => (
        <Alert key={warning} type="warning" showIcon icon={<Warning size={18} weight="duotone" />} message={warning} style={{ marginBottom: 12 }} />
      ))}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <SliceCard title="By asset class" data={data.assetClass} currency={currency} empty="No holdings" />
        </Col>
        <Col xs={24} lg={12}>
          <SliceCard title="By market cap" data={data.marketCap} currency={currency} empty="Record a market cap on your equity funds to see this split." />
        </Col>
        <Col xs={24} lg={12}>
          <SliceCard title="By AMC or issuer" data={data.amc} currency={currency} empty="Record an AMC on your holdings to see issuer concentration." />
        </Col>
        <Col xs={24} lg={12}>
          <SliceCard title="By sector" data={data.sector} currency={currency} empty="Record a sector on your stocks to see this split." />
        </Col>
      </Row>

      <SectionTitle>
        What it costs you <small>Expense ratios you entered</small>
      </SectionTitle>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <StatCard label="Annual expense cost" value={money(drag.annualCost, currency)} hint={`${drag.rows.length} holding${drag.rows.length === 1 ? '' : 's'} priced`} />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label="Regular plans cost you"
            value={`${money(drag.regularPlanExtraCost, currency)}/yr`}
            tone={Number(drag.regularPlanExtraCost) > 0 ? 'negative' : undefined}
            hint="Versus the direct plan of the same scheme"
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard label="Missing an expense ratio" value={String(drag.missingExpenseRatio)} hint="Those funds are not in the total" />
        </Col>
      </Row>
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="holdingId"
          size="small"
          pagination={false}
          scroll={{ x: 640 }}
          dataSource={drag.rows}
          columns={[
            { key: 'name', title: 'Holding', dataIndex: 'holdingName' },
            { key: 'plan', title: 'Plan', render: (_, row) => (row.plan === 'REGULAR' ? 'Regular' : row.plan === 'DIRECT' ? 'Direct' : '—') },
            { key: 'ratio', title: 'Expense ratio', align: 'right', render: (_, row) => `${Number(row.expenseRatio)}%` },
            { key: 'value', title: 'Value', align: 'right', render: (_, row) => money(row.value, currency) },
            { key: 'cost', title: 'Annual cost', align: 'right', render: (_, row) => money(row.annualCost, currency) },
            {
              key: 'extra',
              title: 'Extra vs direct',
              align: 'right',
              render: (_, row) => (row.extraVersusDirect ? `${money(row.extraVersusDirect, currency)}/yr` : '—'),
            },
          ]}
        />
      </Card>
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
        {drag.note}
      </Typography.Paragraph>

      <SectionTitle>
        Fund overlap <small>From disclosures you imported</small>
      </SectionTitle>
      <Card styles={{ body: { minHeight: 160 } }}>
        {overlap.isPending ? (
          <Skeleton active />
        ) : (overlap.data?.pairs.length ?? 0) === 0 ? (
          <Empty
            style={{ padding: '24px 0' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Import two funds' monthly portfolio disclosure CSVs under Import to see how much they hold in common."
          />
        ) : (
          <Table
            rowKey={(row) => `${row.aHoldingId}-${row.bHoldingId}`}
            size="small"
            pagination={false}
            scroll={{ x: 640 }}
            dataSource={overlap.data?.pairs}
            expandable={{
              expandedRowRender: (row) => (
                <Table
                  rowKey="name"
                  size="small"
                  pagination={false}
                  dataSource={row.topCommon}
                  columns={[
                    { key: 'name', title: 'Stock', dataIndex: 'name' },
                    { key: 'a', title: row.aName, align: 'right', render: (_, stock) => `${stock.aWeight}%` },
                    { key: 'b', title: row.bName, align: 'right', render: (_, stock) => `${stock.bWeight}%` },
                  ]}
                />
              ),
            }}
            columns={[
              { key: 'a', title: 'Fund', dataIndex: 'aName' },
              { key: 'b', title: 'Compared with', dataIndex: 'bName' },
              { key: 'common', title: 'Stocks in common', align: 'right', dataIndex: 'commonCount' },
              { key: 'overlap', title: 'Overlap', align: 'right', render: (_, row) => `${row.overlapPercent}%` },
            ]}
          />
        )}
        {overlap.data && overlap.data.missingDisclosures.length > 0 && (
          <Eyebrow>
            No disclosure imported for {overlap.data.missingDisclosures.map((fund) => fund.name).join(', ')}
          </Eyebrow>
        )}
      </Card>

      <NotAdvice text={data.disclaimer} style={{ marginTop: 16 }} />
    </>
  );
}
