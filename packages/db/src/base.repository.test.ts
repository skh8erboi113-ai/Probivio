import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from './base.repository.js';

describe('cursor pagination encode/decode', () => {
  it('round-trips a string sort value', () => {
    const cursor = encodeCursor({ sortValue: 'abc', id: 'doc_1' });
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ sortValue: 'abc', id: 'doc_1' });
  });

  it('round-trips a numeric sort value', () => {
    const cursor = encodeCursor({ sortValue: 42, id: 'doc_2' });
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ sortValue: 42, id: 'doc_2' });
  });

  it('produces an opaque, URL-safe string (base64url — no +, /, or = padding)', () => {
    const cursor = encodeCursor({ sortValue: 'has special chars !@#$%^&*()', id: 'doc_3' });
    expect(cursor).not.toMatch(/[+/=]/);
  });

  it('throws a generic error (never leaks internal shape) on a malformed cursor', () => {
    expect(() => decodeCursor('not-valid-base64url-json')).toThrow('Invalid pagination cursor');
  });

  it('throws when the decoded payload is missing the required id field', () => {
    const malformed = Buffer.from(JSON.stringify({ sortValue: 'x' })).toString('base64url');
    expect(() => decodeCursor(malformed)).toThrow('Invalid pagination cursor');
  });

  it('throws when the decoded payload is not an object at all', () => {
    const malformed = Buffer.from(JSON.stringify('just a string')).toString('base64url');
    expect(() => decodeCursor(malformed)).toThrow('Invalid pagination cursor');
  });
});
