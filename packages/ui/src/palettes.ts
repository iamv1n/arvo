import type { ColorTokens } from './tokens';

/*
 * Light-theme palettes. Each swaps the canvas, ink and brand family while money semantics
 * (income, expense, transfer) stay recognisable. Dark mode always uses the default tokens.
 */

export type PaletteId = 'ledger' | 'dusk' | 'paper' | 'blueprint' | 'marigold' | 'rosewood' | 'sage';

export interface Palette {
  id: PaletteId;
  name: string;
  /** Three swatches for pickers: canvas, ink, brand. */
  swatch: [string, string, string];
  light: Partial<ColorTokens>;
}

const ink = (textPrimary: string, textSecondary: string, textMuted: string) => ({ textPrimary, textSecondary, textMuted });

export const palettes: Palette[] = [
  { id: 'ledger', name: 'Ledger', swatch: ['#f4f6fb', '#101828', '#0b8f74'], light: {} },
  {
    /* Marigold at a whisper: near-neutral canvas with a faint warm cast, a muted copper accent. */
    id: 'dusk',
    name: 'Dusk',
    swatch: ['#f6f5f1', '#161a2e', '#a4552a'],
    light: {
      brand: '#a4552a',
      brandHover: '#b8653a',
      brandActive: '#874522',
      brandSubtle: '#f5ebe3',
      brandText: '#874522',
      bgCanvas: '#f6f5f1',
      bgSurface: '#fefdfb',
      bgSurfaceRaised: '#ffffff',
      bgMuted: '#eeece6',
      border: '#e1ded6',
      borderSubtle: '#eceae4',
      ...ink('#161a2e', '#4b4f63', '#6f7285'),
      chart: ['#a4552a', '#3b5b92', '#c08a2b', '#2f7d62', '#b04a5a', '#6b5b95', '#3a8a91', '#8a7a64', '#a3a6b0'],
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    swatch: ['#f5efe3', '#231c14', '#2f6b4f'],
    light: {
      brand: '#2f6b4f',
      brandHover: '#3b8261',
      brandActive: '#25553f',
      brandSubtle: '#e3ecd9',
      brandText: '#25553f',
      bgCanvas: '#f5efe3',
      bgSurface: '#fffaf1',
      bgSurfaceRaised: '#fffdf8',
      bgMuted: '#ece3d2',
      border: '#ddd0b9',
      borderSubtle: '#ebe1cf',
      ...ink('#231c14', '#5b4f40', '#857763'),
      expense: '#b5412a',
      expenseSubtle: '#f6e2da',
      warning: '#b7791f',
      chart: ['#2f6b4f', '#b5412a', '#c99a2e', '#3f5f8a', '#8a5a44', '#6f7d3c', '#a8657a', '#4f8f8a', '#9a8f7c'],
    },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    swatch: ['#edf2fa', '#0b2545', '#1d4ed8'],
    light: {
      brand: '#1d4ed8',
      brandHover: '#2f63ec',
      brandActive: '#1a3fae',
      brandSubtle: '#dde7fb',
      brandText: '#1a3fae',
      bgCanvas: '#edf2fa',
      bgSurface: '#f8fbff',
      bgSurfaceRaised: '#ffffff',
      bgMuted: '#dfe8f5',
      border: '#c7d5ea',
      borderSubtle: '#dde6f3',
      ...ink('#0b2545', '#3d5575', '#6a7f9c'),
      transfer: '#7c3aed',
      transferSubtle: '#efe7fd',
      chart: ['#1d4ed8', '#f97316', '#0ea5a4', '#e11d48', '#7c3aed', '#ca8a04', '#0284c7', '#65a30d', '#94a3b8'],
    },
  },
  {
    id: 'marigold',
    name: 'Marigold',
    swatch: ['#fbf5e6', '#1b1f3b', '#c2410c'],
    light: {
      brand: '#c2410c',
      brandHover: '#dc5a1e',
      brandActive: '#9a3412',
      brandSubtle: '#fde8d4',
      brandText: '#9a3412',
      bgCanvas: '#fbf5e6',
      bgSurface: '#fffbf2',
      bgSurfaceRaised: '#ffffff',
      bgMuted: '#f4e9cf',
      border: '#e8d8b3',
      borderSubtle: '#f1e5c8',
      ...ink('#1b1f3b', '#4a4f6e', '#7a7d92'),
      income: '#15803d',
      expense: '#be123c',
      expenseSubtle: '#fbe3e8',
      transfer: '#1e40af',
      chart: ['#c2410c', '#1e40af', '#ca8a04', '#15803d', '#be123c', '#6d28d9', '#0f766e', '#a16207', '#9ca3af'],
    },
  },
  {
    id: 'rosewood',
    name: 'Rosewood',
    swatch: ['#faf0ee', '#2a1729', '#a3264f'],
    light: {
      brand: '#a3264f',
      brandHover: '#bd3a64',
      brandActive: '#861d40',
      brandSubtle: '#f7dfe6',
      brandText: '#861d40',
      bgCanvas: '#faf0ee',
      bgSurface: '#fffafa',
      bgSurfaceRaised: '#ffffff',
      bgMuted: '#f2e2df',
      border: '#e6cfcb',
      borderSubtle: '#efdfdc',
      ...ink('#2a1729', '#5e4a5c', '#8a7688'),
      income: '#2f7d5b',
      expense: '#c2410c',
      expenseSubtle: '#fbe6d9',
      chart: ['#a3264f', '#2f7d5b', '#d97706', '#4c51bf', '#c2410c', '#7e5a9b', '#2b8a9b', '#a8a29e', '#b48a78'],
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    swatch: ['#eef2ea', '#1c2a22', '#5b7a2e'],
    light: {
      brand: '#5b7a2e',
      brandHover: '#6e9238',
      brandActive: '#4a6425',
      brandSubtle: '#e2ebd3',
      brandText: '#4a6425',
      bgCanvas: '#eef2ea',
      bgSurface: '#f9fbf6',
      bgSurfaceRaised: '#ffffff',
      bgMuted: '#e2e9db',
      border: '#cdd8c3',
      borderSubtle: '#dfe7d7',
      ...ink('#1c2a22', '#4a5a4f', '#76857a'),
      expense: '#b4432f',
      transfer: '#3b6ea5',
      chart: ['#5b7a2e', '#b4432f', '#d4a017', '#3b6ea5', '#8e6c8a', '#2f8f83', '#c07a3a', '#6b7f99', '#a3a98f'],
    },
  },
];

export const DEFAULT_PALETTE: PaletteId = 'dusk';

export function isPaletteId(value: unknown): value is PaletteId {
  return palettes.some((p) => p.id === value);
}
