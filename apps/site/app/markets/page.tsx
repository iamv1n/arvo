import type { Metadata } from 'next';
import { MarketsPage } from '../../components/landing/markets-page';

export const metadata: Metadata = {
  title: 'Arvo Markets — portfolio, trading journal, strategy lab and alerts',
  description:
    'Markets is the investing half of Arvo: a portfolio from CAS and broker imports with XIRR, allocation and capital gains, a trading journal with the full Indian charges engine and ITR-3 export, an options payoff and backtesting lab, and alerts you write yourself. Educational, not investment advice.',
  alternates: { canonical: '/markets' },
};

export default function MarketsRoute() {
  return <MarketsPage />;
}
