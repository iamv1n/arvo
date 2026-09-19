'use client';

import { Tabs } from 'antd';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '../../../components/page-header';
import { Alerts } from '../../../components/markets/alerts';
import { Calendar } from '../../../components/markets/calendar';
import { MarketsBanner } from '../../../components/markets/shared';
import { News } from '../../../components/markets/news';
import { Notifications } from '../../../components/markets/notifications';
import { Watchlists } from '../../../components/markets/watchlists';

/**
 * Markets & Alerts.
 *
 * Advice level 3: every rule on this page was written by the user. Arvo evaluates them and
 * reports what happened with the numbers it used; it never generates a signal, ranks an
 * instrument, or suggests a trade. The banner above the tabs says so on every tab, because a
 * watchlist with prices and a list of alerts is exactly the shape of a product that does.
 */
function MarketsTabs() {
  const params = useSearchParams();
  const tab = params.get('tab') ?? 'watchlists';
  const alertId = params.get('alert');

  return (
    <Tabs
      destroyOnHidden
      defaultActiveKey={tab}
      items={[
        { key: 'watchlists', label: 'Watchlists', children: <Watchlists /> },
        { key: 'calendar', label: 'Calendar', children: <Calendar /> },
        { key: 'alerts', label: 'Alerts', children: <Alerts focusId={alertId} /> },
        { key: 'notifications', label: 'Notifications', children: <Notifications /> },
        { key: 'news', label: 'News', children: <News /> },
      ]}
    />
  );
}

export default function MarketsPage() {
  return (
    <>
      <PageHeader
        title="Markets"
        subtitle="What you are watching, what is coming up, and the alerts you wrote. Prices are your own entries, imports and any provider you configured — never a guess."
      />
      <MarketsBanner />
      <Suspense fallback={null}>
        <MarketsTabs />
      </Suspense>
    </>
  );
}
