import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { useAutomations } from '../hooks/useAutomations';
import { fonts, palette, spacing } from '../theme';

export function AutomationsPage() {
  const { data, isLoading } = useAutomations();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div>
        <div style={{ fontSize: 11, color: palette.accent, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
          Engine
        </div>
        <h1 style={{ fontFamily: fonts.display, fontSize: 32, margin: `${spacing.xs}px 0 0` }}>
          Automations
        </h1>
      </div>

      <Card>
        {isLoading ? (
          <div style={{ color: palette.textMuted }}>Loading…</div>
        ) : (data?.data ?? []).length === 0 ? (
          <div style={{ color: palette.textMuted, fontSize: 13 }}>No automations configured yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {data?.data.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: spacing.md,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: palette.textMuted, fontFamily: fonts.mono, marginTop: 4 }}>
                    Trigger: {a.trigger} · Actions: {a.actions.length}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                  <Badge color={a.isActive ? 'green' : 'textMuted'}>{a.isActive ? 'Active' : 'Paused'}</Badge>
                  <div style={{ fontSize: 11, color: palette.textDim, fontFamily: fonts.mono }}>
                    {a.runCount} runs
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
