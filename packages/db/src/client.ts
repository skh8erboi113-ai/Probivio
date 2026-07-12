import { type App, cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { type Auth, getAuth } from 'firebase-admin/auth';
import { type Firestore, getFirestore } from 'firebase-admin/firestore';

import type { Logger } from '@probivio/logger';

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
let cachedAuth: Auth | null = null;

const DEFAULT_APP_NAME = 'probivio';

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
 * Firebase Auth bound to the named `probivio` app.
 *
 * Callers MUST use this instead of the bare `getAuth()` from
 * `firebase-admin/auth` — that resolves against the *default* Firebase app,
 * which this codebase never initializes (initializeFirebase() always creates
 * a named app to avoid clashing with other Firebase SDK instances in the
 * same process, e.g. the emulator in tests). Calling the bare `getAuth()`
 * throws `app/no-app` in every real environment, including production.
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;

  const app = getFirebaseApp();
  cachedAuth = getAuth(app);

  return cachedAuth;
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
      cachedAuth = null;
    }
  }
}
