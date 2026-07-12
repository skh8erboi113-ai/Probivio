# Streamline Probate Engine API

**v2.0.0** — Express REST API powering the ListingLogic wholesaling platform.

---

## Quick start

```bash
# From monorepo root
cp .env.example .env        # fill in FIREBASE_* minimum
docker-compose up -d redis
pnpm dev:api
# → http://localhost:8080
```

---

## API Reference

### Authentication
Every endpoint (except `/health`, `/ready`) requires a Firebase ID Token:
```
Authorization: Bearer <firebase-id-token>
```

### Request tracing
Pass `X-Request-ID: <uuid>` to correlate your client logs with server logs.
The response always echoes it back.

### Response envelope

**Success (single):**
```json
{
  "data": { ... },
  "message": "optional",
  "requestId": "uuid"
}
```

**Success (list):**
```json
{
  "data": [ ... ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 25,
    "hasMore": true
  },
  "requestId": "uuid"
}
```

**Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { "fields": { "email": ["Invalid email"] } }
  },
  "requestId": "uuid",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

## Endpoints

### Health
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Full health check (Firestore, Redis, Gemini) |
| GET | `/ready` | No | Readiness probe |

### Leads
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/leads` | ✅ | List leads (paginated, filterable) |
| GET | `/api/leads/:id` | ✅ | Get single lead |
| POST | `/api/leads` | ✅ | Create lead |
| PATCH | `/api/leads/:id` | ✅ | Update lead |
| DELETE | `/api/leads/:id` | ✅ | Delete lead |
| POST | `/api/leads/:id/score` | ✅ | Manually trigger AI scoring |
| GET | `/api/leads/dashboard/hot` | ✅ | Top-scored open leads |

**Lead query params:**
```
status        = new | contacted | qualified | under_contract | closed_won | closed_lost | dead
source        = probate | direct_mail | cold_call | referral | driving_for_dollars | web_form | ppc | bandit_sign | other
motivation    = unknown | low | medium | high | urgent
minScore      = 0-100
maxScore      = 0-100
search        = string
tag           = string
sortBy        = createdAt | updatedAt | score | lastContactedAt | nextFollowUpAt
sortOrder     = asc | desc
page          = integer (default: 1)
limit         = 1-100 (default: 25)
```

### Buyers
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/buyers` | ✅ | List buyers |
| GET | `/api/buyers/:id` | ✅ | Get single buyer |
| GET | `/api/buyers/match?leadId=` | ✅ | Match buyers to a lead |
| POST | `/api/buyers` | ✅ | Create buyer |
| PATCH | `/api/buyers/:id` | ✅ | Update buyer |
| DELETE | `/api/buyers/:id` | ✅ | Delete buyer |

### Interactions (ML feedback loop)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/interactions` | ✅ | Record interaction (triggers rescoring) |
| GET | `/api/interactions/lead/:leadId` | ✅ | Get lead's interaction history |

### Probate Scanner
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/probate/scan` | ✅ | Extract probate case from PDF text |
| GET | `/api/probate/:id` | ✅ | Get probate case |

### Automations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/automations` | ✅ | List automations |
| GET | `/api/automations/:id` | ✅ | Get automation |
| POST | `/api/automations` | ✅ | Create automation |
| PATCH | `/api/automations/:id` | ✅ | Update automation |
| DELETE | `/api/automations/:id` | ✅ | Delete automation |

### ML Retraining
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/retraining/run` | ✅ Admin | Manually trigger retraining loop |

---

## Scoring engine

Three-dimension model that adapts per operator:

| Dimension | Default weight | Signals |
|-----------|---------------|---------|
| Deal score | 40% | ARV, repairs, asking price, 70% rule |
| Motivation score | 40% | Source, condition, response patterns, appointments |
| Urgency score | 20% | Contract status, days since contact, follow-ups |

The retraining loop adjusts weights using gradient descent on your operator's
historical closed/lost leads. Minimum 20 samples required. Never regresses accuracy.

---

## Rate limits

| Endpoint group | Limit |
|----------------|-------|
| Global | 60 req/min per IP |
| Auth | 10 req/min per IP |
| AI (score, scan, match) | 20 req/min per operator |
| Send (SMS, email) | 30 req/hour per operator |

Limits are Redis-backed (sliding window) when Redis is available,
and in-memory when Redis is disabled.

---

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 422 | Request payload failed Zod schema |
| `UNAUTHORIZED` | 401 | Missing or invalid Firebase token |
| `FORBIDDEN` | 403 | Token valid but access denied |
| `NOT_FOUND` | 404 | Resource does not exist or belongs to another operator |
| `CONFLICT` | 409 | Resource already exists (duplicate) |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `PAYLOAD_TOO_LARGE` | 413 | Body exceeds 5MB limit |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `EXTERNAL_API_ERROR` | 502 | Gemini / SendGrid failure |
| `CIRCUIT_OPEN` | 503 | External service temporarily unavailable |

---

## Running tests

```bash
# All tests
pnpm test

# Unit only
pnpm test:unit

# Integration only
pnpm test:integration

# With coverage (fails below 80%)
pnpm test:coverage
```

---

## Docker

```bash
# Build
docker build -f apps/streamline/Dockerfile -t streamline-api .

# Run locally
docker run -p 8080:8080 --env-file .env streamline-api

# Full dev stack
docker-compose up
```

---

## Deploy to Cloud Run

```bash
export GCP_PROJECT_ID=your-project-id
./apps/streamline/scripts/gcp-deploy.sh staging
./apps/streamline/scripts/gcp-deploy.sh production
```

Requires:
1. `gcloud` CLI authenticated
2. Secret Manager secrets created (see `.env.example`)
3. Cloud Run API enabled
4. Artifact Registry or GCR enabled
