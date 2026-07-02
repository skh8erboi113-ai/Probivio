import { Card } from '../components/ui/Card';
import { useHotLeads } from '../hooks/useLeads';
import { fonts, palette, spacing } from '../theme';

export function DashboardPage() {
  const { data, isLoading } = useHotLeads();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.2em',
            color: palette.accent,
            fontFamily: fonts.mono,
            textTransform: 'uppercase',
          }}
        >
          Overview
        </div>
        <h1 style={{ fontFamily: fonts.display, fontSize: 32, margin: `${spacing.xs}px 0 0` }}>
          Command Center
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.md }}>
        <StatCard label="Hot leads" value={data?.data.length ?? 0} color="accent" />
        <StatCard label="Total tracked" value={data?.pagination.total ?? 0} color="blue" />
        <StatCard label="Avg score" value="—" color="green" />
        <StatCard label="Pipeline value" value="—" color="purple" />
      </div>

      <Card accent="accent">
        <h2 style={{ fontFamily: fonts.display, fontSize: 18, margin: 0, marginBottom: spacing.md }}>
          Hot leads
        </h2>
        {isLoading ? (
          <div style={{ color: palette.textMuted }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data?.data ?? []).map((lead) => (
              <div
                key={lead.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: spacing.md,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: `1px solid ${palette.border}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {lead.contact.firstName} {lead.contact.lastName}
                  </div>
                  <div style={{ fontSize: 11, color: palette.textMuted, fontFamily: fonts.mono }}>
                    {lead.property.address}, {lead.property.city} {lead.property.state}
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: palette.accent }}>
                  {lead.score ?? '—'}
                </div>
                <div style={{ fontSize: 11, color: palette.textDim, fontFamily: fonts.mono }}>
                  {lead.source}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly color: 'accent' | 'blue' | 'green' | 'purple';
}) {
  return (
    <Card accent={color}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.1em',
          color: palette.textMuted,
          textTransform: 'uppercase',
          fontFamily: fonts.mono,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          fontFamily: fonts.display,
          color: palette[color],
          marginTop: spacing.sm,
        }}
      >
        {value}
      </div>
    </Card>
  );
        }
