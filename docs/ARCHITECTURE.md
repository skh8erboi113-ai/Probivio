# Architecture

Complete system design for Streamline v2.0.

---

## High-level topology

    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │   Browser    │─────▶│  Cloud CDN   │─────▶│  Cloud Run   │
    │  (React SPA) │      │   (Static)   │      │   (API)      │
    └──────────────┘      └──────────────┘      └──────┬───────┘
                                                       │
                          ┌────────────────────────────┼────────────────────────┐
                          │                            │                        │
                          ▼                            ▼                        ▼
                    ┌──────────┐              ┌──────────────┐          ┌──────────────┐
                    │Firestore │              │    Redis     │          │Secret Manager│
                    │(Primary) │              │  (Cache/RL)  │          │              │
                    └──────────┘              └──────────────┘          └──────────────┘
                          │
                          │
                          ▼
                    ┌────────────────────────────────────────────┐
                    │ External APIs                              │
                    │   Gemini · SendGrid · Skip Trace            │
                    └────────────────────────────────────────────┘

---

## Modular monolith

Streamline is deliberately a **modular monolith** rather than microservices:

- **Faster iteration** — no distributed transaction complexity
- **Cheaper hosting** — one container instead of many
- **Simpler debugging** — one process, one log stream
- **Extractable later** — clean module boundaries mean any module can be lifted out when scale demands it

### Module boundaries

Every module has:
- Its own **route file** in `apps/streamline/src/routes/`
- Its own **service** in `apps/streamline/src/services/`
- Its own **repository** in `packages/db/src/`
- Its own **validators** in `packages/validators/src/`
- Its own **types** in `packages/types/src/`

No module imports from another module's internals. All cross-module communication goes through the public service interface.

---

## Request lifecycle

    1. Cloud CDN terminates TLS
    2. Cloud Run receives HTTP request
    3. Express middleware stack:
       a. Sentry request handler (start trace)
       b. Request context (assign correlation ID, wrap in AsyncLocalStorage)
       c. Helmet (security headers)
       d. CORS (origin allowlist)
       e. Compression (gzip if >1KB)
       f. Body parser (5MB limit)
       g. Sanitizer (strip control chars, null bytes)
       h. Rate limiter (Redis sliding window)
       i. Request logger
    4. Route handler:
       a. Auth middleware (verify Firebase JWT + revocation check)
       b. Validator middleware (Zod schema parse)
       c. Handler function (thin — delegates to service)
    5. Service layer:
       a. Business logic
       b. Repository calls (with operator isolation)
       c. External API calls (via circuit breakers)
    6. Response envelope construction
    7. Sentry response capture (if error)
    8. Cloud Logging structured log emit

---

## Data flow: Lead creation → scoring → matching

    ┌─────────────┐
    │   Client    │
    │  POST /leads│
    └──────┬──────┘
           │
           ▼
    ┌──────────────┐
    │ leads.routes │
    │  validate()  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐        ┌──────────────┐
    │  leadRepo    │───────▶│  Firestore   │
    │  create()    │        │   leads/     │
    └──────┬───────┘        └──────────────┘
           │
           │ (returns Lead with id)
           │
           ▼
    ┌───────────────┐
    │ Fire-and-     │
    │ forget:       │
    │ scoreLead()   │
    └──────┬────────┘
           │
           ▼
    ┌───────────────┐        ┌──────────────┐
    │ interactionRepo│──────▶│  Firestore   │
    │ .computeFeatures│      │ interactions/│
    └──────┬────────┘        └──────────────┘
           │
           ▼
    ┌───────────────┐        ┌──────────────┐
    │  weightsRepo  │──────▶│  Firestore   │
    │  .getCurrent  │        │scoring_weights│
    └──────┬────────┘        └──────────────┘
           │
           ▼
    ┌───────────────┐
    │  Deterministic │
    │  scoring math  │
    │  (deal +       │
    │   motivation + │
    │   urgency)     │
    └──────┬────────┘
           │
           ▼
    ┌───────────────┐        ┌──────────────┐
    │   Gemini      │──────▶│   Circuit    │
    │  explanation  │        │   Breaker    │
    └──────┬────────┘        └──────────────┘
           │
           ▼
    ┌───────────────┐        ┌──────────────┐
    │  leadRepo     │──────▶│  Firestore   │
    │  .applyScore  │        │   leads/     │
    └──────┬────────┘        └──────────────┘
           │
           ▼
    ┌────────────────┐        ┌──────────────┐
    │scoreHistoryRepo│──────▶│  Firestore   │
    │    .record     │        │score_history/│
    └────────────────┘        └──────────────┘

