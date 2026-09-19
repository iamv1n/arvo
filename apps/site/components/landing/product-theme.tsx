'use client';

import type { ReactNode } from 'react';
import { ThemeProvider, type DefaultTheme } from 'styled-components';
import { productAccents, type AccentId } from '../../lib/products';

/**
 * Re-tints everything inside with a product's accent — the same token overrides the app uses for
 * its workspaces — by layering them onto the active theme. Only theme tokens are touched, so light
 * and dark both stay correct and no component hardcodes a colour.
 */
export function ProductTheme({ accent, children }: { accent: AccentId; children: ReactNode }) {
  return (
    <ThemeProvider
      theme={(outer?: DefaultTheme) =>
        ({
          ...(outer as DefaultTheme),
          colors: { ...(outer as DefaultTheme).colors, ...productAccents[accent][(outer as DefaultTheme).mode] },
        }) as DefaultTheme
      }
    >
      {children}
    </ThemeProvider>
  );
}
