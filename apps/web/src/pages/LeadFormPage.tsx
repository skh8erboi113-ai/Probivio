import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { CreateLeadPayload } from '@probivio/validators';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../context/ToastContext';
import { useCreateLead, useLead, useUpdateLead } from '../hooks/useLeads';
import { fonts, palette, spacing } from '../theme';

const SOURCE_OPTIONS = [
  { value: 'probate', label: 'Probate' },
  { value: 'direct_mail', label: 'Direct Mail' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'referral', label: 'Referral' },
  { value: 'driving_for_dollars', label: 'Driving for Dollars' },
  { value: 'web_form', label: 'Web Form' },
  { value: 'ppc', label: 'PPC' },
  { value: 'bandit_sign', label: 'Bandit Sign' },
  { value: 'other', label: 'Other' },
];

const MOTIVATION_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function LeadFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { notify } = useToast();

  const { data: existing } = useLead(id);
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();

  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload: CreateLeadPayload = {
      contact: {
        firstName: String(form.get('firstName')),
        lastName: String(form.get('lastName')),
        ...(String(form.get('email') || '') && { email: String(form.get('email')) }),
        ...(String(form.get('phone') || '') && { phone: String(form.get('phone')) }),
      },
      property: {
        address: String(form.get('address')),
        city: String(form.get('city')),
        state: String(form.get('state')).toUpperCase() as CreateLeadPayload['property']['state'],
        zip: String(form.get('zip')),
      },
      metrics: {
        ...(Number(form.get('askingPrice') || 0) > 0 && { askingPrice: Number(form.get('askingPrice')) * 100 }),
        ...(Number(form.get('arv') || 0) > 0 && { arv: Number(form.get('arv')) * 100 }),
        ...(Number(form.get('repairEstimate') || 0) > 0 && {
          repairEstimate: Number(form.get('repairEstimate')) * 100,
        }),
      },
      source: String(form.get('source')) as CreateLeadPayload['source'],
      status: 'new',
      motivation: String(form.get('motivation')) as CreateLeadPayload['motivation'],
      ...(String(form.get('notes') || '') && { notes: String(form.get('notes')) }),
      tags: [],
    };

    try {
      if (isEdit && id) {
        await updateLead.mutateAsync({ id, input: payload });
        notify('success', 'Lead updated');
      } else {
        await createLead.mutateAsync(payload);
        notify('success', 'Lead created');
      }
      navigate('/leads');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  const lead = existing?.data;

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
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
        <h1 style={{ fontFamily: fonts.display, fontSize: 28, margin: `${spacing.xs}px 0 0` }}>
          {isEdit ? 'Edit lead' : 'New lead'}
        </h1>
      </div>

      <Card>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <Section title="Contact">
            <Grid>
              <Input label="First name" name="firstName" defaultValue={lead?.contact.firstName} required />
              <Input label="Last name" name="lastName" defaultValue={lead?.contact.lastName} required />
              <Input label="Email" name="email" type="email" defaultValue={lead?.contact.email} />
              <Input label="Phone" name="phone" defaultValue={lead?.contact.phone} />
            </Grid>
          </Section>

          <Section title="Property">
            <Grid>
              <Input label="Address" name="address" defaultValue={lead?.property.address} required />
              <Input label="City" name="city" defaultValue={lead?.property.city} required />
              <Input label="State (2-letter)" name="state" maxLength={2} defaultValue={lead?.property.state} required />
              <Input label="ZIP" name="zip" defaultValue={lead?.property.zip} required />
            </Grid>
          </Section>

          <Section title="Deal metrics ($)">
            <Grid>
              <Input
                label="Asking price"
                name="askingPrice"
                type="number"
                defaultValue={lead?.metrics.askingPrice ? lead.metrics.askingPrice / 100 : undefined}
              />
              <Input
                label="ARV"
                name="arv"
                type="number"
                defaultValue={lead?.metrics.arv ? lead.metrics.arv / 100 : undefined}
              />
              <Input
                label="Repair estimate"
                name="repairEstimate"
                type="number"
                defaultValue={
                  lead?.metrics.repairEstimate ? lead.metrics.repairEstimate / 100 : undefined
                }
              />
            </Grid>
          </Section>

          <Section title="Classification">
            <Grid>
              <Select label="Source" name="source" options={SOURCE_OPTIONS} defaultValue={lead?.source} />
              <Select
                label="Motivation"
                name="motivation"
                options={MOTIVATION_OPTIONS}
                defaultValue={lead?.motivation}
              />
            </Grid>
          </Section>

          <Section title="Notes">
            <label htmlFor="lead-notes" style={{ display: 'none' }}>
              Notes
            </label>
            <textarea
              id="lead-notes"
              name="notes"
              defaultValue={lead?.notes}
              rows={4}
              aria-label="Notes"
              style={{
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 8,
                padding: 12,
                color: palette.text,
                fontFamily: fonts.sans,
                fontSize: 14,
                resize: 'vertical',
                width: '100%',
              }}
            />
          </Section>

          <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
            <Button type="submit" loading={submitting}>
              {isEdit ? 'Save changes' : 'Create lead'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/leads')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend
        style={{
          fontSize: 10,
          color: palette.accent,
          fontFamily: fonts.mono,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          marginBottom: spacing.sm,
          padding: 0,
        }}
      >
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Grid({ children }: { readonly children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>{children}</div>;
}
