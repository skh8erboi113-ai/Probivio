import type { DocumentData, FirestoreDataConverter, QueryDocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Type-safe converters between Firestore documents and domain types.
 *
 * These converters strip out `id` on write (Firestore stores it in the ref)
 * and inject it on read. This keeps our domain types clean while still
 * providing full type safety at the Firestore API boundary.
 */

export interface WithId {
  readonly id: string;
}

export function createConverter<T extends WithId>(): FirestoreDataConverter<T> {
  return {
    toFirestore(entity: T): DocumentData {
      const { id: _id, ...rest } = entity;
      return rest as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      const data = snapshot.data();
      return { ...data, id: snapshot.id } as T;
    },
  };
}

/**
 * Strips fields that shouldn't be persisted (like `id`, or client-computed values).
 */
export function stripInternal<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly (keyof T)[],
): Partial<T> {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}
