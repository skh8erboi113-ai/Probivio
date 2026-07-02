import { LeadSource, LeadStatus } from '@listinglogic/types';
import { describe, expect, it } from 'vitest';

import { createLeadSchema, updateLeadSchema } from '../lead.schema.js';

describe('createLeadSchema', () => {
  const validPayload = {
    contact: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+15551234567',
    },
    property: {
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    },
    source: LeadSource.PROBATE,
    metrics: {},
  };

  it('accepts a minimal valid payload', () => {
    const result = createLeadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('normalizes phone to E.164', () => {
    const result = createLeadSchema.parse({
      ...validPayload,
      contact: { ...validPayload.contact, phone: '(555) 123-4567' },
    });
    expect(result.contact.phone).toBe('+15551234567');
  });

  it('lowercases and trims email', () => {
    const result = createLeadSchema.parse({
      ...validPayload,
      contact: { ...validPayload.contact, email: '  JANE@EXAMPLE.COM  ' },
    });
    expect(result.contact.email).toBe('jane@example.com');
  });

  it('uppercases state code', () => {
    const result = createLeadSchema.parse({
      ...validPayload,
      property: { ...validPayload.property, state: 'tx' },
    });
    expect(result.property.state).toBe('TX');
  });

  it('rejects invalid state', () => {
    const result = createLeadSchema.safeParse({
      ...validPayload,
      property: { ...validPayload.property, state: 'ZZ' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ZIP', () => {
    const result = createLeadSchema.safeParse({
      ...validPayload,
      property: { ...validPayload.property, zip: '1234' },
    });
    expect(result.success).toBe(false);
  });

  it('requires either email or phone', () => {
    const result = createLeadSchema.safeParse({
      ...validPayload,
      contact: { firstName: 'Jane', lastName: 'Doe' },
    });
    expect(result.success).toBe(false);
  });

  it('strips control characters from notes', () => {
    const result = createLeadSchema.parse({
      ...validPayload,
      notes: 'Hello\x00World\x1F',
    });
    expect(result.notes).toBe('HelloWorld');
  });

  it('defaults status to NEW', () => {
    const result = createLeadSchema.parse(validPayload);
    expect(result.status).toBe(LeadStatus.NEW);
  });

  it('rejects too many tags', () => {
    const result = createLeadSchema.safeParse({
      ...validPayload,
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateLeadSchema', () => {
  it('accepts partial updates', () => {
    const result = updateLeadSchema.safeParse({ status: LeadStatus.CONTACTED });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = updateLeadSchema.safeParse({ unknownField: 'value' });
    expect(result.success).toBe(false);
  });

  it('accepts empty object', () => {
    const result = updateLeadSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
