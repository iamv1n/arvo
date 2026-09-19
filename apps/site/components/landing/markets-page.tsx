'use client';

import { getProduct } from '../../lib/products';
import { MarketsHero } from './markets-hero';
import { AlertsSection, JournalSection, PortfolioSection, StrategyLabSection } from './markets-sections';
import { ProductPage } from './product-shell';

export function MarketsPage() {
  return (
    <ProductPage product={getProduct('markets')} hero={<MarketsHero />}>
      <PortfolioSection />
      <JournalSection />
      <StrategyLabSection />
      <AlertsSection />
    </ProductPage>
  );
}
