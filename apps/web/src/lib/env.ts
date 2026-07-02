import { z } from 'zod';

/**
 * Vite exposes only variables prefixed with VITE_ to the client bundle.
 * Validated at module load — misconfiguration crashes early with a clear message.
 */

const envSchema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:8080'),
  VITE_FIREBASE_API_KEY: z.string().min(1, 'VITE_FIREBASE_API_KEY is required'),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
});

let cached: z.infer<typeof envSchema> | null = null;

export function getEnv(): z.infer<typeof envSchema> {
  if (cached) return cached;
  try {
    cached = envSchema.parse(import.meta.env);
    return cached;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Client env validation failed. Check apps/web/.env against .env.example', err);
    throw err;
  }
}
