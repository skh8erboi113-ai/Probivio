/**
 * Export all data for a single operator (GDPR right-to-portability).
 *
 * Usage:
 *   pnpm --filter @listinglogic/streamline tsx scripts/export-operator-data.ts \
 *     --operator=<uid> \
 *     --output=./operator-export.json
 */

import { writeFile } from 'node:fs/promises';

import { initializeFirebase } from '@listinglogic/db';

import { loadConfig } from '../src/config/config.js';
import { getLogger } from '../src/config/logger.js';
import { buildContainer } from '../src/container.js';

async function main(): Promise<void> {
  const operatorArg = process.argv.find((arg) => arg.startsWith('--operator='));
  const outputArg = process.argv.find((arg) => arg.startsWith('--output='));

  if (!operatorArg || !outputArg) {
    // eslint-disable-next-line no-console
    console.error('Usage: --operator=<uid> --output=<path>');
    process.exit(1);
  }

  const operatorId = operatorArg.split('=')[1] as never;
  const outputPath = outputArg.split('=')[1]!;

  const config = loadConfig();
  const logger = getLogger();

  initializeFirebase({
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    privateKey: config.firebase.privateKey,
  }, logger);

  const container = buildContainer();

  logger.info('Exporting operator data', { operatorId });

  const [leadsResult, buyersResult, automationsResult] = await Promise.all([
    container.leadRepo.list(operatorId, { page: 1, limit: 10_000, sortBy: 'createdAt', sortOrder: 'desc' }),
    container.buyerRepo.list(operatorId, { page: 1, limit: 10_000, sortBy: 'createdAt', sortOrder: 'desc' }),
    container.automationRepo.list(operatorId, { page: 1, limit: 10_000, sortBy: 'createdAt', sortOrder: 'desc' }),
  ]);

  const interactionsPerLead = await Promise.all(
    leadsResult.items.map((lead) =>
      container.interactionRepo.findByLead(operatorId, lead.id).then((interactions) => ({
        leadId: lead.id,
        interactions,
      })),
    ),
  );

  const scoringWeights = await container.weightsRepo.getCurrent(operatorId);

  const exportData = {
    exportedAt: new Date().toISOString(),
    operatorId,
    counts: {
      leads: leadsResult.total,
      buyers: buyersResult.total,
      automations: automationsResult.total,
      totalInteractions: interactionsPerLead.reduce((sum, { interactions }) => sum + interactions.length, 0),
    },
    data: {
      leads: leadsResult.items,
      buyers: buyersResult.items,
      automations: automationsResult.items,
      interactions: interactionsPerLead,
      scoringWeights,
    },
  };

  await writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

  logger.info('✓ Export complete', {
    outputPath,
    ...exportData.counts,
  });

  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Export failed:', err);
  process.exit(1);
});
