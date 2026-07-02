import type { Logger } from '@listinglogic/logger';
import type { ProbateRepository } from '@listinglogic/db';
import type {
  IsoTimestamp,
  OperatorId,
  ProbateCase,
  ProbateExtractionResult,
  UsStateCode,
  UsZipCode,
} from '@listinglogic/types';
import { ProbateStatus } from '@listinglogic/types';

import { ConflictError, ValidationError } from '../errors/app-errors.js';

import type { GeminiService } from './gemini.service.js';

/**
 * Probate PDF scanner service.
 *
 * Flow:
 *   1. Accept PDF (base64 or URL)
 *   2. Extract text (via pdf-parse — added later)
 *   3. Send text to Gemini for structured extraction
 *   4. Validate + deduplicate + persist
 */

export class ProbateService {
  private readonly logger: Logger;

  constructor(
    private readonly probateRepo: ProbateRepository,
    private readonly gemini: GeminiService,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'probate' });
  }

  public async scanPdf(
    operatorId: OperatorId,
    pdfText: string,
    sourceDocumentUrl?: string,
  ): Promise<ProbateCase> {
    if (pdfText.trim().length < 50) {
      throw new ValidationError('PDF text too short — extraction unreliable');
    }

    const extracted = await this.gemini.extractProbateData(pdfText);

    const validated = this.validateExtraction(extracted);

    // Deduplicate
    const existing = await this.probateRepo.findByCaseNumber(
      operatorId,
      validated.caseNumber,
      validated.county,
      validated.state,
    );
    if (existing) {
      throw new ConflictError(`Probate case already exists: ${validated.caseNumber}`);
    }

    const filedAt = validated.filedDate ?? (new Date().toISOString() as IsoTimestamp);

    const created = await this.probateRepo.create(operatorId, {
      caseNumber: validated.caseNumber,
      county: validated.county,
      state: validated.state as UsStateCode,
      courtName: `${validated.county} County Court`,
      filedAt: filedAt as IsoTimestamp,
      status: ProbateStatus.FILED,
      decedent: {
        fullName: validated.decedent.fullName ?? 'UNKNOWN',
        ...(validated.decedent.dateOfDeath && { dateOfDeath: validated.decedent.dateOfDeath as IsoTimestamp }),
        ...(validated.decedent.lastKnownAddress && { lastKnownAddress: validated.decedent.lastKnownAddress }),
        ...(validated.decedent.age !== undefined && validated.decedent.age !== null && { age: validated.decedent.age }),
      },
      executors: extracted.executors
        .filter((e) => e.fullName)
        .map((e) => ({
          fullName: e.fullName ?? 'UNKNOWN',
          ...(e.relationship && { relationship: e.relationship }),
          ...(e.address && { address: e.address }),
          ...(e.phone && { phone: e.phone }),
          ...(e.email && { email: e.email }),
        })),
      assets: extracted.assets
        .filter((a) => a.description)
        .map((a) => ({
          type: (a.type ?? 'other') as 'real_property' | 'vehicle' | 'financial' | 'other',
          description: a.description ?? '',
          ...(a.estimatedValue !== undefined && a.estimatedValue !== null && { estimatedValue: a.estimatedValue }),
          ...(a.address && { address: a.address }),
        })),
      extractionConfidence: extracted.confidence,
      rawExtractedText: pdfText.slice(0, 50_000),
      ...(sourceDocumentUrl && { sourceDocumentUrl }),
    });

    this.logger.info('Probate case created', {
      caseId: created.id,
      caseNumber: created.caseNumber,
      confidence: created.extractionConfidence,
    });

    return created;
  }

  private validateExtraction(raw: ProbateExtractionResult): {
    readonly caseNumber: string;
    readonly county: string;
    readonly state: string;
    readonly filedDate: string | null;
    readonly decedent: ProbateExtractionResult['decedent'];
  } {
    if (!raw.caseNumber) throw new ValidationError('Could not extract case number');
    if (!raw.county) throw new ValidationError('Could not extract county');
    if (!raw.state) throw new ValidationError('Could not extract state');
    if (!raw.decedent.fullName) throw new ValidationError('Could not extract decedent name');

    return {
      caseNumber: raw.caseNumber,
      county: raw.county,
      state: raw.state.toUpperCase(),
      filedDate: raw.filedDate,
      decedent: raw.decedent,
    };
  }
}

export function createProbateService(deps: {
  readonly probateRepo: ProbateRepository;
  readonly gemini: GeminiService;
  readonly logger: Logger;
}): ProbateService {
  return new ProbateService(deps.probateRepo, deps.gemini, deps.logger);
      }
