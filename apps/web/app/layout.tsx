import type { Metadata } from 'next';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

/** Same type system as the landing site: serif display, mono ledger figures, Inter for UI. */
const serif = Fraunces({ subsets: ['latin'], variable: '--font-serif', display: 'swap', axes: ['opsz', 'SOFT'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Arvo',
  description: 'Local-first personal finance',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
