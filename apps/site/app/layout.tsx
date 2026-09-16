import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SITE_URL } from '../lib/config';
import { Providers } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Arvo — local-first, self-hosted personal finance',
  description:
    'Arvo is an open-source personal finance OS you run yourself: statement imports, rules-based categorization, analytics, an MCP server and private AI.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
