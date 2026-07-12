import { vi } from 'vitest';

// Vitest test bootstrap: set required env vars for envSchema in config/config.ts
process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '8080';

process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.FIREBASE_CLIENT_EMAIL ??= 'firebase-adminsdk@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY ??= [
  '-----BEGIN PRIVATE KEY-----',
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...test...IDAQAB',
  '-----END PRIVATE KEY-----',
].join('\n');

process.env.JWT_SECRET ??= 'test-jwt-secret-min-32-characters-long-123456';
process.env.SESSION_SECRET ??= 'test-session-secret-min-32-characters-long-123456';

process.env.ALLOWED_ORIGINS ??= 'http://localhost:5173,http://localhost:3000';

// Keep external integrations disabled in test runs. These are all optional
// in envSchema (z.string().optional() etc), which only accepts `undefined` —
// an empty string is "present but invalid" and fails validation — so unset
// them entirely rather than defaulting to ''.
delete process.env.GEMINI_API_KEY;
delete process.env.SENDGRID_API_KEY;
delete process.env.SENDGRID_FROM_EMAIL;
delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.SKIP_TRACE_API_KEY;
delete process.env.REDIS_URL;
delete process.env.SENTRY_DSN;

// Feature flags
process.env.ENABLE_ML_RETRAINING ??= 'false';
process.env.ENABLE_AUTOMATION_ENGINE ??= 'false';
process.env.ENABLE_PROBATE_SCANNER ??= 'false';

// Optional
process.env.APP_VERSION ??= 'test';

// ----------------------------------------------------------------------------
// Mock Firebase Auth (so /auth middleware works without emulator or real tokens)
// ----------------------------------------------------------------------------
vi.mock('firebase-admin/auth', () => {
  return {
    getAuth: () => ({
      verifyIdToken: vi.fn(async (token: string) => {
        // token is the string after "Bearer " header slice
        // Allow tests to pass either "op_test" or anything.
        const uid = token === 'op_test' ? 'op_test' : 'op_test';
        return {
          uid,
          // custom claims accessed via req.claims[claim] in some routes
          // must exist as an object
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [Symbol.for('firebase.auth.DecodedIdToken')]: true,
          admin: true,
          tier: 'pro',
        } as any;
      }),
    }),
  };
});
