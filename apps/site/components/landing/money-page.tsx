'use client';

import { getProduct } from '../../lib/products';
import { AdvisorSection } from './advisor';
import { Features } from './features';
import { HowItWorks } from './how-it-works';
import { MoneyHero } from './money-hero';
import { PlanningToolsSection } from './planning-tools';
import { ProductPage } from './product-shell';

export function MoneyPage() {
  return (
    <ProductPage product={getProduct('money')} hero={<MoneyHero />}>
      <HowItWorks />
      <Features />
      <PlanningToolsSection />
      <AdvisorSection />
    </ProductPage>
  );
}
