/**
 * Azm design tokens.
 *
 * Design thesis: Azm exists to reduce compulsive app use, so it must not behave
 * like the apps it fights. The palette is calm and grounded (cool paper + slate,
 * NOT the warm cream/terracotta that reads as generic), boldness is spent in one
 * place — a plain-language daily "read" — and every number is shown as quiet
 * monospace evidence rather than a glowing score. Behavioral language leads;
 * raw time is secondary.
 */

export const colors = {
  bg: '#F3F4F5', // cool soft paper
  surface: '#FFFFFF',
  surfaceSunken: '#ECEEEF',

  ink: '#20272E', // primary text — deep slate
  inkSoft: '#5A646C', // secondary
  inkFaint: '#8A939B', // captions / muted

  line: '#E2E5E7', // hairline borders

  accent: '#356B7D', // steady teal — "focus"
  accentSoft: '#E4EDF0',

  white: '#FFFFFF',
};

/** Muted, deliberately non-alarming risk tones. */
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

/**
 * Type roles. System sans for the interface voice; a monospace utility for data,
 * so numbers read as measured evidence — the visual echo of "facts, not scores".
 */
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