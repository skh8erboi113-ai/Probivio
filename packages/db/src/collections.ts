/**
 * Firestore collection name constants.
 * NEVER reference these strings directly in repositories — always use these constants.
 */

export const Collections = {
  OPERATORS: 'operators',
  OPERATOR_SETTINGS: 'operator_settings',
  LEADS: 'leads',
  BUYERS: 'buyers',
  BUYER_MATCH_NOTIFICATIONS: 'buyer_match_notifications',
  PROBATE_CASES: 'probate_cases',
  AGENT_DECISION_LOGS: 'agent_decision_logs',
  INTERACTIONS: 'interactions',
  SCORE_HISTORY: 'score_history',
  SCORING_WEIGHTS: 'scoring_weights',
  IDEMPOTENCY_KEYS: 'idempotency_keys',
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];

/**
 * Field name constants — protects against typos in `where()` clauses.
 */
export const Fields = {
  OPERATOR_ID: 'operatorId',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  STATUS: 'status',
  SOURCE: 'source',
  SCORE: 'score',
  TAGS: 'tags',
  LEAD_ID: 'leadId',
  BUYER_ID: 'buyerId',
} as const;
