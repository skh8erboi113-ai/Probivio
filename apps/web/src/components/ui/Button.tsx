import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { palette, radii } from '../../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

const sizeMap = {
  sm: { padding: '6px 12px', fontSize: 12 },
  md: { padding: '10px 18px', fontSize: 13 },
  lg: { padding: '14px 24px', fontSize: 14 },
} as const;

const variantColor = {
  primary: { bg: palette.accent, fg: palette.bg, border: palette.accent },
  secondary: { bg: palette.card, fg: palette.text, border: palette.border },
  danger: { bg: palette.red, fg: palette.bg, border: palette.red },
  ghost: { bg: 'transparent', fg: palette.textMuted, border: 'transparent' },
} as const;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: Props) {
  const v = variantColor[variant];
  const s = sizeMap[size];
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={{
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.border}`,
        borderRadius: radii.md,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: 'all 0.15s',
        letterSpacing: '0.02em',
        ...style,
      }}
    >
      {loading ? '…' : children}
    </button>
  );
}
