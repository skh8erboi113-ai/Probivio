import type { ReactNode } from 'react';

import { palette, radii, spacing } from '../../theme';

interface Props {
  readonly children: ReactNode;
  readonly accent?: keyof typeof palette;
  readonly padded?: boolean;
}

export function Card({ children, accent, padded = true }: Props) {
  return (
    <div
      style={{
        background: palette.card,
        border: `1px solid ${palette.border}`,
        borderRadius: radii.lg,
        padding: padded ? spacing.lg : 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {accent ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${palette[accent]}88, ${palette[accent]}00)`,
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
