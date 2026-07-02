import { useRealtime } from '../context/RealtimeContext';
import { fonts, palette } from '../theme';

/**
 * Small status dot for the sidebar showing WebSocket connection state.
 */
export function RealtimeIndicator() {
  const { status } = useRealtime();

  const color =
    status === 'connected'
      ? palette.green
      : status === 'connecting'
        ? palette.accent
        : status === 'error'
          ? palette.red
          : palette.textDim;

  const label =
    status === 'connected'
      ? 'Live'
      : status === 'connecting'
        ? 'Connecting'
        : status === 'error'
          ? 'Offline'
          : 'Idle';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: status === 'connected' ? `0 0 8px ${color}` : 'none',
          transition: 'all 0.2s',
        }}
      />
      <span
        style={{
          fontSize: 10,
          color,
          fontFamily: fonts.mono,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </span>
    </div>
  );
}
