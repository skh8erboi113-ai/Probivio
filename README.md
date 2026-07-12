# Probivio

**Streamline Probate Engine v2.0** — production-grade AI-powered real estate wholesaling platform.

Modular monolith deployed on Google Cloud Run. Firebase-native. Multi-tenant with row-level security. Self-improving ML scoring with per-operator model weights.

[![CI](https://github.com/skh8erboi113-ai/Probivio/actions/workflows/ci.yml/badge.svg)](https://github.com/skh8erboi113-ai/Probivio/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/skh8erboi113-ai/Probivio/branch/main/graph/badge.svg)](https://codecov.io/gh/skh8erboi113-ai/Probivio)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)]()

---

## What this is

Streamline manages the end-to-end wholesaling pipeline:

- **Probate discovery** — PDF ingestion → Gemini AI extraction → structured lead
- **Lead scoring** — Three-dimensional scoring (deal / motivation / urgency) with self-learning weights
- **Buyer matching** — Buy-box filtering + fine-grained scoring against operator's Rolodex
- **Automations** — Gemini-driven autonomous agent (no fixed rules): on every lead event and on a
  periodic sweep, Gemini decides the next action (email, tag, status change, follow-up, or nothing),
  constrained by a hard-coded action whitelist and guardrails, with every decision logged for audit.
- **Feedback loop** — Every interaction retrains the scoring model per-operator

The design goal is **acquisition-readiness**: clean modular boundaries, complete test coverage, full observability, and no hidden magic.

---

## Repository layout

    probivio/
    ├── apps/
    │   ├── streamline/          Express API — CRM, scoring, ML, integrations
    │   └── web/                 React 18 + Vite dashboard
    ├── packages/
    │   ├── types/               Shared domain models (branded IDs, discriminated unions)
    │   ├── validators/          Zod schemas (validation + normalization)
    │   ├── logger/              Winston + correlation ID + PII redaction
    │   └── db/                  Firestore repositories with operator isolation
    ├── infrastructure/
    │   ├── firestore.rules      Row-level security
    │   └── firestore.indexes.json
    ├── docs/
    │   ├── DEPLOYMENT.md        Cloud Run deployment guide
    │   ├── OPERATIONAL_RUNBOOK.md  Incident response, SLOs
    │   └── LAUNCH_CHECKLIST.md
    └── .github/
        └── workflows/           CI, deploy, security audit

---

## Tech stack

| Layer         | Technology                              | Why |
|---------------|-----------------------------------------|-----|
| Runtime       | Node.js 20 LTS                          | LTS support until 2026 |
| Backend       | Express 4.18 + TypeScript 5.3           | Mature, boring, well-understood |
| Database      | Firebase Firestore                      | Managed, strong consistency, real-time capable |
| Cache         | Redis 7 (Cloud Memorystore)             | Distributed rate limiting |
| AI/ML         | Google Gemini 1.5 Flash                 | Fastest cost-per-token in class |
| Auth          | Firebase Auth (JWT + custom claims)     | No credential storage in-house |
| Observability | Winston + Sentry + Cloud Monitoring     | Structured logs, error tracking, metrics |
| Queue         | Cloud Tasks                             | Long-horizon delayed jobs |
| Scheduler     | Cloud Scheduler                         | Cron-based retraining sweeps |
| Deployment    | Docker → Cloud Run                      | Zero-downtime, autoscaling |
| Frontend      | React 18 + Vite 5 + TanStack Query 5    | Modern, fast, minimal ceremony |
| CI/CD         | GitHub Actions                          | Native, free, powerful |

---

## Quick start

**Prerequisites:**
- Node.js 20.11+
- pnpm 9.0+
- Docker (for local Redis)
- Firebase project with Firestore + Auth enabled
- (Optional) Gemini API key for AI features

```bash
# 1. Install
pnpm install

# 2. Configure
cp .env.example .env
# Fill in FIREBASE_* + JWT_SECRET + SESSION_SECRET minimum

cp apps/web/.env.example apps/web/.env
# Fill in VITE_FIREBASE_* variables

# 3. Start local Redis
docker-compose up -d redis

# 4. Deploy Firestore rules
./apps/streamline/scripts/setup-firestore-indexes.sh

# 5. Run everything
pnpm dev

# API   → http://localhost:8080
# Web   → http://localhost:5173
# Docs  → http://localhost:8080/docs
```

---

## Development commands

| Command                    | Purpose                        |
|----------------------------|--------------------------------|
| `pnpm dev`                 | Start API + Web in parallel    |
| `pnpm dev:api`             | Just the API                   |
| `pnpm dev:web`             | Just the frontend              |
| `pnpm build`               | Production build               |
| `pnpm test`                | All tests                      |
| `pnpm test:coverage`       | Coverage report (fails <80%)   |
| `pnpm lint`                | ESLint check                   |
| `pnpm lint:fix`            | Auto-fix lint issues           |
| `pnpm type-check`          | Verify TS types                |
| `pnpm format`              | Prettier all files             |
| `pnpm clean`               | Remove build artifacts         |

---

## Documentation

- [**Deployment Guide**](./docs/DEPLOYMENT.md) — Cloud Run + Secret Manager setup
- [**Operational Runbook**](./docs/OPERATIONAL_RUNBOOK.md) — Incidents, SLOs, on-call
- [**Launch Checklist**](./docs/LAUNCH_CHECKLIST.md) — Pre-production verification
- [**API Reference**](./apps/streamline/README.md) — Endpoint catalog
- [**Frontend Guide**](./apps/web/README.md) — SPA architecture

Live API docs (when running): `http://localhost:8080/docs`

---

## Security posture

Every one of these is enforced in code:

- ✅ Firestore Row-Level Security (operator isolation at DB level)
- ✅ Firebase Auth JWT verification with revocation check on every request
- ✅ Helmet CSP + strict-origin referrer policy
- ✅ Zod validation + sanitization on every payload (control chars stripped)
- ✅ Redis-backed sliding-window rate limiting (4 tiers)
- ✅ TCPA quiet-hours enforcement per US state timezone
- ✅ Circuit breakers on Gemini / SendGrid / Skip Trace
- ✅ Google Secret Manager for all production credentials
- ✅ bcrypt cost 12 for any hashing
- ✅ No stack traces in production responses
- ✅ Sentry PII redaction (auth headers, cookies stripped before send)
- ✅ Winston PII redaction (25+ sensitive key patterns)
- ✅ CORS allowlist (no wildcard origins)
- ✅ 5MB request body limit
- ✅ 4096 char JWT length limit
- ✅ Idempotency key support on POST endpoints
- ✅ Prompt injection defense (input truncation + system instructions)

---

## Performance (from whitepaper baseline)

| Endpoint                     | RPS | p50   | p95   | p99   | Error % |
|------------------------------|-----|-------|-------|-------|---------|
| GET /health                  | 1000| 12ms  | 28ms  | 45ms  | 0.00%   |
| GET /api/leads               | 200 | 35ms  | 85ms  | 140ms | 0.00%   |
| POST /api/leads/score        | 30  | 850ms | 2400ms| 3800ms| 2.10%*  |
| GET /api/buyers/match        | 100 | 180ms | 420ms | 680ms | 0.00%   |

*Includes Gemini API timeouts (circuit breaks after 5 consecutive failures)

Verify with `pnpm --filter @probivio/streamline test:load:baseline`.

---

## Contributing

Internal only. See `.github/PULL_REQUEST_TEMPLATE.md` for PR guidelines.

**Before merging:**
- [ ] Coverage ≥ 80%
- [ ] No new ESLint warnings
- [ ] Firestore rules updated if schema changed
- [ ] `docs/` updated for public API changes
- [ ] No hardcoded secrets (verified by CodeQL)

---

## License

Proprietary — © 2026 Probivio. All rights reserved.
