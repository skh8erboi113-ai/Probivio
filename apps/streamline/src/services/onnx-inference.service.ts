import type { Logger } from '@listinglogic/logger';
import * as ort from 'onnxruntime-node';

import { CircuitOpenError, InternalError } from '../errors/app-errors.js';

import type { CachedModel } from './model-registry.service.js';

/**
 * ONNX model inference wrapper.
 *
 * Sessions are expensive to create (~50ms) so we cache them per operator/version.
 * Cache is invalidated when ModelRegistryService reports a new version.
 */

interface CachedSession {
  readonly session: ort.InferenceSession;
  readonly version: string;
}

export class OnnxInferenceService {
  private readonly sessions = new Map<string, CachedSession>();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'onnx-inference' });
  }

  public async predict(operatorId: string, model: CachedModel, features: Float32Array): Promise<number> {
    const session = await this.getSession(operatorId, model);

    const tensor = new ort.Tensor('float32', features, [1, features.length]);
    const inputName = session.inputNames[0];
    if (!inputName) throw new InternalError('ONNX session has no inputs', undefined, true);

    const start = Date.now();

    try {
      const results = await session.run({ [inputName]: tensor });
      const outputName = session.outputNames[session.outputNames.length - 1];
      if (!outputName) throw new InternalError('ONNX session has no outputs', undefined, true);

      const output = results[outputName];
      if (!output) throw new InternalError('ONNX output missing', undefined, true);

      const data = output.data;
      let probability: number;

      // xgboost binary classifier via onnxmltools emits [prob_neg, prob_pos]
      if (data instanceof Float32Array && data.length >= 2) {
        probability = data[1] ?? 0.5;
      } else if (data instanceof Float32Array && data.length === 1) {
        probability = data[0] ?? 0.5;
      } else if (Array.isArray(data) && data.length > 0) {
        const raw = data[0];
        probability = typeof raw === 'number' ? raw : 0.5;
      } else {
        throw new InternalError('Unexpected ONNX output shape', undefined, true);
      }

      const clamped = Math.max(0, Math.min(1, probability));

      this.logger.debug('ONNX inference complete', {
        operatorId,
        version: model.metadata.version,
        probability: clamped,
        durationMs: Date.now() - start,
      });

      return clamped;
    } catch (err) {
      this.logger.error('ONNX inference failed', {
        operatorId,
        version: model.metadata.version,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new CircuitOpenError('onnx-inference');
    }
  }

  public invalidate(operatorId: string): void {
    const existing = this.sessions.get(operatorId);
    if (existing) {
      void existing.session.release().catch(() => undefined);
      this.sessions.delete(operatorId);
    }
  }

  private async getSession(operatorId: string, model: CachedModel): Promise<ort.InferenceSession> {
    const cached = this.sessions.get(operatorId);

    if (cached && cached.version === model.metadata.version) {
      return cached.session;
    }

    if (cached) {
      void cached.session.release().catch(() => undefined);
    }

    const session = await ort.InferenceSession.create(model.modelBytes, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
    });

    this.sessions.set(operatorId, { session, version: model.metadata.version });

    this.logger.info('ONNX session created', {
      operatorId,
      version: model.metadata.version,
      inputCount: session.inputNames.length,
      outputCount: session.outputNames.length,
    });

    return session;
  }
}

export function createOnnxInferenceService(logger: Logger): OnnxInferenceService {
  return new OnnxInferenceService(logger);
}
