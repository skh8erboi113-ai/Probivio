import type { ReactNode } from 'react';

import { fonts, palette, radii } from '../../theme';

interface Props {
  readonly children: ReactNode;
  readonly color?: keyof typeof palette;
}

export function Badge({ children, color = 'accent' }: Props) {
  const c = palette[color];
  return (
    <span
      style={{
        background: `${c}22`,
        color: c,
        border: `1px solid ${c}44`,
        borderRadius: radii.sm,
        padding: '2px 8px',
        fontSize: 10,
        fontFamily: fonts.mono,
        letterSpacing: '0.05em',
        fontWeight: 600,
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}
