import pdfParse from 'pdf-parse';

import { InternalError, ValidationError } from '../errors/app-errors.js';

import type { Logger } from '@probivio/logger';

/**
 * PDF text extraction service.
 *
 * Uses pdf-parse (pure JS, no native deps) — safe for Cloud Run's Alpine image.
 * For OCR of scanned PDFs, chain with Cloud Document AI in a future iteration.
 *
 * Guardrails:
 *   - 20 MB max input
 *   - 200-page max document
 *   - 500k character output limit
 *   - Strips control characters to prevent prompt injection downstream
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_OUTPUT_CHARS = 500_000;

/** `pdf-parse`'s `info` field is untyped (`any`) upstream — narrow the fields we read. */
interface PdfInfoDictionary {
  readonly Title?: unknown;
  readonly Author?: unknown;
  readonly CreationDate?: unknown;
}

export interface PdfExtractionResult {
  readonly text: string;
  readonly pageCount: number;
  readonly metadata: {
    readonly title?: string;
    readonly author?: string;
    readonly creationDate?: string;
  };
}

export class PdfParserService {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'pdf-parser' });
  }

  public async extractFromBuffer(buffer: Buffer, filename?: string): Promise<PdfExtractionResult> {
    if (buffer.length === 0) throw new ValidationError('PDF buffer is empty');
    if (buffer.length > MAX_PDF_BYTES) {
      throw new ValidationError(`PDF exceeds ${MAX_PDF_BYTES} byte limit`);
    }

    // Verify PDF magic bytes to reject non-PDF uploads early
    const header = buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      throw new ValidationError('File does not appear to be a valid PDF');
    }

    const start = Date.now();

    try {
      const parsed = await pdfParse(buffer, {
        max: MAX_PAGES,
      });

      const sanitized = this.sanitize(parsed.text);

      this.logger.info('PDF parsed', {
        filename,
        bytes: buffer.length,
        pageCount: parsed.numpages,
        outputChars: sanitized.length,
        durationMs: Date.now() - start,
      });

      const info = parsed.info as PdfInfoDictionary | undefined;

      return {
        text: sanitized,
        pageCount: parsed.numpages,
        metadata: {
          ...(Boolean(info?.Title) && { title: String(info?.Title) }),
          ...(Boolean(info?.Author) && { author: String(info?.Author) }),
          ...(Boolean(info?.CreationDate) && { creationDate: String(info?.CreationDate) }),
        },
      };
    } catch (err) {
      this.logger.error('PDF parsing failed', {
        filename,
        bytes: buffer.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new InternalError('Failed to parse PDF', err, true);
    }
  }

  public extractFromBase64(base64: string, filename?: string): Promise<PdfExtractionResult> {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch (err) {
      throw new ValidationError('Invalid base64 encoding', { cause: String(err) });
    }
    return this.extractFromBuffer(buffer, filename);
  }

  public async extractFromUrl(url: string): Promise<PdfExtractionResult> {
    if (!url.startsWith('https://')) {
      throw new ValidationError('Only HTTPS URLs are supported');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/pdf' },
      });

      if (!res.ok) {
        throw new ValidationError(`Failed to fetch PDF: HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type');
      if (contentType && !contentType.includes('pdf')) {
        throw new ValidationError(`URL did not return a PDF (content-type: ${contentType})`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      return this.extractFromBuffer(buffer, url.split('/').pop());
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new InternalError('Failed to fetch remote PDF', err, true);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sanitize(text: string): string {
    return text
      // eslint-disable-next-line no-control-regex -- intentional: stripping control chars for prompt-injection defense
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim()
      .slice(0, MAX_OUTPUT_CHARS);
  }
}

export function createPdfParserService(logger: Logger): PdfParserService {
  return new PdfParserService(logger);
        }
