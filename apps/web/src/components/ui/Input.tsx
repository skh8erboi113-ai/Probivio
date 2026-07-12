import { forwardRef, useId, type InputHTMLAttributes } from 'react';

import { fonts, palette, radii, spacing } from '../../theme';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
  readonly error?: string;
  readonly hint?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, style, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = error || hint ? `${inputId}-message` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {label ? (
        <label
          htmlFor={inputId}
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

      <input
        {...rest}
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
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
        <span id={messageId} role="alert" style={{ fontSize: 11, color: palette.red, fontFamily: fonts.mono }}>
          {error}
        </span>
      ) : hint ? (
        <span id={messageId} style={{ fontSize: 11, color: palette.textDim, fontFamily: fonts.mono }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
