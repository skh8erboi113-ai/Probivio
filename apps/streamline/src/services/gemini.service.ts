import type { Logger } from '@listinglogic/logger';
import type { ProbateExtractionResult, ScoreResult } from '@listinglogic/types';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

import { loadConfig } from '../config/config.js';
import { ExternalApiError, InternalError } from '../errors/app-errors.js';

import { CircuitBreaker } from './circuit-breaker.js';
import { RetryPredicates, retryWithBackoff } from './retry.js';

/**
 * Gemini AI wrapper with:
 *   - Circuit breaker (opens after 5 consecutive failures)
 *   - Retry with exponential backoff
 *   - Prompt injection defense (input sanitization + system instructions)
 *   - Structured JSON output validation
 *
 * Model: gemini-1.5-flash (per whitepaper spec)
 */

interface GeminiPromptInput {
  readonly systemInstruction: string;
  readonly userPrompt: string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

export class GeminiService {
  private readonly circuit: CircuitBreaker;
  private readonly logger: Logger;
  private readonly model: GenerativeModel | null;
  private readonly enabled: boolean;

  constructor(logger: Logger) {
    const config = loadConfig();
    this.logger = logger.child({ service: 'gemini' });
    this.enabled = config.integrations.gemini.enabled;

    this.circuit = new CircuitBreaker({
      serviceName: 'gemini',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenRequests: 1,
      logger: this.logger,
    });

    if (this.enabled && config.integrations.gemini.apiKey) {
      const genAI = new GoogleGenerativeAI(config.integrations.gemini.apiKey);
      this.model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      });
      this.logger.info('Gemini service initialized');
    } else {
      this.model = null;
      this.logger.warn('Gemini disabled — no API key provided');
    }
  }

  public isEnabled(): boolean {
    return this.enabled && this.model !== null;
  }

  public getCircuitState() {
    return this.circuit.getState();
  }

  /**
   * Generate structured JSON output from a prompt.
   */
  public async generateJson<T>(input: GeminiPromptInput, validator: (raw: unknown) => T): Promise<T> {
    if (!this.model) throw new InternalError('Gemini service not initialized', undefined, true);

    const sanitized = this.sanitizePrompt(input.userPrompt);
    if (!sanitized) throw new InternalError('Empty prompt after sanitization', undefined, true);

    const raw = await this.circuit.execute(() =>
      retryWithBackoff(() => this.callModel(input.systemInstruction, sanitized), {
        maxAttempts: 3,
        initialDelayMs: 500,
        isRetryable: RetryPredicates.networkOrServerError,
        logger: this.logger,
        operationName: 'gemini.generate',
      }),
    );

    try {
      const parsed = JSON.parse(raw) as unknown;
      return validator(parsed);
    } catch (err) {
      this.logger.error('Gemini returned invalid JSON', {
        rawLength: raw.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ExternalApiError('gemini', err);
    }
  }

  /**
   * Explain a lead score in natural language.
   */
  public async explainScore(context: {
    readonly dealScore: number;
    readonly motivationScore: number;
    readonly urgencyScore: number;
    readonly composite: number;
    readonly leadSummary: string;
  }): Promise<string> {
    if (!this.model) return this.fallbackExplanation(context.composite);

    try {
      const result = await this.generateJson<{ readonly explanation: string }>(
        {
          systemInstruction:
            'You are a real estate wholesaling analyst. Explain lead scores in 2-3 concise sentences ' +
            'focused on the operator\'s next best action. Never fabricate data not in the input. ' +
            'Never use marketing language. Return JSON: {"explanation": "..."}',
          userPrompt: `Lead summary: ${context.leadSummary}\n\nScores:\n- Deal: ${context.dealScore}/100\n- Motivation: ${context.motivationScore}/100\n- Urgency: ${context.urgencyScore}/100\n- Composite: ${context.composite}/100`,
          maxOutputTokens: 300,
        },
        (raw) => {
          if (
            raw &&
            typeof raw === 'object' &&
            'explanation' in raw &&
            typeof (raw as { explanation: unknown }).explanation === 'string'
          ) {
            return raw as { readonly explanation: string };
          }
          throw new Error('Missing explanation field');
        },
      );
      return result.explanation.slice(0, 500);
    } catch (err) {
      this.logger.warn('Score explanation failed, using fallback', { error: err });
      return this.fallbackExplanation(context.composite);
    }
  }

  /**
   * Extract structured probate case data from PDF text.
   */
  public async extractProbateData(pdfText: string): Promise<ProbateExtractionResult> {
    if (!this.model) throw new InternalError('Gemini required for probate extraction', undefined, true);

    // Truncate to protect against prompt-injection via massive documents
    const truncated = pdfText.slice(0, 100_000);

    return this.generateJson<ProbateExtractionResult>(
      {
        systemInstruction:
          'You are a legal document parser. Extract probate case data from the provided court filing text. ' +
          'Return ONLY valid JSON matching this schema: ' +
          '{"caseNumber": string|null, "county": string|null, "state": string|null, "filedDate": ISO8601|null, ' +
          '"decedent": {"fullName": string, "dateOfDeath": ISO8601|null, "lastKnownAddress": string|null, "age": number|null}, ' +
          '"executors": [{"fullName": string, "relationship": string|null, "address": string|null, "phone": string|null, "email": string|null}], ' +
          '"assets": [{"type": "real_property"|"vehicle"|"financial"|"other", "description": string, "estimatedValue": number|null, "address": string|null}], ' +
          '"confidence": number (0-1), "warnings": string[]}. ' +
          'Never fabricate values. Use null when unknown. Set confidence to 0.5 or below when extraction is uncertain.',
        userPrompt: `PROBATE FILING TEXT:\n\n${truncated}`,
        maxOutputTokens: 2048,
      },
      (raw) => {
        if (!raw || typeof raw !== 'object') throw new Error('Invalid extraction shape');
        return raw as ProbateExtractionResult;
      },
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────
  private async callModel(systemInstruction: string, userPrompt: string): Promise<string> {
    if (!this.model) throw new InternalError('Model unavailable', undefined, true);

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      });
      const text = result.response.text();
      if (!text) throw new ExternalApiError('gemini', 'Empty response');
      return text;
    } catch (err) {
      this.logger.error('Gemini API call failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ExternalApiError('gemini', err);
    }
  }

  /**
   * Defense against prompt injection.
   * Strips instruction-like keywords and control characters.
   */
  private sanitizePrompt(prompt: string): string {
    return prompt
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/ignore\s+(all\s+)?previous\s+(instructions|prompts)/gi, '[FILTERED]')
      .replace(/system\s*:\s*/gi, '[FILTERED]:')
      .replace(/```/g, '')
      .trim()
      .slice(0, 100_000);
  }

  private fallbackExplanation(composite: number): string {
    if (composite >= 80) return 'High-priority lead. Strong deal and motivation signals. Contact within 24 hours.';
    if (composite >= 60) return 'Qualified lead. Follow standard nurture sequence.';
    if (composite >= 40) return 'Borderline lead. Monitor for stronger signals before heavy investment.';
    return 'Low-priority lead. Consider deprioritizing unless new signals emerge.';
  }
}

export function createGeminiService(logger: Logger): GeminiService {
  return new GeminiService(logger);
}
