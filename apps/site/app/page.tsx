import type { Metadata } from 'next';
import { LandingPage } from '../components/landing/landing-page';

export const metadata: Metadata = {
  title: 'Arvo — local-first, self-hosted personal finance',
  description:
    'Open-source personal finance OS you run yourself: statement imports, rules, deterministic analytics, loans and investments tracking, an MCP server and private AI.',
  alternates: { canonical: '/' },
};

export default function Index() {
  return <LandingPage />;
}
