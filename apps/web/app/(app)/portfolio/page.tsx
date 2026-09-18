'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, DatePicker, Space, Tabs } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { AllocationView } from '../../../components/portfolio/allocation-view';
import { CapitalGainsView } from '../../../components/portfolio/capital-gains-view';
import { GoalsTab } from '../../../components/portfolio/goals-tab';
import { HoldingFormModal } from '../../../components/portfolio/holding-form-modal';
import { HoldingsTable } from '../../../components/portfolio/holdings-table';
import { PortfolioImportWizard } from '../../../components/portfolio/import-wizard';
import { PortfolioOverview } from '../../../components/portfolio/overview';
import { RebalanceTool } from '../../../components/portfolio/rebalance-tool';
import { PageHeader } from '../../../components/page-header';

/**
 * Everything you own, valued on one date. The date is the page's only global control: every
 * tab is computed for it, so a report can be re-read months later and still say the same thing.
 */
export default function PortfolioPage() {
  const [asOf, setAsOf] = useState<Dayjs>(dayjs());
  const [adding, setAdding] = useState(false);
  const day = asOf.format('YYYY-MM-DD');

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle="What you own, what it has returned, and what it would cost to change it. Analysis and simulation only — never a recommendation to trade."
        extra={
          <Space>
            <DatePicker value={asOf} onChange={(value) => setAsOf(value ?? dayjs())} allowClear={false} maxDate={dayjs()} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
              Add holding
            </Button>
          </Space>
        }
      />

      <Tabs
        destroyOnHidden
        items={[
          { key: 'overview', label: 'Overview', children: <PortfolioOverview asOf={day} /> },
          { key: 'holdings', label: 'Holdings', children: <HoldingsTable asOf={day} onAdd={() => setAdding(true)} /> },
          { key: 'allocation', label: 'Allocation & costs', children: <AllocationView asOf={day} /> },
          { key: 'rebalance', label: 'Rebalance', children: <RebalanceTool asOf={day} /> },
          { key: 'tax', label: 'Capital gains', children: <CapitalGainsView asOf={day} /> },
          { key: 'goals', label: 'Goals', children: <GoalsTab asOf={day} /> },
          { key: 'import', label: 'Import', children: <PortfolioImportWizard /> },
        ]}
      />

      <HoldingFormModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
