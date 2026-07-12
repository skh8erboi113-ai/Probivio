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

interface CacheEntry {
  readonly model: CachedModel | null;
  readonly loadedAt: number;
}

export class ModelRegistryService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly storage: Storage;
  private readonly logger: Logger;

  constructor(
    private readonly weightsRepo: ScoringWeightsRepository,
    logger: Logger,
  ) {
    this.storage = new Storage();
    this.logger = logger.child({ service: 'model-registry' });
  }

  public async getModel(operatorId: string): Promise<CachedModel | null> {
    const cached = this.cache.get(operatorId);
    const isFresh = cached && Date.now() - cached.loadedAt < CACHE_TTL_MS;

    if (cached && isFresh) return cached.model;

    // Reload
    const model = await this.loadFromStorage(operatorId);
    this.cache.set(operatorId, { model, loadedAt: Date.now() });
    return model;
  }

  public invalidate(operatorId: string): void {
    this.cache.delete(operatorId);
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
