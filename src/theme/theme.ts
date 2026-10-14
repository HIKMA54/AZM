export const colors = {
  bg: '#F3F4F5',
  surface: '#FFFFFF',
  surfaceSunken: '#ECEEEF',

  ink: '#20272E',
  inkSoft: '#5A646C',
  inkFaint: '#8A939B',

  line: '#E2E5E7',

  accent: '#2E6B5C',
  accentSoft: '#E3F0E9',

  white: '#FFFFFF',
};

export const risk = {
  low: { fg: '#3F7A5E', bg: '#E6F0EA', label: 'steady' },
  medium: { fg: '#9A7326', bg: '#F3EBD9', label: 'a little high' },
  high: { fg: '#9E5750', bg: '#F1E3E1', label: 'heavy' },
} as const;

export type RiskKey = keyof typeof risk;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};

export const type = {
  display: { fontSize: 27, lineHeight: 34, fontWeight: '600' as const, color: colors.ink },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const, color: colors.ink },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const, color: colors.inkSoft },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const, color: colors.inkSoft },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, color: colors.inkFaint },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    letterSpacing: 1.2,
    color: colors.inkFaint,
  },
  data: {
    fontFamily: 'monospace',
    fontSize: 24,
    color: colors.ink,
  },
};