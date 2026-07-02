import { forwardRef, type SelectHTMLAttributes } from 'react';

import { fonts, palette, radii, spacing } from '../../theme';

interface Option {
  readonly value: string;
  readonly label: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label?: string;
  readonly options: readonly Option[];
  readonly error?: string;
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, options, error, style, ...rest },
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

      <select
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
          cursor: 'pointer',
          ...style,
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {error ? (
        <span style={{ fontSize: 11, color: palette.red, fontFamily: fonts.mono }}>{error}</span>
      ) : null}
    </label>
  );
});
