import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(__dirname, '../..'),
  poweredByHeader: false,
  transpilePackages: ['@arvo/ui'],
  // Tree-shake icon barrels so only used icons ship.
  experimental: { optimizePackageImports: ['@phosphor-icons/react', '@ant-design/icons'] },
  compiler: { styledComponents: true },
};

export default config;
