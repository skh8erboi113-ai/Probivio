import { Link } from 'react-router-dom';
import { useState } from 'react';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useDeleteLead, useLeads } from '../hooks/useLeads';
import { useToast } from '../context/ToastContext';
import { fonts, palette, spacing } from '../theme';

export function LeadsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useLeads({ page, limit: 25 });
  const deleteLead = useDeleteLead();
  const { notify } = useToast();

  async function handleDelete(id: string) {
    if (!confirm('Delete this lead?')) return;
    try {
      await deleteLead.mutateAsync(id);
      notify('success', 'Lead deleted');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
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
            CRM
          </div>
          <h1 style={{ fontFamily: fonts.display, fontSize: 32, margin: `${spacing.xs}px 0 0` }}>
            Leads
          </h1>
        </div>
        <Link to="/leads/new">
          <Button>+ New Lead</Button>
        </Link>
      </div>

      <Card>
        {isLoading ? (
          <div style={{ color: palette.textMuted }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${palette.border}` }}>
                <Th>Contact</Th>
                <Th>Property</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th>Score</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((lead) => (
                <tr key={lead.id} style={{ borderBottom: `1px solid ${palette.border}44` }}>
                  <Td>
                    <Link
                      to={`/leads/${lead.id}`}
                      style={{ color: palette.text, textDecoration: 'none' }}
                    >
                      {lead.contact.firstName} {lead.contact.lastName}
                    </Link>
                  </Td>
                  <Td>
                    <div style={{ fontFamily: fonts.mono, fontSize: 12 }}>
                      {lead.property.address}, {lead.property.city} {lead.property.state}
                    </div>
                  </Td>
                  <Td>
                    <Badge color={statusColor(lead.status)}>{lead.status}</Badge>
                  </Td>
                  <Td>
                    <span style={{ fontSize: 11, color: palette.textMuted, fontFamily: fonts.mono }}>
                      {lead.source}
                    </span>
                  </Td>
                  <Td>
                    <div
                      style={{
                        fontFamily: fonts.mono,
                        fontWeight: 700,
                        color:
                          (lead.score ?? 0) >= 70
                            ? palette.green
                            : (lead.score ?? 0) >= 40
                              ? palette.accent
                              : palette.textMuted,
                      }}
                    >
                      {lead.score ?? '—'}
                    </div>
                  </Td>
                  <Td>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(lead.id)}>
                      Delete
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: spacing.md,
            }}
          >
            <div style={{ fontSize: 11, color: palette.textMuted, fontFamily: fonts.mono }}>
              {data.data.length} of {data.pagination.total}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!data.pagination.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({ children }: { readonly children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 8px',
        fontSize: 10,
        color: palette.textMuted,
        fontFamily: fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { readonly children: React.ReactNode }) {
  return <td style={{ padding: '12px 8px' }}>{children}</td>;
}

function statusColor(status: string): 'accent' | 'blue' | 'green' | 'red' | 'textMuted' {
  if (status === 'closed_won') return 'green';
  if (status === 'closed_lost' || status === 'dead') return 'red';
  if (status === 'under_contract') return 'accent';
  if (status === 'qualified' || status === 'contacted') return 'blue';
  return 'textMuted';
      }
