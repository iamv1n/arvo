import type { Metadata } from 'next';
import { MoneyPage } from '../../components/landing/money-page';

export const metadata: Metadata = {
  title: 'Arvo Money — everyday banking, imports, budgets and planning',
  description:
    'Money is the everyday banking half of Arvo: statement imports with review, rules-first categorisation, deterministic insights, budgets, goals, savings suggestions, planning tools and an AI advisor that only ever suggests.',
  alternates: { canonical: '/money' },
};

export default function MoneyRoute() {
  return <MoneyPage />;
}
