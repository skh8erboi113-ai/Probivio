import { forwardRef, type InputHTMLAttributes } from 'react';

import { fonts, palette, radii, spacing } from '../../theme';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
  readonly error?: string;
  readonly hint?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, style, ...rest },
  ref,
) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {label ? (
        <span
          style={{
            fontSize: 11,
            color: palette.textMuted,
            fontFamily: fonts.mono,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {label}
        </span>
      ) : null}

      <input
        {...rest}
        ref={ref}
        style={{
          background: palette.surface,
          border: `1px solid ${error ? palette.red : palette.border}`,
          borderRadius: radii.md,
          padding: '10px 14px',
          color: palette.text,
          fontFamily: fonts.sans,
          fontSize: 14,
          outline: 'none',
          ...style,
        }}
      />

      {error ? (
        <span style={{ fontSize: 11, color: palette.red, fontFamily: fonts.mono }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 11, color: palette.textDim, fontFamily: fonts.mono }}>{hint}</span>
      ) : null}
    </label>
  );
});
