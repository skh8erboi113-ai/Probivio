/**
 * Repository-layer errors.
 * These are semantic errors — the transport layer translates them to HTTP codes.
 */

export abstract class RepositoryError extends Error {
  public abstract readonly code: string;
  public override readonly name: string;

  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;

    // Preserve stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

export class NotFoundError extends RepositoryError {
  public readonly code = 'NOT_FOUND';

  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
  }
}

export class ForbiddenError extends RepositoryError {
  public readonly code = 'FORBIDDEN';

  constructor(entity: string, id: string) {
    super(`Access denied to ${entity} ${id}`);
  }
}

export class ConflictError extends RepositoryError {
  public readonly code = 'CONFLICT';

  constructor(message: string) {
    super(message);
  }
}

export class OptimisticLockError extends RepositoryError {
  public readonly code = 'OPTIMISTIC_LOCK_FAILED';

  constructor(entity: string, id: string) {
    super(`${entity} ${id} was modified concurrently — retry the operation`);
  }
}

export class DatabaseError extends RepositoryError {
  public readonly code = 'DATABASE_ERROR';

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
