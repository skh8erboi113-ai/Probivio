/**
 * @listinglogic/db
 *
 * Firestore repository layer with:
 *   - Operator isolation on every query (defense in depth)
 *   - Optimistic concurrency control
 *   - Structured logging
 *   - Transaction support
 *   - Batch operations
 */

// Client
export {
  getDb,
  getFirebaseApp,
  initializeFirebase,
  pingFirestore,
  shutdownFirebase,
} from './client.js';
export type { FirebaseConfig } from './client.js';

// Collections
export { Collections, Fields } from './collections.js';
export type { CollectionName } from './collections.js';

// Errors
export {
  ConflictError,
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  OptimisticLockError,
  RepositoryError,
} from './errors.js';

// Base
export { BaseRepository } from './base.repository.js';
export type { BaseEntity, ListOptions, ListResult } from './base.repository.js';

// Repositories
export { LeadRepository } from './lead.repository.js';
export type { LeadListOptions } from './lead.repository.js';

export { BuyerRepository } from './buyer.repository.js';
export type { BuyerFilters, BuyerListOptions } from './buyer.repository.js';

export { BuyerMatchNotificationRepository } from './buyer-match-notification.repository.js';

export { ProbateRepository } from './probate.repository.js';
export type { ProbateFilters, ProbateListOptions } from './probate.repository.js';

export { AgentDecisionLogRepository } from './agent-decision-log.repository.js';
export type {
  AgentDecisionLogFilters,
  AgentDecisionLogListOptions,
} from './agent-decision-log.repository.js';

export { InteractionRepository } from './interaction.repository.js';

export { ScoreHistoryRepository } from './score-history.repository.js';

export { IdempotencyRepository } from './idempotency.repository.js';

export { ScoringWeightsRepository } from './scoring-weights.repository.js';

export { OperatorAgentSettingsRepository } from './operator-agent-settings.repository.js';
