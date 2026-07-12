import { Link } from 'react-router-dom';

import type { Buyer } from '@probivio/types';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useBuyers, useDeleteBuyer, useUpdateBuyer } from '../hooks/useBuyers';
import { useToast } from '../context/ToastContext';
import { fonts, palette, spacing } from '../theme';

export function BuyersPage() {
  const { data, isLoading } = useBuyers({ limit: 50 });
  const deleteBuyer = useDeleteBuyer();
  const { notify } = useToast();

  async function handleDelete(id: string) {
    if (!confirm('Delete this buyer?')) return;
    try {
      await deleteBuyer.mutateAsync(id);
      notify('success', 'Buyer deleted');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: palette.accent, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Rolodex
          </div>
          <h1 style={{ fontFamily: fonts.display, fontSize: 32, margin: `${spacing.xs}px 0 0` }}>
            Cash Buyers
          </h1>
          <p style={{ color: palette.textMuted, fontSize: 13, marginTop: spacing.xs, maxWidth: 640 }}>
            Buyers with match notifications on get emailed automatically the moment a new lead clears
            their buy-box and score threshold — no need to check back manually.
          </p>
        </div>
        <Link to="/buyers/new">
          <Button>+ New Buyer</Button>
        </Link>
      </div>

      <Card>
        {isLoading ? (
          <div style={{ color: palette.textMuted }} role="status">Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing.md }}>
            {(data?.data ?? []).map((buyer) => (
              <BuyerCard key={buyer.id} buyer={buyer} onDelete={() => handleDelete(buyer.id)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BuyerCard({ buyer, onDelete }: { readonly buyer: Buyer; readonly onDelete: () => void }) {
  const updateBuyer = useUpdateBuyer();
  const { notify } = useToast();

  async function toggleNotify() {
    try {
      await updateBuyer.mutateAsync({ id: buyer.id, input: { notifyOnMatch: !buyer.notifyOnMatch } });
      notify('success', buyer.notifyOnMatch ? 'Match notifications turned off' : 'Match notifications turned on');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update buyer');
    }
  }

  return (
    <div
      style={{
        padding: spacing.md,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {buyer.firstName} {buyer.lastName}
          </div>
          <div style={{ fontSize: 11, color: palette.textMuted, fontFamily: fonts.mono }}>
            {buyer.company ?? buyer.email}
          </div>
        </div>
        <Badge color={buyer.type === 'cash' ? 'green' : 'blue'}>{buyer.type}</Badge>
      </div>

      <div style={{ fontSize: 12, color: palette.textMuted }}>
        Targets: {buyer.buyBox.states.join(', ')} · Max: ${(buyer.buyBox.maxPrice / 100).toLocaleString()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id={`notify-${buyer.id}`}
          type="checkbox"
          checked={buyer.notifyOnMatch}
          onChange={toggleNotify}
          disabled={updateBuyer.isPending}
          aria-label={`Toggle match notification emails for ${buyer.firstName} ${buyer.lastName}`}
        />
        <label htmlFor={`notify-${buyer.id}`} style={{ fontSize: 11, color: palette.textMuted }}>
          Email on match{buyer.notificationThreshold ? ` (≥${buyer.notificationThreshold}%)` : ' (≥70%)'}
        </label>
      </div>

      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
        <Button variant="danger" size="sm" onClick={onDelete} aria-label={`Delete buyer ${buyer.firstName} ${buyer.lastName}`}>
          Delete
        </Button>
      </div>
    </div>
  );
}
