/**
 * Seed sample operator data for demos and manual testing.
 *
 * Usage:
 *   pnpm --filter @listinglogic/streamline tsx scripts/seed-demo-data.ts \
 *     --operator=<firebase-uid>
 *
 * DO NOT run against production without explicit approval.
 */

import { initializeFirebase } from '@listinglogic/db';
import type {
  BuyerType,
  InvestmentStrategy,
  LeadSource,
  MotivationLevel,
  PropertyCondition,
} from '@listinglogic/types';

import { loadConfig } from '../src/config/config.js';
import { getLogger } from '../src/config/logger.js';
import { buildContainer } from '../src/container.js';

async function main(): Promise<void> {
  const operatorArg = process.argv.find((arg) => arg.startsWith('--operator='));
  if (!operatorArg) {
    // eslint-disable-next-line no-console
    console.error('Missing --operator=<uid>');
    process.exit(1);
  }
  const operatorId = operatorArg.split('=')[1] as never;

  const config = loadConfig();
  if (config.isProduction) {
    // eslint-disable-next-line no-console
    console.error('❌ Refusing to seed production data');
    process.exit(1);
  }

  const logger = getLogger();
  initializeFirebase({
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    privateKey: config.firebase.privateKey,
  }, logger);

  const container = buildContainer();

  logger.info('Seeding demo data', { operatorId });

  // Buyers
  const buyer1 = await container.buyerRepo.create(operatorId, {
    firstName: 'Alex',
    lastName: 'Buyer',
    company: 'BlueSky Capital',
    email: 'alex@bluesky.example.com',
    phone: '+15125551234' as never,
    type: 'cash' as BuyerType,
    status: 'active' as never,
    buyBox: {
      states: ['TX' as never],
      cities: ['Austin'],
      zipCodes: [],
      minBeds: 2,
      maxBeds: 5,
      minBaths: 1,
      maxBaths: 4,
      minSqft: 800,
      maxSqft: 3500,
      minPrice: 10_000_000 as never,
      maxPrice: 40_000_000 as never,
      propertyTypes: ['single_family'],
      strategies: ['fix_and_flip' as InvestmentStrategy],
      excludedZips: [],
    },
    closingTimeline: 14,
    proofOfFundsVerified: true,
    proofOfFundsAmount: 100_000_000 as never,
    stats: {
      activeDeals: 2,
      totalDealsClosed: 47,
      averageCloseTime: 12,
      totalVolume: 4_500_000_000 as never,
      rejectionRate: 0.12,
    },
    tags: ['a-tier'],
  });

  // Leads
  const leads = [
    {
      firstName: 'Mary',
      lastName: 'Johnson',
      city: 'Austin',
      motivation: 'high' as MotivationLevel,
      source: 'probate' as LeadSource,
      condition: 'medium_rehab' as PropertyCondition,
      askingPrice: 22_500_000,
      arv: 35_000_000,
      repair: 4_500_000,
    },
    {
      firstName: 'James',
      lastName: 'Wilson',
      city: 'Round Rock',
      motivation: 'urgent' as MotivationLevel,
      source: 'direct_mail' as LeadSource,
      condition: 'heavy_rehab' as PropertyCondition,
      askingPrice: 18_000_000,
      arv: 30_000_000,
      repair: 6_000_000,
    },
    {
      firstName: 'Sarah',
      lastName: 'Davis',
      city: 'Austin',
      motivation: 'medium' as MotivationLevel,
      source: 'cold_call' as LeadSource,
      condition: 'light_rehab' as PropertyCondition,
      askingPrice: 30_000_000,
      arv: 40_000_000,
      repair: 2_000_000,
    },
  ];

  for (const lead of leads) {
    const created = await container.leadRepo.create(operatorId, {
      contact: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: `${lead.firstName.toLowerCase()}@example.com`,
        phone: '+15125550000' as never,
      },
      property: {
        address: `${Math.floor(Math.random() * 9999)} Elm St`,
        city: lead.city,
        state: 'TX' as never,
        zip: '78701' as never,
        beds: 3,
        baths: 2,
        sqft: 1800,
        yearBuilt: 1985,
        propertyType: 'single_family',
        condition: lead.condition,
      },
      metrics: {
        askingPrice: lead.askingPrice as never,
        arv: lead.arv as never,
        repairEstimate: lead.repair as never,
      },
      source: lead.source,
      status: 'new' as never,
      motivation: lead.motivation,
      tags: ['demo'],
    });

    await container.scoringService.scoreLead(operatorId, created.id, 'creation');
    logger.info('Seeded lead', { id: created.id, name: `${lead.firstName} ${lead.lastName}` });
  }

  logger.info('✓ Demo data seeded', { buyerId: buyer1.id, leadCount: leads.length });
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
