import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { ApiClientError } from '../api/client';
import { useScoreExplanation } from '../hooks/useLeads';
import { fonts, palette, spacing } from '../theme';

const DIMENSION_LABELS: Record<string, string> = {
  deal: 'Deal',
  motivation: 'Motivation',
  urgency: 'Urgency',
};

interface Props {
  readonly leadId: string;
}

/**
 * Real "why this score" drill-down, tied to the retraining loop:
 *   1. A bar chart of the factor contributions (value × weight) that
 *      actually produced this lead's score — not a generic explanation.
 *   2. How the operator's model weights have drifted since a lookback
 *      window (default 30 days), e.g. "urgency now matters 12% more than
 *      30 days ago" — computed from real ScoringWeightsHistory snapshots,
 *      not simulated.
 */
export function ScoreDrillDownCard({ leadId }: Props) {
  const { data, isLoading, isError, error } = useScoreExplanation(leadId);

  if (isLoading) {
    return (
      <Card accent="teal">
        <SectionTitle>Why this score</SectionTitle>
        <div style={{ color: palette.textMuted, fontSize: 13 }} role="status">
          Loading…
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    const notFound = error instanceof ApiClientError && error.isNotFound;
    return (
      <Card accent="teal">
        <SectionTitle>Why this score</SectionTitle>
        <div style={{ color: palette.textMuted, fontSize: 13 }}>
          {notFound ? 'This lead has not been scored yet.' : 'Could not load score explanation.'}
        </div>
      </Card>
    );
  }

  const drillDown = data.data;
  const chartData = [...drillDown.score.topFactors]
    .map((f) => ({
      name: f.description || f.name,
      contribution: Math.round(f.value * f.weight * 100),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return (
    <Card accent="teal">
      <SectionTitle>Why this score</SectionTitle>

      {chartData.length === 0 ? (
        <div style={{ color: palette.textMuted, fontSize: 13 }}>No factor breakdown available for this score.</div>
      ) : (
        <div style={{ width: '100%', height: Math.max(120, chartData.length * 36) }} role="img" aria-label="Bar chart of score factor contributions">
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.border} horizontal={false} />
              <XAxis type="number" tick={{ fill: palette.textMuted, fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fill: palette.textMuted, fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: palette.surface, border: `1px solid ${palette.border}`, fontSize: 12 }}
                formatter={(value: number) => [`${value > 0 ? '+' : ''}${value} pts`, 'Contribution']}
              />
              <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.contribution >= 0 ? palette.green : palette.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTop: `1px solid ${palette.border}` }}>
        <div style={{ fontSize: 10, color: palette.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: spacing.sm }}>
          Model weight drift
        </div>

        {!drillDown.driftAvailable ? (
          <div style={{ color: palette.textMuted, fontSize: 12 }}>
            Not enough retraining history yet to show drift over time.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drillDown.weightDrift.map((d) => (
              <div key={d.dimension} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: palette.textMuted }}>{DIMENSION_LABELS[d.dimension] ?? d.dimension}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: fonts.mono, color: palette.text }}>
                    {Math.round(d.currentWeight * 100)}%
                  </span>
                  <Badge color={Math.abs(d.delta) < 0.005 ? 'textMuted' : d.delta > 0 ? 'green' : 'red'}>
                    {d.delta > 0 ? '+' : ''}
                    {Math.round(d.delta * 100)}pt
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function SectionTitle({ children }: { readonly children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 10,
        color: palette.accent,
        fontFamily: fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        marginBottom: spacing.md,
        marginTop: 0,
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  );
}
