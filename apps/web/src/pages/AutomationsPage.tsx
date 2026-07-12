import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { useAgentDecisions } from '../hooks/useAgent';
import { fonts, palette, spacing } from '../theme';

const ACTION_LABELS: Record<string, string> = {
  send_email: 'Sent email',
  add_tag: 'Added tag',
  remove_tag: 'Removed tag',
  change_status: 'Changed status',
  schedule_follow_up: 'Scheduled follow-up',
  no_action: 'No action taken',
};

export function AutomationsPage() {
  const { data, isLoading } = useAgentDecisions({ limit: 50 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div>
        <div style={{ fontSize: 11, color: palette.accent, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
          Engine
        </div>
        <h1 style={{ fontFamily: fonts.display, fontSize: 32, margin: `${spacing.xs}px 0 0` }}>
          Gemini Agent
        </h1>
        <p style={{ color: palette.textMuted, fontSize: 13, marginTop: spacing.xs, maxWidth: 640 }}>
          Every automated decision is made by Gemini, not fixed rules. This is the full audit trail —
          what it decided, why, and whether it actually executed (guardrails can block an action even
          when Gemini recommends it).
        </p>
      </div>

      <Card>
        {isLoading ? (
          <div style={{ color: palette.textMuted }}>Loading…</div>
        ) : (data?.data ?? []).length === 0 ? (
          <div style={{ color: palette.textMuted, fontSize: 13 }}>No agent decisions logged yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {data?.data.map((decision) => (
              <div
                key={decision.id}
                style={{
                  padding: spacing.md,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {ACTION_LABELS[decision.action.type] ?? decision.action.type}
                  </div>
                  <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                    <Badge color={decision.executed ? 'green' : 'red'}>
                      {decision.executed ? 'Executed' : 'Blocked'}
                    </Badge>
                    <div style={{ fontSize: 11, color: palette.textDim, fontFamily: fonts.mono }}>
                      {decision.trigger}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.5 }}>
                  {decision.reasoning}
                </div>
                {decision.blockedReason ? (
                  <div style={{ fontSize: 11, color: palette.red, fontFamily: fonts.mono }}>
                    Blocked: {decision.blockedReason}
                  </div>
                ) : null}
                <div style={{ fontSize: 10, color: palette.textDim, fontFamily: fonts.mono }}>
                  Lead {decision.leadId} · {new Date(decision.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
