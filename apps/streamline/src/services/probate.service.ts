import type { Logger } from '@listinglogic/logger';
import type { ProbateRepository } from '@listinglogic/db';
import type {
  IsoTimestamp,
  OperatorId,
  ProbateCase,
  ProbateExtractionResult,
  UsStateCode,
} from '@listinglogic/types';
import { ProbateStatus } from '@listinglogic/types';

import { ConflictError, ValidationError } from '../errors/app-errors.js';

import type { GeminiService } from './gemini.service.js';
import type { PdfParserService } from './pdf-parser.service.js';

export class ProbateService {
  private readonly logger: Logger;

  constructor(
    private readonly probateRepo: ProbateRepository,
    private readonly gemini: GeminiService,
    private readonly pdfParser: PdfParserService,
    logger: Logger,
  ) {
    this.logger = logger.child({ service: 'probate' });
  }

  public async scanFromBase64(
    operatorId: OperatorId,
    base64Data: string,
    filename?: string,
  ): Promise<ProbateCase> {
    const parsed = await this.pdfParser.extractFromBase64(base64Data, filename);
    return this.processExtractedText(operatorId, parsed.text);
  }

  public async scanFromUrl(operatorId: OperatorId, url: string): Promise<ProbateCase> {
    const parsed = await this.pdfParser.extractFromUrl(url);
    return this.processExtractedText(operatorId, parsed.text, url);
  }

  private async processExtractedText(
    operatorId: OperatorId,
    pdfText: string,
    sourceDocumentUrl?: string,
  ): Promise<ProbateCase> {
    if (pdfText.trim().length < 50) {
      throw new ValidationError('PDF text too short — extraction unreliable');
    }

    const extracted = await this.gemini.extractProbateData(pdfText);
    const validated = this.validateExtraction(extracted);

    const existing = await this.probateRepo.findByCaseNumber(
      operatorId,
      validated.caseNumber,
      validated.county,
      validated.state as UsStateCode,
    );
    if (existing) {
      throw new ConflictError(`Probate case already exists: ${validated.caseNumber}`);
    }

    const filedAt = validated.filedDate ?? new Date().toISOString();

    const created = await this.probateRepo.create(operatorId, {
      caseNumber: validated.caseNumber,
      county: validated.county,
      state: validated.state as UsStateCode,
      courtName: `${validated.county} County Court`,
      filedAt: filedAt as IsoTimestamp,
      status: ProbateStatus.FILED,
      decedent: {
        fullName: extracted.decedent.fullName ?? 'UNKNOWN',
        ...(extracted.decedent.dateOfDeath && {
          dateOfDeath: extracted.decedent.dateOfDeath as IsoTimestamp,
        }),
        ...(extracted.decedent.lastKnownAddress && {
          lastKnownAddress: extracted.decedent.lastKnownAddress,
        }),
        ...(extracted.decedent.age !== undefined &&
          extracted.decedent.age !== null && { age: extracted.decedent.age }),
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
          ...(a.estimatedValue !== undefined &&
            a.estimatedValue !== null && { estimatedValue: a.estimatedValue }),
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
    };
  }
}

export function createProbateService(deps: {
  readonly probateRepo: ProbateRepository;
  readonly gemini: GeminiService;
  readonly pdfParser: PdfParserService;
  readonly logger: Logger;
}): ProbateService {
  return new ProbateService(deps.probateRepo, deps.gemini, deps.pdfParser, deps.logger);
}
