import { forwardRef, useId, type SelectHTMLAttributes } from 'react';

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
  { label, options, error, style, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {label ? (
        <label
          htmlFor={selectId}
          style={{
            fontSize: 11,
            color: palette.textMuted,
            fontFamily: fonts.mono,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {label}
        </label>
      ) : null}

      <select
        {...rest}
        id={selectId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
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
        <span id={errorId} role="alert" style={{ fontSize: 11, color: palette.red, fontFamily: fonts.mono }}>
          {error}
        </span>
      ) : null}
    </div>
  );
});
