# ListingLogic Monorepo

**Streamline Probate Engine v2.0** — AI-powered real estate wholesaling platform.

Production-grade modular monolith deployed on Google Cloud Run with Firebase, Redis, and Gemini AI.

---

## Architecture

```
listinglogic/
├── apps/
│   ├── streamline/          # Express API — CRM, scoring, ML feedback loop
│   └── web/                 # React SPA — operator dashboard + architecture docs
├── packages/
│   ├── db/                  # Firestore repositories (typed)
│   ├── types/               # Shared TypeScript domain models
│   ├── validators/          # Shared Zod schemas
│   └── logger/              # Winston structured logging
└── infrastructure/
    ├── firestore.rules      # DB-level tenant isolation
    └── docker-compose.yml   # Local dev stack
```

## Tech stack

| Layer         | Technology                              |
| ------------- | --------------------------------------- |
| Runtime       | Node.js 20 LTS                          |
| Backend       | Express 4.18 + TypeScript 5.3           |
| Database      | Firebase Firestore                      |
| Cache         | Redis 7                                 |
| AI/ML         | Google Gemini 1.5 Flash                 |
| Auth          | Firebase Authentication (JWT)           |
| Observability | Winston + Sentry + Cloud Monitoring     |
| Deployment    | Docker → Cloud Run                      |
| CI/CD         | GitHub Actions                          |

## Quick start

```bash
# 1. Prerequisites
node --version   # >= 20.11.1
pnpm --version   # >= 9.0.0

# 2. Install
pnpm install

# 3. Configure
cp .env.example .env
# Fill in FIREBASE_* + GEMINI_API_KEY minimum

# 4. Start local stack
docker-compose up -d redis
pnpm dev

# API   → http://localhost:8080
# Web   → http://localhost:5173
```

## Development workflow

| Command                | Purpose                         |
| ---------------------- | ------------------------------- |
| `pnpm dev`             | Start API + Web in parallel     |
| `pnpm dev:api`         | Just the API                    |
| `pnpm dev:web`         | Just the frontend               |
| `pnpm build`           | Production build                |
| `pnpm test`            | Run all tests                   |
| `pnpm test:coverage`   | Coverage report (fails <80%)    |
| `pnpm lint`            | ESLint check                    |
| `pnpm lint:fix`        | Auto-fix                        |
| `pnpm type-check`      | Verify TS types                 |
| `pnpm format`          | Prettier all files              |

## Security posture

- ✅ Firestore Row-Level Security (operator isolation)
- ✅ Firebase Auth JWT verification on every request
- ✅ Helmet CSP + XSS protection
- ✅ Zod validation on all payloads
- ✅ Redis sliding-window rate limiting
- ✅ Google Secret Manager (production)
- ✅ bcrypt cost 12 for secrets
- ✅ No stack traces in production
- ✅ Circuit breakers on external APIs

## Documentation

- `apps/streamline/README.md` — API reference
- `apps/web/README.md` — Frontend guide
- `docs/DEPLOYMENT.md` — Cloud Run deployment
- `docs/ML_PIPELINE.md` — Scoring + feedback loop

## License

Proprietary — © 2026 ListingLogic
