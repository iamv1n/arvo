import type { Metadata } from 'next';
import { LandingPage } from '../components/landing/landing-page';

export const metadata: Metadata = {
  title: 'Arvo — local-first, self-hosted personal finance and investing',
  description:
    'Open-source personal finance platform you run yourself. Money: statement imports, rules, deterministic analytics, budgets and planning. Markets: portfolio, trading journal, strategy lab and alerts. Plus an MCP server and private AI.',
  alternates: { canonical: '/' },
};

export default function Index() {
  return <LandingPage />;
}
