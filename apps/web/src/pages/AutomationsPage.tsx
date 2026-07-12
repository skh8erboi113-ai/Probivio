import { useState } from 'react';

import type { AgentDecisionLog } from '@probivio/types';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useToast } from '../context/ToastContext';
import {
  useAgentDecisions,
  useAgentSettings,
  useResolveAgentDecision,
  useUpdateAgentSettings,
} from '../hooks/useAgent';
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
          what it decided, why, what it considered and rejected, and whether it actually executed
          (guardrails and your autonomy threshold can hold an action back even when Gemini recommends it).
        </p>
      </div>

      <AutonomySettingsCard />

      <Card>
        {isLoading ? (
          <div style={{ color: palette.textMuted }} role="status">Loading…</div>
        ) : (data?.data ?? []).length === 0 ? (
          <div style={{ color: palette.textMuted, fontSize: 13 }}>No agent decisions logged yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {data?.data.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AutonomySettingsCard() {
  const { data, isLoading } = useAgentSettings();
  const updateSettings = useUpdateAgentSettings();
  const { notify } = useToast();
  const [localThreshold, setLocalThreshold] = useState<number | null>(null);

  if (isLoading || !data) {
    return (
      <Card accent="purple">
        <div style={{ color: palette.textMuted, fontSize: 13 }} role="status">Loading autonomy settings…</div>
      </Card>
    );
  }

  const settings = data.data;
  const thresholdPct = Math.round((localThreshold ?? settings.autonomyThreshold) * 100);

  async function commitThreshold(pct: number) {
    try {
      await updateSettings.mutateAsync({ autonomyThreshold: pct / 100 });
      notify('success', `Autonomy threshold set to ${pct}%`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update settings');
    }
  }

  async function toggleEmailApproval() {
    try {
      await updateSettings.mutateAsync({ requireApprovalForEmail: !settings.requireApprovalForEmail });
      notify('success', 'Email approval policy updated');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update settings');
    }
  }

  return (
    <Card accent="purple">
      <div style={{ fontSize: 10, color: palette.accent, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: spacing.sm }}>
        Confidence-gated autonomy
      </div>
      <p style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.6, marginBottom: spacing.md, maxWidth: 640 }}>
        Gemini acts autonomously above this confidence level. Below it, the action is drafted and shown
        here for a one-tap approval instead of running immediately — you stay in the loop on anything
        the model isn&apos;t sure about.
      </p>

      <label htmlFor="autonomy-threshold" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
        Autonomy threshold: <strong style={{ color: palette.accent }}>{thresholdPct}%</strong>
      </label>
      <input
        id="autonomy-threshold"
        type="range"
        min={5}
        max={100}
        step={5}
        value={thresholdPct}
        aria-valuemin={5}
        aria-valuemax={100}
        aria-valuenow={thresholdPct}
        aria-label="Autonomy confidence threshold percentage"
        onChange={(e) => setLocalThreshold(Number(e.target.value) / 100)}
        onMouseUp={(e) => commitThreshold(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commitThreshold(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commitThreshold(Number((e.target as HTMLInputElement).value))}
        style={{ width: '100%', maxWidth: 400 }}
        disabled={updateSettings.isPending}
      />

      <div style={{ marginTop: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <input
          id="require-email-approval"
          type="checkbox"
          checked={settings.requireApprovalForEmail}
          onChange={toggleEmailApproval}
          disabled={updateSettings.isPending}
        />
        <label htmlFor="require-email-approval" style={{ fontSize: 12 }}>
          Always require approval before Gemini sends an email, regardless of confidence
        </label>
      </div>
    </Card>
  );
}

function DecisionCard({ decision }: { readonly decision: AgentDecisionLog }) {
  const resolve = useResolveAgentDecision();
  const { notify } = useToast();

  async function handleResolve(approve: boolean) {
    try {
      await resolve.mutateAsync({ decisionId: decision.id, approve });
      notify('success', approve ? 'Action approved and executed' : 'Action rejected');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to resolve decision');
    }
  }

  return (
    <div
      style={{
        padding: spacing.md,
        border: `1px solid ${decision.pendingApproval ? palette.accent : palette.border}`,
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
          {decision.confidence !== undefined && (
            <Badge color={decision.confidence >= 0.75 ? 'green' : 'accent'}>
              {Math.round(decision.confidence * 100)}% confident
            </Badge>
          )}
          <Badge color={decision.pendingApproval ? 'accent' : decision.executed ? 'green' : 'red'}>
            {decision.pendingApproval ? 'Awaiting approval' : decision.executed ? 'Executed' : 'Blocked'}
          </Badge>
          <div style={{ fontSize: 11, color: palette.textDim, fontFamily: fonts.mono }}>{decision.trigger}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.5 }}>{decision.reasoning}</div>

      {decision.alternativesConsidered && decision.alternativesConsidered.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 10, color: palette.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Also considered
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {decision.alternativesConsidered.map((alt, idx) => (
              <li key={idx} style={{ fontSize: 11, color: palette.textMuted, lineHeight: 1.5 }}>
                <span style={{ fontFamily: fonts.mono, color: palette.textDim }}>
                  {ACTION_LABELS[alt.action] ?? alt.action}
                </span>{' '}
                — {alt.reasonRejected}
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.blockedReason ? (
        <div style={{ fontSize: 11, color: palette.red, fontFamily: fonts.mono }}>
          Blocked: {decision.blockedReason}
        </div>
      ) : null}

      {decision.pendingApproval && (
        <div style={{ display: 'flex', gap: spacing.sm, marginTop: 6 }}>
          <Button size="sm" onClick={() => handleResolve(true)} loading={resolve.isPending} aria-label="Approve this action">
            Approve &amp; run
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleResolve(false)}
            loading={resolve.isPending}
            aria-label="Reject this action"
          >
            Reject
          </Button>
        </div>
      )}

      <div style={{ fontSize: 10, color: palette.textDim, fontFamily: fonts.mono }}>
        Lead {decision.leadId} · {new Date(decision.createdAt).toLocaleString()}
      </div>
    </div>
  );
}
