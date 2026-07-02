import { Link, useParams } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useToast } from '../context/ToastContext';
import { useMatchBuyers } from '../hooks/useBuyers';
import { useInteractions } from '../hooks/useInteractions';
import { useLead, useScoreLead } from '../hooks/useLeads';
import { fonts, palette, spacing } from '../theme';

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useLead(id);
  const { data: interactions } = useInteractions(id);
  const { data: matches } = useMatchBuyers(id);
  const scoreLead = useScoreLead();
  const { notify } = useToast();

  if (isLoading || !data) return <div style={{ color: palette.textMuted }}>Loading…</div>;
  const lead = data.data;

  async function handleRescore() {
    try {
      await scoreLead.mutateAsync(id!);
      notify('success', 'Rescored');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Score failed');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: palette.accent, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Lead detail
          </div>
          <h1 style={{ fontFamily: fonts.display, fontSize: 28, margin: `${spacing.xs}px 0 0` }}>
            {lead.contact.firstName} {lead.contact.lastName}
          </h1>
          <div style={{ marginTop: spacing.sm, display: 'flex', gap: spacing.sm }}>
            <Badge>{lead.status}</Badge>
            <Badge color="blue">{lead.source}</Badge>
            <Badge color={lead.motivation === 'urgent' ? 'red' : 'accent'}>{lead.motivation}</Badge>
          </div>
        </div>

        <div style={{ display: 'flex', gap: spacing.sm }}>
          <Button variant="secondary" onClick={handleRescore} loading={scoreLead.isPending}>
            Rescore
          </Button>
          <Link to={`/leads/${lead.id}/edit`}>
            <Button>Edit</Button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: spacing.lg }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          <Card accent="accent">
            <SectionTitle>Property</SectionTitle>
            <div style={{ fontFamily: fonts.mono, fontSize: 13 }}>
              {lead.property.address}
              <br />
              {lead.property.city}, {lead.property.state} {lead.property.zip}
            </div>
          </Card>

          <Card accent="blue">
            <SectionTitle>Deal metrics</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.md }}>
              <Metric label="Asking" value={lead.metrics.askingPrice ? `$${(lead.metrics.askingPrice / 100).toLocaleString()}` : '—'} />
              <Metric label="ARV" value={lead.metrics.arv ? `$${(lead.metrics.arv / 100).toLocaleString()}` : '—'} />
              <Metric label="Repairs" value={lead.metrics.repairEstimate !== undefined ? `$${(lead.metrics.repairEstimate / 100).toLocaleString()}` : '—'} />
            </div>
          </Card>

          <Card>
            <SectionTitle>Interaction history</SectionTitle>
            {(interactions?.data ?? []).length === 0 ? (
              <div style={{ color: palette.textMuted, fontSize: 13 }}>No interactions yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {interactions?.data.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${palette.border}`,
                      fontSize: 12,
                      fontFamily: fonts.mono,
                    }}
                  >
                    <div>{i.type}</div>
                    <Badge color={i.outcome === 'positive' ? 'green' : i.outcome === 'negative' ? 'red' : 'textMuted'}>
                      {i.outcome}
                    </Badge>
                    <div style={{ color: palette.textDim, marginLeft: 10 }}>
                      {new Date(i.occurredAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          <Card accent="accent">
            <SectionTitle>AI score</SectionTitle>
            <div style={{ fontSize: 48, fontWeight: 700, fontFamily: fonts.display, color: palette.accent }}>
              {lead.score ?? '—'}
            </div>
            {lead.scoreExplanation ? (
              <div style={{ fontSize: 13, color: palette.textMuted, marginTop: spacing.sm, lineHeight: 1.6 }}>
                {lead.scoreExplanation}
              </div>
            ) : null}
          </Card>

          <Card accent="green">
            <SectionTitle>Buyer matches</SectionTitle>
            {(matches?.data ?? []).length === 0 ? (
              <div style={{ color: palette.textMuted, fontSize: 13 }}>No matching buyers</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {matches?.data.map((m) => (
                  <div
                    key={m.buyer.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: `1px solid ${palette.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{m.buyer.firstName} {m.buyer.lastName}</span>
                      <span style={{ fontFamily: fonts.mono, color: palette.green }}>{m.matchScore}</span>
                    </div>
                    <div style={{ fontSize: 11, color: palette.textMuted, fontFamily: fonts.mono, marginTop: 4 }}>
                      {m.buyer.type} · {m.buyer.closingTimeline}d close
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: palette.accent,
        fontFamily: fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        marginBottom: spacing.md,
      }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: palette.textMuted, fontFamily: fonts.mono, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: fonts.display, marginTop: 4 }}>{value}</div>
    </div>
  );
}
