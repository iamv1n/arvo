'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, DatePicker, Select, Space, Tabs } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { CoolOffBanner } from '../../../../components/cool-off-banner';
import { PageHeader } from '../../../../components/page-header';
import { BehaviourView } from '../../../../components/trading/behaviour';
import { CostsView } from '../../../../components/trading/costs';
import { TradeImportWizard } from '../../../../components/trading/import-wizard';
import { TradingOverview } from '../../../../components/trading/overview';
import { PositionsTable } from '../../../../components/trading/positions-table';
import { RealityCheckView } from '../../../../components/trading/reality-check';
import { SEGMENT_LABELS } from '../../../../components/trading/shared';
import { TaxView } from '../../../../components/trading/tax-view';
import { TradeFormModal } from '../../../../components/trading/trade-form-modal';
import type { TradeFilters } from '../../../../lib/queries';

/**
 * Every trade you have made, grouped into round trips, with the P&L after every charge.
 *
 * The date and the segment filter are the page's only global controls: each tab is computed
 * for them, so a report can be re-opened later and still say the same thing. Level 0–1 —
 * analysis of your own fills and education, never a signal.
 */
export default function TradingPage() {
  const [asOf, setAsOf] = useState<Dayjs>(dayjs());
  const [segment, setSegment] = useState<string | undefined>();
  const [financialYear, setFinancialYear] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const day = asOf.format('YYYY-MM-DD');
  const filters: TradeFilters = { segment };

  return (
    <>
      <PageHeader
        title="Trading journal"
        subtitle="What your trades actually made once brokerage, STT, exchange charges, stamp duty and GST came out. Analysis and education only — never a recommendation to trade."
        extra={
          <Space wrap>
            <Select
              allowClear
              value={segment}
              onChange={setSegment}
              placeholder="All segments"
              style={{ minWidth: 170 }}
              options={Object.entries(SEGMENT_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <DatePicker value={asOf} onChange={(value) => setAsOf(value ?? dayjs())} allowClear={false} maxDate={dayjs()} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
              Record fill
            </Button>
          </Space>
        }
      />

      <CoolOffBanner showLink={false} />

      <Tabs
        destroyOnHidden
        items={[
          { key: 'overview', label: 'Overview', children: <TradingOverview asOf={day} filters={filters} /> },
          { key: 'positions', label: 'Positions', children: <PositionsTable asOf={day} filters={filters} /> },
          { key: 'behaviour', label: 'Behaviour', children: <BehaviourView asOf={day} filters={filters} /> },
          { key: 'costs', label: 'Costs', children: <CostsView asOf={day} filters={filters} /> },
          { key: 'reality', label: 'Reality check', children: <RealityCheckView asOf={day} /> },
          { key: 'tax', label: 'Tax', children: <TaxView asOf={day} financialYear={financialYear} onYearChange={setFinancialYear} /> },
          { key: 'import', label: 'Import', children: <TradeImportWizard /> },
        ]}
      />

      <TradeFormModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
