import { theme as antdTheme, type ThemeConfig } from 'antd';
import { breakpoints, colors, motion, radii, shadows, space, typography, type ColorMode } from './tokens';

/** Theme object available to styled-components as `props.theme`. */
export interface ArvoTheme {
  mode: ColorMode;
  colors: (typeof colors)[ColorMode];
  space: typeof space;
  radii: typeof radii;
  typography: typeof typography;
  shadows: (typeof shadows)[ColorMode];
  breakpoints: typeof breakpoints;
  motion: typeof motion;
}

export function createStyledTheme(mode: ColorMode): ArvoTheme {
  return { mode, colors: colors[mode], space, radii, typography, shadows: shadows[mode], breakpoints, motion };
}

/** antd ThemeConfig derived from the same tokens. */
export function createAntdTheme(mode: ColorMode): ThemeConfig {
  const c = colors[mode];
  const s = shadows[mode];
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    cssVar: { key: 'arvo' },
    hashed: false,
    token: {
      colorPrimary: c.brand,
      colorPrimaryHover: c.brandHover,
      colorPrimaryActive: c.brandActive,
      colorInfo: c.info,
      colorSuccess: c.success,
      colorWarning: c.warning,
      colorError: c.danger,
      colorLink: c.brandText,
      colorLinkHover: c.brand,
      colorBgLayout: c.bgCanvas,
      colorBgContainer: c.bgSurface,
      colorBgElevated: c.bgSurfaceRaised,
      colorBorder: c.border,
      colorBorderSecondary: c.borderSubtle,
      colorSplit: c.borderSubtle,
      colorText: c.textPrimary,
      colorTextSecondary: c.textSecondary,
      colorTextTertiary: c.textMuted,
      colorTextDescription: c.textMuted,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize.md,
      fontWeightStrong: typography.fontWeight.semibold,
      borderRadius: radii.md,
      borderRadiusSM: radii.sm,
      borderRadiusLG: radii.lg,
      controlHeight: 38,
      controlHeightLG: 46,
      controlHeightSM: 30,
      boxShadow: s.md,
      boxShadowSecondary: s.lg,
      boxShadowTertiary: s.sm,
      motionDurationMid: '0.2s',
      wireframe: false,
    },
    components: {
      Layout: { headerBg: c.bgSurface, siderBg: c.bgSurface, bodyBg: c.bgCanvas, headerHeight: 64 },
      Button: {
        fontWeight: typography.fontWeight.semibold,
        primaryShadow: s.brand,
        defaultShadow: s.sm,
        dangerShadow: 'none',
        paddingInline: space[4] + 2,
        paddingInlineLG: space[6],
        borderRadius: radii.md,
        borderRadiusLG: radii.md,
        defaultBorderColor: c.border,
        defaultHoverBorderColor: c.brand,
        defaultHoverColor: c.brandText,
      },
      Card: {
        paddingLG: space[6],
        headerFontSize: typography.fontSize.lg,
        headerHeight: 60,
        boxShadowTertiary: s.md,
      },
      Menu: {
        itemSelectedBg: c.brandSubtle,
        itemSelectedColor: c.brandText,
        itemHoverBg: c.bgMuted,
        itemBg: 'transparent',
        itemBorderRadius: radii.md,
        itemHeight: 42,
        itemMarginInline: space[3],
        iconSize: 16,
      },
      Segmented: {
        itemSelectedBg: c.bgSurface,
        trackBg: c.bgMuted,
        itemColor: c.textSecondary,
        itemSelectedColor: c.brandText,
        borderRadius: radii.md,
      },
      Statistic: { contentFontSize: typography.fontSize['2xl'] },
      Table: {
        headerBg: c.bgMuted,
        headerColor: c.textSecondary,
        headerSplitColor: c.border,
        rowHoverBg: c.brandSubtle,
        borderColor: c.border,
        cellPaddingBlock: 14,
      },
      Tag: { defaultBg: c.bgMuted, defaultColor: c.textSecondary, borderRadiusSM: radii.pill },
      Input: { activeShadow: `0 0 0 3px ${c.brandSubtle}`, hoverBorderColor: c.brand },
      Select: { optionSelectedBg: c.brandSubtle, optionSelectedColor: c.brandText },
      Progress: { remainingColor: c.bgMuted },
      Alert: { borderRadiusLG: radii.lg },
      Modal: { borderRadiusLG: radii.xl },
      Steps: { dotSize: 10 },
    },
  };
}
