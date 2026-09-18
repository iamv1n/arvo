'use client';

import { Bank, ChartPieSlice, Scales } from '@phosphor-icons/react';
import { Alert, Card, Col, Empty, Row, Skeleton, Table, Tooltip } from 'antd';
import { useRealityCheck } from '../../lib/queries';
import type { RealityCheckYear } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow } from '../planning';
import { StatCard } from '../stat-card';
import { Muted, NotAdvice, Pnl, num } from './shared';

/**
 * The comparison most active traders never sit down and do: what the year made, against what
 * the same capital would have done doing nothing. Presented flat, with the method on the page,
 * because the honest answer depends entirely on how "the same capital" is defined.
 */
export function RealityCheckView({ asOf }: { asOf: string }) {
  const money = useMoney();
  const query = useRealityCheck(asOf);
  const currency = 'INR';

  if (query.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }
  const data = query.data;
  if (!data || data.years.length === 0) {
    return (
      <Card>
        <Empty
          style={{ padding: '32px 0' }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Nothing to compare yet. This looks at closed F&O and intraday positions, year by year."
        />
      </Card>
    );
  }

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <StatCard
            variant="hero"
            label="Trading, all years"
            icon={<Scales size={16} weight="duotone" />}
            value={money(data.total.netPnl, currency)}
            hint="Realised, after every charge"
          />
        </Col>
        <Col xs={12} md={8}>
          <StatCard
            label="Index on the same capital"
            icon={<ChartPieSlice size={17} weight="duotone" />}
            iconTone="info"
            value={money(data.total.index, currency)}
            hint={<Pnl $value={num(data.total.differenceVsIndex)}>{`${money(data.total.differenceVsIndex, currency)} difference`}</Pnl>}
          />
        </Col>
        <Col xs={12} md={8}>
          <StatCard
            label="Fixed deposit on the same capital"
            icon={<Bank size={17} weight="duotone" />}
            iconTone="info"
            value={money(data.total.fd, currency)}
            hint={<Pnl $value={num(data.total.differenceVsFd)}>{`${money(data.total.differenceVsFd, currency)} difference`}</Pnl>}
          />
        </Col>
      </Row>

      <Card title="Year by year" extra={<Eyebrow>F&amp;O and intraday only</Eyebrow>}>
        <Table<RealityCheckYear>
          rowKey="financialYear"
          dataSource={data.years}
          pagination={false}
          size="small"
          columns={[
            { key: 'fy', title: 'Financial year', render: (_, row) => row.financialYear },
            { key: 'trades', title: 'Positions', align: 'right', render: (_, row) => row.trades },
            {
              key: 'capital',
              title: 'Capital (proxy)',
              align: 'right',
              render: (_, row) => (
                <Tooltip title="The largest amount you had committed on any single day of the year. It is a proxy, not the margin you funded.">
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(row.capitalProxy, currency)}</span>
                </Tooltip>
              ),
            },
            {
              key: 'net',
              title: 'Trading',
              align: 'right',
              render: (_, row) => (
                <div>
                  <Pnl $value={num(row.netPnl)}>{money(row.netPnl, currency)}</Pnl>
                  <div>
                    <Muted>{row.returnPercent === null ? '' : `${row.returnPercent}% on capital`}</Muted>
                  </div>
                </div>
              ),
            },
            {
              key: 'index',
              title: 'Index',
              align: 'right',
              render: (_, row) => (
                <div>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(row.index.value, currency)}</span>
                  <div>
                    <Muted>
                      {row.index.returnPercent}% · {row.index.source === 'SERIES' ? row.index.label : 'assumed'}
                    </Muted>
                  </div>
                </div>
              ),
            },
            {
              key: 'fd',
              title: 'Deposit',
              align: 'right',
              render: (_, row) => (
                <div>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(row.fd.value, currency)}</span>
                  <div>
                    <Muted>{row.fd.ratePercent}% assumed</Muted>
                  </div>
                </div>
              ),
            },
            {
              key: 'diff',
              title: 'vs index',
              align: 'right',
              render: (_, row) => <Pnl $value={num(row.differenceVsIndex)}>{money(row.differenceVsIndex, currency)}</Pnl>,
            },
          ]}
        />
      </Card>

      <Alert type="info" showIcon style={{ marginTop: 16 }} message="How this is worked out" description={data.method} />
      <NotAdvice text={data.disclaimer} style={{ marginTop: 16 }} />
    </>
  );
}
