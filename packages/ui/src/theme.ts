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
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    cssVar: { key: 'arvo' },
    hashed: false,
    token: {
      colorPrimary: c.brand,
      colorInfo: c.info,
      colorSuccess: c.success,
      colorWarning: c.warning,
      colorError: c.danger,
      colorLink: c.brand,
      colorBgLayout: c.bgCanvas,
      colorBgContainer: c.bgSurface,
      colorBgElevated: c.bgSurfaceRaised,
      colorBorder: c.border,
      colorBorderSecondary: c.borderSubtle,
      colorText: c.textPrimary,
      colorTextSecondary: c.textSecondary,
      colorTextTertiary: c.textMuted,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize.md,
      borderRadius: radii.md,
      borderRadiusSM: radii.sm,
      borderRadiusLG: radii.lg,
      boxShadow: shadows[mode].md,
      boxShadowSecondary: shadows[mode].sm,
      motionDurationMid: '0.2s',
    },
    components: {
      Layout: { headerBg: c.bgSurface, siderBg: c.bgSurface, bodyBg: c.bgCanvas },
      Card: { paddingLG: space[6] },
      Menu: {
        itemSelectedBg: c.brandSubtle,
        itemSelectedColor: c.brand,
        itemBg: 'transparent',
        itemBorderRadius: radii.md,
      },
      Statistic: { contentFontSize: typography.fontSize['2xl'] },
      Table: { headerBg: c.bgMuted, rowHoverBg: c.brandSubtle },
    },
  };
}
