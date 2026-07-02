import type { Logger } from '@listinglogic/logger';
import { CloudTasksClient } from '@google-cloud/tasks';
import type { protos } from '@google-cloud/tasks';

import { loadConfig } from '../config/config.js';
import { ExternalApiError } from '../errors/app-errors.js';

/**
 * Cloud Tasks queue wrapper for durable, delayed automation actions.
 *
 * Replaces the in-process 60-second delay limit in AutomationService with
 * a real distributed queue that can schedule work weeks/months in advance.
 *
 * When Cloud Tasks is not configured (e.g. local dev, tests), the service
 * degrades to in-process setTimeout with the same 60s soft limit.
 */

export interface QueuedTask {
  readonly url: string;
  readonly method?: 'POST' | 'PUT' | 'GET' | 'DELETE';
  readonly payload?: unknown;
  readonly headers?: Record<string, string>;
  readonly scheduleAt?: Date;
  readonly deduplicationId?: string;
}

export interface TaskQueueConfig {
  readonly projectId: string;
  readonly location: string;
  readonly queueName: string;
  readonly serviceAccountEmail: string;
}

export class TaskQueueService {
  private readonly client: CloudTasksClient | null;
  private readonly queueConfig: TaskQueueConfig | null;
  private readonly logger: Logger;
  private readonly enabled: boolean;

  constructor(logger: Logger) {
    const config = loadConfig();
    this.logger = logger.child({ service: 'task-queue' });

    const rawQueue = process.env.CLOUD_TASKS_QUEUE;
    const rawLocation = process.env.CLOUD_TASKS_LOCATION;
    const rawServiceAccount = process.env.CLOUD_TASKS_SERVICE_ACCOUNT;

    if (rawQueue && rawLocation && rawServiceAccount && !config.isTest) {
      this.client = new CloudTasksClient();
      this.queueConfig = {
        projectId: config.firebase.projectId,
        location: rawLocation,
        queueName: rawQueue,
        serviceAccountEmail: rawServiceAccount,
      };
      this.enabled = true;
      this.logger.info('Cloud Tasks initialized', {
        queue: rawQueue,
        location: rawLocation,
      });
    } else {
      this.client = null;
      this.queueConfig = null;
      this.enabled = false;
      this.logger.warn('Cloud Tasks disabled — falling back to in-process delays');
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public async enqueue(task: QueuedTask): Promise<string> {
    if (!this.client || !this.queueConfig) {
      return this.executeInProcess(task);
    }

    const parent = this.client.queuePath(
      this.queueConfig.projectId,
      this.queueConfig.location,
      this.queueConfig.queueName,
    );

    const httpRequest: protos.google.cloud.tasks.v2.IHttpRequest = {
      url: task.url,
      httpMethod: task.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...task.headers,
      },
      oidcToken: {
        serviceAccountEmail: this.queueConfig.serviceAccountEmail,
      },
    };

    if (task.payload !== undefined) {
      httpRequest.body = Buffer.from(JSON.stringify(task.payload)).toString('base64');
    }

    const taskPayload: protos.google.cloud.tasks.v2.ITask = {
      httpRequest,
      ...(task.scheduleAt && {
        scheduleTime: {
          seconds: Math.floor(task.scheduleAt.getTime() / 1000),
        },
      }),
      ...(task.deduplicationId && {
        name: `${parent}/tasks/${task.deduplicationId}`,
      }),
    };

    try {
      const [response] = await this.client.createTask({ parent, task: taskPayload });
      const taskName = response.name ?? '';

      this.logger.info('Task enqueued', {
        taskName: taskName.split('/').pop(),
        url: task.url,
        scheduledFor: task.scheduleAt?.toISOString() ?? 'immediate',
      });

      return taskName;
    } catch (err) {
      // ALREADY_EXISTS = deduplication hit; treat as success
      if (err && typeof err === 'object' && 'code' in err && err.code === 6) {
        this.logger.info('Task already enqueued (dedup hit)', {
          deduplicationId: task.deduplicationId,
        });
        return task.deduplicationId ?? '';
      }
      this.logger.error('Failed to enqueue task', {
        url: task.url,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ExternalApiError('cloud-tasks', err);
    }
  }

  private async executeInProcess(task: QueuedTask): Promise<string> {
    const delay = task.scheduleAt ? Math.max(0, task.scheduleAt.getTime() - Date.now()) : 0;

    if (delay > 60_000) {
      this.logger.warn('In-process delay exceeds 60s limit — task dropped', {
        url: task.url,
        delayMs: delay,
      });
      return 'dropped:in-process-limit';
    }

    setTimeout(() => {
      void fetch(task.url, {
        method: task.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...task.headers },
        body: task.payload !== undefined ? JSON.stringify(task.payload) : undefined,
      }).catch((err) => {
        this.logger.error('In-process task execution failed', {
          url: task.url,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, delay);

    return `in-process:${crypto.randomUUID()}`;
  }
}

export function createTaskQueueService(logger: Logger): TaskQueueService {
  return new TaskQueueService(logger);
}
