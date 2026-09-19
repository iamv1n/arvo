'use client';

import { Tabs } from 'antd';
import { PageHeader } from '../../../../components/page-header';
import { BacktestTab } from '../../../../components/lab/backtest';
import { FuturesCalculator, SizingCalculator } from '../../../../components/lab/calculators';
import { StrategyLibrary } from '../../../../components/lab/library';
import { MarketDataWizard } from '../../../../components/lab/market-data';
import { PaperTrading } from '../../../../components/lab/paper-trading';
import { PayoffBuilder } from '../../../../components/lab/payoff-builder';
import { LabBanner } from '../../../../components/lab/shared';
import { LabNotesProvider } from '../../../../components/lab/notes-drawer';

/**
 * The Strategy Lab: payoffs, backtests and paper trading.
 *
 * Advice levels 1 and 2 — education and simulation. Nothing on this page is connected to a
 * market, nothing places an order, and every number is a model applied to inputs the user chose
 * or a replay of price data they uploaded. The banner says exactly that, above the tabs, on
 * every tab, because a payoff chart and a forecast look identical at a glance.
 */
export default function LabPage() {
  return (
    <>
      <LabBanner />

      <PageHeader
        title="Strategy lab"
        subtitle="Work out what a structure would pay, what a rule would have done, and how big a position your own risk budget allows. Nothing here is traded, and nothing here is advice."
      />

      <LabNotesProvider>
        <Tabs
          destroyOnHidden
          items={[
            { key: 'payoff', label: 'Payoff builder', children: <PayoffBuilder /> },
            { key: 'futures', label: 'Futures', children: <FuturesCalculator /> },
            { key: 'sizing', label: 'Position sizing', children: <SizingCalculator /> },
            { key: 'backtest', label: 'Backtest', children: <BacktestTab /> },
            { key: 'paper', label: 'Paper trading', children: <PaperTrading /> },
            { key: 'data', label: 'Market data', children: <MarketDataWizard /> },
            { key: 'library', label: 'Library', children: <StrategyLibrary /> },
          ]}
        />
      </LabNotesProvider>
    </>
  );
}
