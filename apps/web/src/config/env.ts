import { z } from 'zod';

/**
 * Client-side environment validation.
 * Only VITE_* vars are exposed to the browser bundle.
 */

const envSchema = z.object({
  VITE_API_URL: z.string().default(''),
  VITE_FIREBASE_API_KEY: z.string().min(1, 'VITE_FIREBASE_API_KEY is required'),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Environment validation failed:\n${issues}`);
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL || '',
  firebase: {
    apiKey: parsed.data.VITE_FIREBASE_API_KEY,
    authDomain: parsed.data.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: parsed.data.VITE_FIREBASE_PROJECT_ID,
    storageBucket: parsed.data.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: parsed.data.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: parsed.data.VITE_FIREBASE_APP_ID,
  },
} as const;
