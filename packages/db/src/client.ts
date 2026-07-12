import { type App, cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { type Firestore, getFirestore } from 'firebase-admin/firestore';

import type { Logger } from '@listinglogic/logger';

/**
 * Firebase Admin singleton.
 *
 * Initializes once per process. Safe to call from anywhere; subsequent calls
 * return the cached instance. Uses a named app to avoid conflicts with
 * other Firebase SDKs in the same process (e.g., emulator tests).
 */

export interface FirebaseConfig {
  readonly projectId: string;
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly appName?: string;
}

let cachedApp: App | null = null;
let cachedFirestore: Firestore | null = null;

const DEFAULT_APP_NAME = 'listinglogic';

export function initializeFirebase(config: FirebaseConfig, logger?: Logger): App {
  const appName = config.appName ?? DEFAULT_APP_NAME;
  const existing = getApps().find((a) => a.name === appName);

  if (existing) {
    logger?.debug('Firebase app already initialized', { appName });
    cachedApp = existing;
    return existing;
  }

  cachedApp = initializeApp(
    {
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      }),
      projectId: config.projectId,
    },
    appName,
  );

  logger?.info('Firebase Admin initialized', {
    appName,
    projectId: config.projectId,
  });

  return cachedApp;
}

export function getFirebaseApp(): App {
  if (!cachedApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return cachedApp;
}

export function getDb(): Firestore {
  if (cachedFirestore) return cachedFirestore;

  const app = getFirebaseApp();
  cachedFirestore = getFirestore(app);

  // Configure Firestore settings once
  cachedFirestore.settings({
    ignoreUndefinedProperties: true,
  });

  return cachedFirestore;
}

/**
 * Health check — validates that Firestore is reachable.
 * Used by /health endpoint.
 */
export async function pingFirestore(timeoutMs = 3000): Promise<boolean> {
  try {
    const db = getDb();
    await Promise.race([
      db.collection('_health').limit(1).get(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore ping timeout')), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Graceful shutdown — flushes pending writes.
 */
export async function shutdownFirebase(logger?: Logger): Promise<void> {
  if (cachedApp) {
    try {
      await deleteApp(cachedApp);
      logger?.info('Firebase app terminated cleanly');
    } catch (err) {
      logger?.error('Error during Firebase shutdown', { error: err });
    } finally {
      cachedApp = null;
      cachedFirestore = null;
    }
  }
}
