import { createLogger, type Logger } from '@listinglogic/logger';

import { loadConfig } from './config.js';

let cached: Logger | null = null;

export function getLogger(): Logger {
  if (cached) return cached;

  const config = loadConfig();
  cached = createLogger({
    serviceName: 'streamline-api',
    environment: config.env,
    logLevel: config.isProduction ? 'info' : 'debug',
  });

  return cached;
}
