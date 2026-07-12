import { Storage } from '@google-cloud/storage';

import type { ScoringWeightsRepository } from '@listinglogic/db';
import type { Logger } from '@listinglogic/logger';

/**
 * Loads ONNX model artifacts from Cloud Storage and caches them in memory.
 *
 * The Firestore document `scoring_weights/{operatorId}` acts as the pointer.
 * When its `version` changes, we invalidate the cache and reload from GCS.
 *
 * Falls back to null (→ heuristic scoring) when no trained model exists yet.
 *
 * Caching strategy — stale-while-revalidate, not blocking-on-expiry:
 *   - Cold (nothing cached yet): the caller's request pays the full GCS
 *     download cost once, synchronously.
 *   - Warm but stale (past TTL): the caller gets the stale-but-still-valid
 *     cached model IMMEDIATELY, while a refresh kicks off in the background.
 *     The next request (or the current one, next time) gets the fresh copy.
 *     A model that's a few minutes past its hour-long TTL is not meaningfully
 *     worse than one that's fresh — but blocking a live scoring request on a
 *     multi-hundred-KB GCS download is a real, avoidable latency hit.
 *   - In-flight de-duplication: concurrent cold-start requests for the same
 *     operator share one GCS download instead of each starting their own.
 */

export interface ModelMetadata {
  readonly version: string;
  readonly modelUrl: string;
  readonly modelType: 'xgboost-onnx' | 'heuristic';
  readonly threshold: number;
  readonly auc: number;
  readonly trainedAt: string;
  readonly trainingSize: number;
  readonly topFeatures: Readonly<Record<string, number>>;
}

export interface CachedModel {
  readonly metadata: ModelMetadata;
  readonly modelBytes: Uint8Array;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_LOCK_TTL_MS = 30_000; // avoid piling up background refreshes if GCS is slow/down

interface CacheEntry {
  readonly model: CachedModel | null;
  readonly loadedAt: number;
}

export class ModelRegistryService {
  private readonly cache = new Map<string, CacheEntry>();
  /** In-flight loads, keyed by operator — de-dupes concurrent cold-start requests. */
  private readonly inFlight = new Map<string, Promise<CachedModel | null>>();
  /** Timestamp of the last background refresh kicked off per operator, to rate-limit refresh attempts. */
  private readonly refreshStartedAt = new Map<string, number>();
  private readonly storage: Storage;
  private readonly logger: Logger;

  constructor(
    private readonly weightsRepo: ScoringWeightsRepository,
    logger: Logger,
  ) {
    this.storage = new Storage();
    this.logger = logger.child({ service: 'model-registry' });
  }

  public getModel(operatorId: string): Promise<CachedModel | null> {
    const cached = this.cache.get(operatorId);

    if (!cached) {
      // Cold: nothing cached yet, must block on the load (de-duped if concurrent).
      return this.loadAndCache(operatorId);
    }

    const isStale = Date.now() - cached.loadedAt >= CACHE_TTL_MS;
    if (isStale) {
      // Warm-but-stale: serve what we have immediately, refresh in the background.
      this.scheduleBackgroundRefresh(operatorId);
    }

    return Promise.resolve(cached.model);
  }

  public invalidate(operatorId: string): void {
    this.cache.delete(operatorId);
    this.refreshStartedAt.delete(operatorId);
  }

  /**
   * Pre-load models for a set of operators — call at server boot with, e.g.,
   * the most recently active operators, so their first scoring request after
   * a cold start/deploy doesn't pay the GCS download latency inline.
   * Failures are logged and swallowed; a warm-up miss just means that
   * operator's next request falls back to the normal cold-load path.
   */
  public async warmUp(operatorIds: readonly string[]): Promise<void> {
    if (operatorIds.length === 0) return;

    const start = Date.now();
    const results = await Promise.allSettled(operatorIds.map((id) => this.loadAndCache(id)));

    const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
    this.logger.info('Model registry warm-up complete', {
      requested: operatorIds.length,
      loaded: succeeded,
      durationMs: Date.now() - start,
    });
  }

  private scheduleBackgroundRefresh(operatorId: string): void {
    const lastAttempt = this.refreshStartedAt.get(operatorId);
    if (lastAttempt && Date.now() - lastAttempt < REFRESH_LOCK_TTL_MS) {
      // A refresh is already in flight (or very recently failed) — don't pile on.
      return;
    }
    this.refreshStartedAt.set(operatorId, Date.now());

    void this.loadAndCache(operatorId).catch((err: unknown) => {
      this.logger.warn('Background model refresh failed — keeping stale cache', {
        operatorId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private loadAndCache(operatorId: string): Promise<CachedModel | null> {
    const existing = this.inFlight.get(operatorId);
    if (existing) return existing;

    const loadPromise = this.loadFromStorage(operatorId)
      .then((model) => {
        this.cache.set(operatorId, { model, loadedAt: Date.now() });
        return model;
      })
      .finally(() => {
        this.inFlight.delete(operatorId);
      });

    this.inFlight.set(operatorId, loadPromise);
    return loadPromise;
  }

  private async loadFromStorage(operatorId: string): Promise<CachedModel | null> {
    const metadata = (await this.weightsRepo.getCurrent(operatorId)) as unknown as ModelMetadata;

    if (!metadata || metadata.modelType !== 'xgboost-onnx' || !metadata.modelUrl) {
      this.logger.debug('No ONNX model registered', { operatorId });
      return null;
    }

    try {
      const { bucket, path } = this.parseGcsUrl(metadata.modelUrl);
      const [contents] = await this.storage.bucket(bucket).file(path).download();

      this.logger.info('Loaded ONNX model', {
        operatorId,
        version: metadata.version,
        auc: metadata.auc,
        bytes: contents.length,
      });

      return {
        metadata,
        modelBytes: new Uint8Array(contents),
      };
    } catch (err) {
      this.logger.error('Failed to load model from GCS', {
        operatorId,
        modelUrl: metadata.modelUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private parseGcsUrl(gcsUrl: string): { bucket: string; path: string } {
    if (!gcsUrl.startsWith('gs://')) {
      throw new Error(`Invalid GCS URL: ${gcsUrl}`);
    }
    const stripped = gcsUrl.slice(5);
    const slashIdx = stripped.indexOf('/');
    if (slashIdx === -1) throw new Error(`Malformed GCS URL: ${gcsUrl}`);
    return {
      bucket: stripped.slice(0, slashIdx),
      path: stripped.slice(slashIdx + 1),
    };
  }
}

export function createModelRegistryService(deps: {
  readonly weightsRepo: ScoringWeightsRepository;
  readonly logger: Logger;
}): ModelRegistryService {
  return new ModelRegistryService(deps.weightsRepo, deps.logger);
}
