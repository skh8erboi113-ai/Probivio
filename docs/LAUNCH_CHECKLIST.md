# Launch Checklist

Complete before promoting to production. Every item is blocking.

---

## Code Quality

- [ ] All CI checks green on `main`
- [ ] Coverage ≥ 80% on packages/db, packages/validators, apps/streamline/services
- [ ] Zero ESLint warnings
- [ ] Zero TypeScript errors (`pnpm type-check`)
- [ ] No `TODO` or `FIXME` in production code paths
- [ ] No `console.log` outside of `packages/logger`
- [ ] No hardcoded secrets (CodeQL scan clean)
- [ ] Dependencies audited (`pnpm audit --audit-level=high` clean)

## AI Automation Agent (Gemini)

- [ ] `AUTOMATION_MAX_EMAILS_PER_LEAD_PER_DAY` set to a sane value (default 1)
- [ ] Confirmed the agent's action whitelist matches `agentActionSchema` exactly — no way for
      Gemini to invoke anything outside `send_email` / `add_tag` / `remove_tag` / `change_status`
      (never `closed_won`) / `schedule_follow_up` / `no_action`
- [ ] Spot-checked `agent_decision_logs` for a sample of operators — reasoning is coherent,
      no injected instructions leaking through from lead notes/interaction metadata
- [ ] Confirmed `/scheduler/agent-sweep` and `/tasks/evaluate-lead` reject requests without the
      shared secret header
- [ ] Ops alert wired for repeated `execution_error` blocked-reasons (signals a systemic issue,
      not just one bad decision)

## Security

- [ ] Firestore rules deployed and tested (cross-tenant queries denied)
- [ ] Firebase Auth JWT verification confirmed on every /api/* route
- [ ] All secrets in Google Secret Manager (not env vars in Cloud Run console)
- [ ] IAM roles principle-of-least-privilege verified for runtime service account
- [ ] CORS allowlist restricted to production origins only
- [ ] `NODE_ENV=production` set (verified in `/health` response)
- [ ] Sentry DSN configured (verify by throwing a test error)
- [ ] TCPA quiet-hours middleware active on send endpoints
- [ ] Rate limiters configured with Redis (not in-memory fallback)
- [ ] HTTPS-only on custom domain (HSTS enabled)

## Observability

- [ ] Cloud Monitoring alerts configured for:
  - [ ] Error rate > 1%
  - [ ] p95 latency > 1s
  - [ ] Circuit breaker state OPEN > 2 min
  - [ ] Firestore quota > 80%
  - [ ] Gemini quota > 80%
- [ ] Sentry release tracking wired to CI (GIT_SHA env var)
- [ ] Structured logs verified in Cloud Logging (JSON, not raw strings)
- [ ] Correlation IDs traced end-to-end (frontend → API → Firestore)
- [ ] Ops alerts channel tested (Telegram + Discord receive test message)

## Data

- [ ] Firestore backup schedule configured (daily, 30-day retention)
- [ ] TTL enabled on `idempotency_keys.expiresAt`
- [ ] Firestore indexes deployed (`firestore.indexes.json` synced)
- [ ] Test data seeded for smoke tests (see `scripts/seed-demo-data.ts`)
- [ ] Data export script tested for one operator
- [ ] Data deletion script tested (GDPR compliance)

## Integrations

- [ ] Gemini API key rotated from any dev key
- [ ] SendGrid domain authenticated (SPF + DKIM + DMARC)
- [ ] Sentry sample rate set to 0.1 in production
- [ ] Cloud Tasks queue live and processing a test task
- [ ] Cloud Scheduler jobs created and successfully invoking `/scheduler/*`

## Deployment

- [ ] Cloud Run min-instances = 1 (prevent cold starts on hot path)
- [ ] Cloud Run max-instances = 10 (or higher if capacity planned)
- [ ] Memory = 1 GiB, CPU = 1 (or scaled per load test results)
- [ ] Health check endpoint mapped to Cloud Run readiness probe
- [ ] Custom domain mapped and SSL cert issued
- [ ] Frontend deployed with SPA fallback rewrites
- [ ] Load balancer configured if multi-region

## Documentation

- [ ] `README.md` accurate (setup instructions verified on clean machine)
- [ ] `docs/DEPLOYMENT.md` verified end-to-end
- [ ] `docs/OPERATIONAL_RUNBOOK.md` reviewed by on-call rotation
- [ ] OpenAPI spec at `/docs` matches implemented endpoints
- [ ] Environment variables documented in `.env.example`

## Testing

- [ ] Full E2E happy path completed manually:
  - [ ] User signs up
  - [ ] User creates a lead
  - [ ] Lead is auto-scored
  - [ ] User uploads probate PDF
  - [ ] Probate case extracted and viewable
  - [ ] User adds buyer
  - [ ] Buyer matches shown on lead
  - [ ] User records interaction
  - [ ] Lead rescored based on interaction
  - [ ] User creates automation
  - [ ] Automation triggers on next event
- [ ] Load test passed (`pnpm test:load:baseline` meets thresholds)
- [ ] Chaos test — kill Redis, verify rate limiter degrades gracefully
- [ ] Chaos test — revoke Gemini key, verify circuit breaker opens then closes on recovery

## Legal & Compliance

- [ ] Terms of Service updated with data collection scope
- [ ] Privacy Policy updated with third-party data processors listed:
  - Google (Firebase, Gemini, Cloud Run)
  - SendGrid
  - Sentry
- [ ] CAN-SPAM compliance (unsubscribe link, physical address) verified for AI-generated emails
- [ ] DPA (Data Processing Agreement) signed with each processor
- [ ] Data retention policy documented and implemented

## Business

- [ ] Pricing configured in whatever billing system will exist
- [ ] Support email monitored
- [ ] Status page live (statuspage.io or equivalent)
- [ ] Customer onboarding docs published
- [ ] Rollback plan documented and rehearsed

---

## Sign-off

| Role         | Name       | Date       | Signature |
|--------------|------------|------------|-----------|
| Engineering  |            |            |           |
| Security     |            |            |           |
| Operations   |            |            |           |
| Product      |            |            |           |
