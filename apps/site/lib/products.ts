import { workspaceAccents } from '@arvo/ui';
import type { ColorMode, ColorTokens } from '@arvo/ui';

/**
 * The product catalogue for the site. Arvo is one platform with several products in it, and this
 * array is the single source of truth: the nav, the home "products" section, the footer and the
 * sitemap are all generated from it.
 *
 * TO ADD A PRODUCT:
 *   1. Add an entry to `PRODUCTS` below (id, name, href, accent, art, copy, sections).
 *   2. If it needs its own colour, add an accent to `productAccents` (a partial token override per
 *      mode — mirror `workspaceAccents` in @arvo/ui so the site matches the app).
 *   3. If it needs a new home-page illustration, add one to the `art` registry in
 *      components/landing/products-section.tsx and reference it by key here.
 *   4. Create app/<href>/page.tsx and render `<ProductPage product={...}>` from
 *      components/landing/product-shell.tsx with that product's own hero and sections.
 * Nothing else needs touching — nav, footer, home section and sitemap pick it up automatically.
 */

/** Accent identifiers. Each maps to a partial token override layered over the active palette. */
export type AccentId = 'copper' | 'indigo';

export const productAccents: Record<AccentId, Record<ColorMode, Partial<ColorTokens>>> = {
  /** The Dusk default: Money keeps the palette's own copper. */
  copper: { light: {}, dark: {} },
  /** Markets: the same deep steel indigo the app's Markets workspace uses. */
  indigo: workspaceAccents.markets,
};

export interface ProductSection {
  id: string;
  label: string;
}

export interface Product {
  id: string;
  /** Display name, used in the nav, the card and the "Explore X" link. */
  name: string;
  /** Route for the product page. */
  href: string;
  accent: AccentId;
  /** Handwritten annotation on the home card. */
  tagline: string;
  /** One line describing what the product is for. */
  purpose: string;
  /** Serif headline on the home card. */
  title: string;
  /** Short paragraph on the home card. */
  blurb: string;
  /** Bullets on the home card. */
  highlights: string[];
  /** Key into the illustration registry in components/landing/products-section.tsx. */
  art: string;
  /** Sections on the product page; also used for its in-page links. */
  sections: ProductSection[];
}

export const PRODUCTS: Product[] = [
  {
    id: 'money',
    name: 'Money',
    href: '/money',
    accent: 'copper',
    tagline: 'everyday banking',
    purpose: 'Everyday banking, spending and planning.',
    title: 'Where the month went',
    blurb:
      'Import the statements your bank already gives you, review every row before it lands, and get spending, budgets and goals computed from the ledger — never estimated.',
    highlights: [
      'Statement imports with duplicate detection and a review step',
      'Rules-first categorisation, AI only for the leftovers',
      'Insights, budgets, goals and savings suggestions',
      'Planner, AI advisor, recurring charges and upload reminders',
    ],
    art: 'ledger',
    sections: [
      { id: 'how-it-works', label: 'How it works' },
      { id: 'features', label: 'Features' },
      { id: 'planning-tools', label: 'Planning' },
      { id: 'advisor', label: 'Advisor' },
    ],
  },
  {
    id: 'markets',
    name: 'Markets',
    href: '/markets',
    accent: 'indigo',
    tagline: 'investing & trading',
    purpose: 'Investing, trading and market research.',
    title: 'What the money is doing',
    blurb:
      'Portfolio, trading journal, strategy lab and alerts — all fed by your own imports, with Indian charges and taxes computed line by line. Analysis and record-keeping, not advice.',
    highlights: [
      'Portfolio from CAS and broker files: XIRR, allocation, capital gains, rebalancing',
      'Trading journal with the full Indian charges engine and behaviour flags',
      'Strategy lab: options payoff, Greeks, backtests, paper trading',
      'Watchlists, calendars, your own alert rules and cool-off guardrails',
    ],
    art: 'curve',
    sections: [
      { id: 'portfolio', label: 'Portfolio' },
      { id: 'journal', label: 'Trading journal' },
      { id: 'strategy-lab', label: 'Strategy lab' },
      { id: 'alerts', label: 'Markets & alerts' },
    ],
  },
];

export function getProduct(id: string): Product {
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}
