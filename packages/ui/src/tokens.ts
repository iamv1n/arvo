/**
 * Arvo design tokens — the single source of truth for visual decisions.
 * antd's theme and the styled-components theme are both derived from these,
 * so components from either system stay visually consistent.
 *
 * Identity: a confident teal-green brand, emerald for money coming in, coral for money
 * going out, on a cool, bright canvas with elevated white surfaces.
 */

export type ColorMode = 'light' | 'dark';

const palette = {
  teal: {
    50: '#e8f7f3',
    100: '#cdeee5',
    200: '#9fdccb',
    400: '#2fc4a0',
    500: '#12a887',
    600: '#0b8f74',
    700: '#08735e',
    800: '#075c4c',
  },
  indigo: {
    50: '#f1f0ff',
    100: '#e4e2ff',
    200: '#cbc6ff',
    400: '#8b82ff',
    500: '#6c5cf6',
    600: '#5a45e8',
    700: '#4a36c9',
    800: '#3b2c9e',
  },
  violet: { 500: '#9b5cf6', 400: '#b384ff' },
  emerald: { 50: '#e7f8f1', 400: '#34d399', 500: '#12b76a', 600: '#079455', 700: '#067647' },
  coral: { 50: '#fff0ee', 400: '#ff7a6b', 500: '#f04438', 600: '#d92d20' },
  amber: { 50: '#fff8e6', 400: '#fdb022', 500: '#f79009', 600: '#dc6803' },
  sky: { 50: '#ebf5ff', 400: '#53b1fd', 500: '#2e90fa', 600: '#1570ef' },
  slate: {
    0: '#ffffff',
    25: '#fbfcfe',
    50: '#f4f6fb',
    100: '#eceff6',
    200: '#e0e4ee',
    300: '#cbd2e0',
    400: '#98a2b8',
    500: '#667085',
    600: '#475467',
    700: '#344054',
    800: '#1d2939',
    900: '#101828',
  },
  night: { 950: '#090b14', 900: '#0f1220', 850: '#151a2c', 800: '#1c2238', 700: '#2a3150', 600: '#3a4266' },
} as const;

export interface ColorTokens {
  brand: string;
  brandHover: string;
  brandActive: string;
  /** Tinted background for selected and highlighted brand elements. */
  brandSubtle: string;
  /** Brand color for text and icons on the canvas; meets WCAG AA for small text. */
  brandText: string;
  /** CSS gradient for hero cards and emphasis surfaces. */
  brandGradient: string;
  /** Text on top of brand or gradient surfaces. */
  onBrand: string;
  /** Solid "ink" emphasis surface (hero cards, stamps) and the text on it; stays dark in both modes. */
  inkSurface: string;
  onInk: string;
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
  incomeSubtle: string;
  expense: string;
  expenseSubtle: string;
  transfer: string;
  transferSubtle: string;
  success: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  info: string;
  /** Categorical series colors for charts, ordered for distinctness. */
  chart: string[];
}

export const colors: Record<ColorMode, ColorTokens> = {
  light: {
    brand: palette.teal[600],
    brandHover: palette.teal[500],
    brandActive: palette.teal[700],
    brandSubtle: palette.teal[50],
    brandText: palette.teal[700],
    brandGradient: `linear-gradient(135deg, ${palette.teal[700]} 0%, ${palette.teal[500]} 55%, #22b8c9 100%)`,
    onBrand: palette.slate[0],
    inkSurface: palette.slate[900],
    onInk: palette.slate[50],
    bgCanvas: palette.slate[50],
    bgSurface: palette.slate[0],
    bgSurfaceRaised: palette.slate[0],
    bgMuted: palette.slate[100],
    border: palette.slate[200],
    borderSubtle: palette.slate[100],
    textPrimary: palette.slate[900],
    textSecondary: palette.slate[600],
    textMuted: palette.slate[500],
    income: palette.emerald[600],
    incomeSubtle: palette.emerald[50],
    expense: palette.coral[600],
    expenseSubtle: palette.coral[50],
    transfer: palette.sky[600],
    transferSubtle: palette.sky[50],
    success: palette.emerald[600],
    warning: palette.amber[600],
    warningSubtle: palette.amber[50],
    danger: palette.coral[600],
    info: palette.sky[600],
    chart: [palette.teal[600], palette.indigo[500], palette.amber[500], palette.coral[500], palette.sky[500], palette.violet[500], '#ee46bc', '#15b79e', palette.slate[400]],
  },
  dark: {
    brand: palette.teal[400],
    brandHover: palette.teal[200],
    brandActive: palette.teal[500],
    brandSubtle: '#0d2b25',
    brandText: palette.teal[200],
    brandGradient: `linear-gradient(135deg, ${palette.teal[700]} 0%, ${palette.teal[500]} 55%, #1fa3b3 100%)`,
    onBrand: palette.slate[0],
    inkSurface: palette.night[800],
    onInk: palette.slate[50],
    bgCanvas: palette.night[950],
    bgSurface: palette.night[900],
    bgSurfaceRaised: palette.night[850],
    bgMuted: palette.night[800],
    border: palette.night[700],
    borderSubtle: palette.night[800],
    textPrimary: palette.slate[50],
    textSecondary: palette.slate[300],
    textMuted: palette.slate[400],
    income: palette.emerald[400],
    incomeSubtle: '#0f2e24',
    expense: palette.coral[400],
    expenseSubtle: '#3a1a18',
    transfer: palette.sky[400],
    transferSubtle: '#10263d',
    success: palette.emerald[400],
    warning: palette.amber[400],
    warningSubtle: '#33260c',
    danger: palette.coral[400],
    info: palette.sky[400],
    chart: [palette.teal[400], palette.indigo[400], palette.amber[400], palette.coral[400], palette.sky[400], palette.violet[400], '#f670c7', '#2ed3b7', palette.slate[400]],
  },
};

/** 4px spacing scale. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const radii = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const typography = {
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  /** Tabular figures keep columns of amounts aligned. */
  fontFamilyNumeric: "'Inter', ui-sans-serif, system-ui, sans-serif",
  /** Editorial display serif for titles and headline figures (loaded as --font-serif). */
  fontFamilySerif: "var(--font-serif), 'Iowan Old Style', Georgia, serif",
  /** Ledger monospace for amounts and statement details (loaded as --font-mono). */
  fontFamilyMono: "var(--font-mono), ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  fontSize: { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, '2xl': 26, '3xl': 32, '4xl': 40 },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.2, normal: 1.5 },
} as const;

export const shadows: Record<ColorMode, { sm: string; md: string; lg: string; brand: string }> = {
  light: {
    sm: '0 1px 2px rgba(16, 24, 40, 0.05)',
    md: '0 1px 2px rgba(16, 24, 40, 0.04), 0 6px 20px rgba(16, 24, 40, 0.06)',
    lg: '0 12px 32px rgba(16, 24, 40, 0.10)',
    brand: '0 6px 18px rgba(11, 143, 116, 0.28)',
  },
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.35)',
    lg: '0 16px 40px rgba(0, 0, 0, 0.5)',
    brand: '0 6px 20px rgba(47, 196, 160, 0.25)',
  },
};

export const breakpoints = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 } as const;

export const motion = { fast: '120ms', normal: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)' } as const;
