import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(__dirname, '../..'),
  poweredByHeader: false,
  transpilePackages: ['@arvo/ui'],
  compiler: { styledComponents: true },
};

export default config;
