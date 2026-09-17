import type { Metadata } from 'next';
import { Caveat, Fraunces, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { SITE_URL } from '../lib/config';
import { Providers } from './providers';

/** Display serif for headings and the wordmark. */
const serif = Fraunces({ subsets: ['latin'], variable: '--font-serif', display: 'swap', axes: ['opsz', 'SOFT'] });
/** Monospace for statement and ledger details. */
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
/** Handwritten margin notes on the hero statement. */
const hand = Caveat({ subsets: ['latin'], variable: '--font-hand', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Arvo — local-first, self-hosted personal finance',
  description:
    'Arvo is an open-source personal finance OS you run yourself: statement imports, rules-based categorization, analytics, an MCP server and private AI.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} ${hand.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
