/**
 * Arvo design tokens — the single source of truth for visual decisions.
 * antd's theme and the styled-components theme are both derived from these,
 * so components from either system stay visually consistent.
 */

export type ColorMode = 'light' | 'dark';

const palette = {
  teal: { 50: '#eefbf8', 100: '#d5f5ee', 400: '#3cc3a8', 500: '#1ea88e', 600: '#128a75', 700: '#0f6e5f' },
  gray: {
    0: '#ffffff',
    50: '#f7f8f8',
    100: '#eef0f0',
    200: '#dfe3e3',
    300: '#c7cdcd',
    500: '#7b8585',
    600: '#5b6464',
    700: '#3d4444',
    800: '#262b2b',
    850: '#1c2020',
    900: '#141717',
    950: '#0c0e0e',
  },
  green: { 500: '#1f9d55', 400: '#3fbf73' },
  red: { 500: '#d64545', 400: '#ef6b6b' },
  amber: { 500: '#d99a1e', 400: '#f0b43c' },
  blue: { 500: '#3b7dd8', 400: '#6aa0ec' },
} as const;

export interface ColorTokens {
  brand: string;
  brandHover: string;
  brandSubtle: string;
  bgCanvas: string;
  bgSurface: string;
  bgSurfaceRaised: string;
  bgMuted: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Money semantics: inflow, outflow, neutral transfer. */
  income: string;
  expense: string;
  transfer: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export const colors: Record<ColorMode, ColorTokens> = {
  light: {
    brand: palette.teal[600],
    brandHover: palette.teal[500],
    brandSubtle: palette.teal[50],
    bgCanvas: palette.gray[50],
    bgSurface: palette.gray[0],
    bgSurfaceRaised: palette.gray[0],
    bgMuted: palette.gray[100],
    border: palette.gray[200],
    borderSubtle: palette.gray[100],
    textPrimary: palette.gray[900],
    textSecondary: palette.gray[600],
    textMuted: palette.gray[500],
    income: palette.green[500],
    expense: palette.red[500],
    transfer: palette.blue[500],
    success: palette.green[500],
    warning: palette.amber[500],
    danger: palette.red[500],
    info: palette.blue[500],
  },
  dark: {
    brand: palette.teal[400],
    brandHover: palette.teal[500],
    brandSubtle: '#12302a',
    bgCanvas: palette.gray[950],
    bgSurface: palette.gray[900],
    bgSurfaceRaised: palette.gray[850],
    bgMuted: palette.gray[800],
    border: palette.gray[700],
    borderSubtle: palette.gray[800],
    textPrimary: palette.gray[50],
    textSecondary: palette.gray[300],
    textMuted: palette.gray[500],
    income: palette.green[400],
    expense: palette.red[400],
    transfer: palette.blue[400],
    success: palette.green[400],
    warning: palette.amber[400],
    danger: palette.red[400],
    info: palette.blue[400],
  },
};

/** 4px spacing scale. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const radii = { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 } as const;

export const typography = {
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  /** Tabular figures keep columns of amounts aligned. */
  fontFamilyNumeric: "'Inter', ui-sans-serif, system-ui, sans-serif",
  fontFamilyMono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  fontSize: { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, '2xl': 24, '3xl': 30, '4xl': 38 },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.2, normal: 1.5 },
} as const;

export const shadows: Record<ColorMode, { sm: string; md: string }> = {
  light: { sm: '0 1px 2px rgba(20,23,23,0.06)', md: '0 4px 16px rgba(20,23,23,0.08)' },
  dark: { sm: '0 1px 2px rgba(0,0,0,0.4)', md: '0 4px 16px rgba(0,0,0,0.5)' },
};

export const breakpoints = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 } as const;

export const motion = { fast: '120ms', normal: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)' } as const;