---

## The learning loop

    Day-to-day usage:
    ┌────────────┐  writes  ┌──────────────┐
    │ Operator   │─────────▶│ Interactions │
    │ Actions    │          │ (append-only)│
    └────────────┘          └──────────────┘
                                    │
                                    │ triggers rescoring
                                    ▼
                            ┌──────────────┐
                            │Score History │
                            │  (versioned) │
                            └──────────────┘

    Nightly:
    ┌────────────┐          ┌──────────────┐
    │  Cloud     │──────────▶│ /scheduler/  │
    │ Scheduler  │  invoke  │ retrain-all  │
    └────────────┘          └──────┬───────┘
                                   │
                                   ▼
                            ┌──────────────┐
                            │ Retraining   │
                            │ Service      │
                            └──────┬───────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
            ┌──────────┐  ┌──────────────┐  ┌──────────────┐
            │Load score│  │  Gradient    │  │ Guard-rail:  │
            │ history  │─▶│  descent on  │─▶│ reject if    │
            │(cursor-  │  │  weights     │  │ accuracy     │
            │paginated)│  │              │  │ regressed    │
            └──────────┘  └──────────────┘  └──────┬───────┘
                                                   │ (if accepted)
                                                   ▼
                                            ┌──────────────┐
                                            │  Persist new │
                                            │  weights     │
                                            │  version     │
                                            └──────────────┘

---

## Security architecture

**Defense in depth — three layers:**

1. **Network layer** — Cloud Run HTTPS, HSTS, CDN DDoS protection
2. **Application layer** — Helmet, CORS, rate limiting, JWT auth, input validation
3. **Data layer** — Firestore Row-Level Security enforced on every query, plus application-level operator isolation check

Even if a bug bypasses application auth, the Firestore rules block cross-tenant queries at the database.

Even if an operator gets a JWT for someone else's account, the `operatorId` comparison in `BaseRepository.findById` blocks the read.

---

## Pagination

All list endpoints (`GET /api/leads`, `/api/buyers`, `/api/agent/decisions`) use **cursor-based
pagination**, not offset/page-number pagination.

**Why:** Firestore's `.offset(N)` still reads and discards all N preceding documents server-side
on every request — cost and latency both grow linearly with how deep a client pages in, even
though it only returns `limit` documents. At `.offset(1000)` you're billed for and waiting on
1000 document reads to get 25 results back.

**How it works:** every list response includes `pagination.nextCursor` — an opaque, base64url-
encoded token capturing the sort field's value and document ID of the last item on the page.
Pass it back as `?cursor=...` to fetch the next page. Internally this becomes a Firestore
`startAfter(sortValue, documentId)` compound cursor (the document ID is included so pagination
stays stable even when many documents share the same sort-field value). Cost and latency are
`O(limit)` regardless of how many pages a client has already fetched.

**Trade-off:** pagination is forward-only — there's no "jump to page 50." Every list UI in this
app only ever needs Prev/Next (see `LeadsPage.tsx`, which keeps a client-side stack of visited
cursors to support the Prev button), so this has been a fine trade in practice. If arbitrary
page-jump is ever needed, that's a sign the UI wants a search/filter affordance instead of deep
pagination — Firestore just isn't built for offset-style random access at scale.

---

## Scaling strategy

**Vertical scaling limits:**
- Firestore: no practical limit (Google-managed)
- Cloud Run: 1000 concurrent requests per instance
- Redis: 300k ops/sec on Basic tier

**Horizontal scaling:**
- Cloud Run autoscales 1 → 10 instances (configurable to 1000)
- Rate limiter uses Redis so all instances share state
- No sticky sessions needed (stateless API)

**When to shard:**
- Redis: Move to cluster mode when >100k ops/sec sustained
- Firestore: Consider partition keys when a single collection exceeds 10M docs
- Cloud Run: Split into per-service Cloud Runs when p99 latency degrades

**When to extract to microservices:**
- Retraining service — long-running CPU work would benefit from dedicated compute
- PDF parsing — spikes could benefit from dedicated queue
- Automation engine — evolving requirements suggest separation
