import { useMemo } from 'react';
import { ColorSchemeName, StyleSheet, TextStyle, useColorScheme, ViewStyle } from 'react-native';

import { ThemeModePreference, useWebPageStore } from './stores/useWebPageStore';

type ShadowToken = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOpacity' | 'shadowRadius' | 'shadowOffset' | 'elevation'
>;

interface ReaderTheme {
  background: string;
  text: string;
  link: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipPrimaryText: string;
  tooltipSecondaryText: string;
  tooltipShadow: string;
}

export interface Theme {
  mode: 'light' | 'dark';
  preference: ThemeModePreference;
  isDark: boolean;
  statusBar: 'light' | 'dark';
  colors: {
    background: string;
    backgroundElevated: string;
    backgroundCanvas: string;
    surface: string;
    surfaceMuted: string;
    surfaceAccent: string;
    surfaceAccentStrong: string;
    surfaceDanger: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    textInverse: string;
    textAccent: string;
    textDanger: string;
    border: string;
    borderMuted: string;
    borderStrong: string;
    borderAccent: string;
    accent: string;
    accentSoft: string;
    accentPressed: string;
    accentContrast: string;
    overlay: string;
    inputBackground: string;
    inputBorder: string;
    inputPlaceholder: string;
    disabled: string;
    disabledBorder: string;
  };
  spacing: {
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    full: number;
  };
  typography: {
    caption: TextStyle;
    body: TextStyle;
    bodyStrong: TextStyle;
    title: TextStyle;
    headline: TextStyle;
    monoCaps: TextStyle;
  };
  shadows: {
    sm: ShadowToken;
    md: ShadowToken;
    lg: ShadowToken;
    drawer: ShadowToken;
  };
  reader: ReaderTheme;
}

const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} satisfies Theme['spacing'];

const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 20,
  full: 999,
} satisfies Theme['radius'];

const typography = {
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  monoCaps: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} satisfies Theme['typography'];

const lightTheme: Theme = {
  mode: 'light',
  preference: 'light',
  isDark: false,
  statusBar: 'dark',
  colors: {
    background: '#f4efe6',
    backgroundElevated: '#fbf7f0',
    backgroundCanvas: '#f7f3ec',
    surface: '#fffbf4',
    surfaceMuted: '#efe4d5',
    surfaceAccent: '#fff2dd',
    surfaceAccentStrong: '#ead8bf',
    surfaceDanger: '#8c2f39',
    text: '#211b17',
    textMuted: '#5f5349',
    textSubtle: '#7c6d61',
    textInverse: '#fffaf2',
    textAccent: '#7a4f28',
    textDanger: '#fff8f8',
    border: '#dccfbf',
    borderMuted: '#e7dccd',
    borderStrong: '#cdbca8',
    borderAccent: '#8a5a2b',
    accent: '#7a4f28',
    accentSoft: '#f1e1c9',
    accentPressed: '#6a4522',
    accentContrast: '#fffbf4',
    overlay: 'rgba(28, 22, 18, 0.24)',
    inputBackground: '#f7f1e8',
    inputBorder: '#d9ccb9',
    inputPlaceholder: '#8b8178',
    disabled: '#e1d8cb',
    disabledBorder: '#e8dfd4',
  },
  spacing,
  radius,
  typography,
  shadows: {
    sm: {
      shadowColor: '#49311a',
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    md: {
      shadowColor: '#46311b',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    lg: {
      shadowColor: '#46311b',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    drawer: {
      shadowColor: '#1e1611',
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 8, height: 0 },
      elevation: 10,
    },
  },
  reader: {
    background: '#fffbf4',
    text: '#201b18',
    link: '#0a58ca',
    tooltipBackground: '#fff8f0',
    tooltipBorder: '#6b4836',
    tooltipPrimaryText: '#0d3b66',
    tooltipSecondaryText: '#0b5d1e',
    tooltipShadow: 'rgba(0, 0, 0, 0.18)',
  },
};

const darkTheme: Theme = {
  mode: 'dark',
  preference: 'dark',
  isDark: true,
  statusBar: 'light',
  colors: {
    background: '#171311',
    backgroundElevated: '#1e1916',
    backgroundCanvas: '#120f0d',
    surface: '#231d19',
    surfaceMuted: '#312821',
    surfaceAccent: '#3a2a1d',
    surfaceAccentStrong: '#4a3727',
    surfaceDanger: '#7b2c34',
    text: '#f2e8db',
    textMuted: '#d2c4b3',
    textSubtle: '#a89480',
    textInverse: '#110e0c',
    textAccent: '#f4c98f',
    textDanger: '#fff1f1',
    border: '#4a3c31',
    borderMuted: '#362d27',
    borderStrong: '#5d4b3d',
    borderAccent: '#f0bb73',
    accent: '#f0bb73',
    accentSoft: '#4a3727',
    accentPressed: '#dca75f',
    accentContrast: '#1a1410',
    overlay: 'rgba(0, 0, 0, 0.42)',
    inputBackground: '#201a16',
    inputBorder: '#4c3d32',
    inputPlaceholder: '#8f7e6e',
    disabled: '#2d2520',
    disabledBorder: '#3b312a',
  },
  spacing,
  radius,
  typography,
  shadows: {
    sm: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    md: {
      shadowColor: '#000000',
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    lg: {
      shadowColor: '#000000',
      shadowOpacity: 0.32,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    drawer: {
      shadowColor: '#000000',
      shadowOpacity: 0.38,
      shadowRadius: 18,
      shadowOffset: { width: 8, height: 0 },
      elevation: 10,
    },
  },
  reader: {
    background: '#161210',
    text: '#f0e6da',
    link: '#7bb0ff',
    tooltipBackground: '#251d18',
    tooltipBorder: '#c48a54',
    tooltipPrimaryText: '#9ec9ff',
    tooltipSecondaryText: '#a9e29a',
    tooltipShadow: 'rgba(0, 0, 0, 0.4)',
  },
};

export function getTheme(colorScheme?: ColorSchemeName): Theme {
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}

export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  const themeMode = useWebPageStore((s) => s.themeMode);
  const resolvedColorScheme = themeMode === 'system' ? colorScheme : themeMode;
  const theme = getTheme(resolvedColorScheme);

  return useMemo(
    () => ({
      ...theme,
      preference: themeMode,
    }),
    [theme, themeMode],
  );
}

export function useThemedStyles<T>(createStyles: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => createStyles(theme), [createStyles, theme]);
}

export const absoluteFill = StyleSheet.absoluteFillObject;
