export const palette = {
  bg: '#0A0B0F',
  surface: '#111318',
  card: '#161B26',
  border: '#1E2535',
  accent: '#C9A84C',
  accentDim: '#9B7B2F',
  accentGlow: 'rgba(201,168,76,0.15)',
  text: '#E8E4D9',
  textMuted: '#7A8094',
  textDim: '#4A5068',
  green: '#3DD68C',
  blue: '#4A9EFF',
  purple: '#8B6FEE',
  red: '#F06A6A',
  teal: '#2EC4B6',
} as const;

export const fonts = {
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  display: "'Playfair Display', Georgia, serif",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;
