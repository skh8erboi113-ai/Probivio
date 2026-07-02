/**
 * Delete all data for an operator (GDPR right-to-erasure).
 *
 * DESTRUCTIVE — requires --confirm=YES-DELETE flag.
 *
 * Usage:
 *   pnpm --filter @listinglogic/streamline tsx scripts/delete-operator-data.ts \
 *     --operator=<uid> \
 *     --confirm=YES-DELETE
 */

import { getDb, initializeFirebase } from '@listinglogic/db';

import { loadConfig } from '../src/config/config.js';
import { getLogger } from '../src/config/logger.js';

const OPERATOR_SCOPED_COLLECTIONS = [
  'leads',
  'buyers',
  'probate_cases',
  'automations',
  'interactions',
  'score_history',
  'scoring_weights',
] as const;

async function main(): Promise<void> {
  const operatorArg = process.argv.find((arg) => arg.startsWith('--operator='));
  const confirmArg = process.argv.find((arg) => arg.startsWith('--confirm='));

  if (!operatorArg) {
    // eslint-disable-next-line no-console
    console.error('Missing --operator=<uid>');
    process.exit(1);
  }
  if (confirmArg !== '--confirm=YES-DELETE') {
    // eslint-disable-next-line no-console
    console.error('Missing or incorrect --confirm=YES-DELETE flag');
    process.exit(1);
  }

  const operatorId = operatorArg.split('=')[1]!;

  const config = loadConfig();
  const logger = getLogger();

  initializeFirebase({
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    privateKey: config.firebase.privateKey,
  }, logger);

  const db = getDb();

  logger.warn('DELETING all data for operator', { operatorId });

  for (const collection of OPERATOR_SCOPED_COLLECTIONS) {
    const snapshot = await db
      .collection(collection)
      .where('operatorId', '==', operatorId)
      .get();

    const batchSize = 500;
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const chunk = snapshot.docs.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    logger.info('Deleted collection docs', {
      collection,
      count: snapshot.docs.length,
    });
  }

  logger.warn('✓ Operator data deleted', { operatorId });
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Delete failed:', err);
  process.exit(1);
});
