# Operational Runbook

For on-call engineers. Diagnose and remediate common incidents.

---

## Service Level Objectives

| Metric              | SLO       | Alert threshold |
|---------------------|-----------|-----------------|
| Availability        | 99.9%     | < 99.5% over 5 min |
| API p95 latency     | < 500ms   | > 1000ms over 10 min |
| Scoring p95 latency | < 3000ms  | > 5000ms over 10 min |
| Error rate (5xx)    | < 0.1%    | > 1% over 5 min |
| Gemini circuit      | CLOSED    | HALF_OPEN or OPEN > 2 min |

---

## Incident: API returning 5xx errors

**Symptoms:** Error rate spike in Sentry / Cloud Monitoring.

**Diagnose:**

1. Check Cloud Run logs:

       gcloud run services logs read streamline-api --region=us-central1 --limit=100

2. Check `/health` endpoint:

       curl https://api.yourdomain.com/health

3. Look at Sentry recent issues: https://sentry.io/organizations/YOUR_ORG/issues/

**Common causes:**

- **Firestore unreachable** → `/health` shows `firestore: down`. Check GCP status page.
- **Redis unreachable** → `/health` shows `redis: degraded`. Rate limiter falls back to in-memory; not a service-affecting issue.
- **Gemini circuit OPEN** → Scoring endpoints degraded but service still runs. Wait 30s for HALF_OPEN probe.

**Remediate:**

- Rolling restart: `gcloud run services update streamline-api --region=us-central1 --no-traffic` then re-enable
- Roll back to prior revision: `gcloud run services update-traffic streamline-api --to-revisions=PREV_REV=100`

---

## Incident: Rate limiter blocking legitimate traffic

**Symptoms:** Users report 429s. `rl:*` Redis keys show high counts.

**Diagnose:**

1. Confirm which limiter tier is triggering:

       # Check Cloud Run logs for the operator ID
       gcloud run services logs read streamline-api \
         --region=us-central1 \
         --limit=50 \
         | grep "Rate limit hit"

**Remediate:**

- **Temporary bypass** (nuclear option — do NOT use in prod without approval):

       # Flush all rate limit keys
       redis-cli -h <redis-host> --scan --pattern "rl:*" | xargs redis-cli -h <redis-host> del

- **Increase specific tier** in `apps/streamline/src/middleware/rate-limit.ts`, redeploy.

---

## Incident: Scoring engine returning garbage

**Symptoms:** All scores clustering around same value, or explanations nonsensical.

**Diagnose:**

1. Check Gemini circuit:

       curl https://api.yourdomain.com/health | jq .checks.gemini

2. Check recent score history for an affected lead:

       # In Firestore console, query score_history where leadId == '...'
       # Look for scoreConfidence field — should be > 0.5

3. Check model version:

       # Query scoring_weights collection for the operator
       # Compare version + trainedAt with prior known-good

**Remediate:**

- **Force rescore** to bypass cached explanation:

       curl -X POST https://api.yourdomain.com/api/leads/LEAD_ID/score \
         -H "Authorization: Bearer $TOKEN"

- **Roll back model weights** manually in Firestore console (edit `scoring_weights/{operatorId}` back to a prior version).

- **Retrain from clean state:**

       # Delete the operator's scoring_weights document to fall back to defaults
       # Then trigger retraining:
       curl -X POST https://api.yourdomain.com/scheduler/retrain-all \
         -H "X-Scheduler-Secret: $SCHEDULER_SHARED_SECRET" \
         -d '{"operatorIds":["OPERATOR_ID"]}'

---

## Incident: SendGrid delivery failures

**Symptoms:** Interactions with `type: email_sent` failing; operators complain emails not received.

**Diagnose:**

1. Check circuit state in logs (search for `Circuit breaker state change`).
2. Check SendGrid activity: https://app.sendgrid.com/email_activity
3. Check `agent_decision_logs` for `blockedReason: execution_error` entries — this means Gemini
   decided to send but the SendGrid call itself failed.

**Remediate:**

- **Daily email cap block** (`blockedReason: daily_email_cap_reached`) is NOT an incident — it's
  the guardrail working as designed. Adjust `AUTOMATION_MAX_EMAILS_PER_LEAD_PER_DAY` if too strict.
- **SendGrid account issue** → check SendGrid status page; while blocked, `sendgrid.enabled` will
  read false in `/health` once credentials are pulled, and the agent will simply skip `send_email`
  decisions (guardrail returns `no_email_on_file`/`execution_error` rather than crashing).

---

## Incident: Retraining causing score regressions

**Symptoms:** After nightly retraining, lead scores swing wildly.

**Guardrail:** The retraining service **already refuses** to accept a model with worse accuracy than the current one. If regressions are happening, the guardrail may have been bypassed.

**Diagnose:**

1. Check `scoring_weights/{operatorId}` history in Firestore.
2. Look at `validationAccuracy` field over recent versions.

**Remediate:**

- **Disable retraining flag:** Set `ENABLE_ML_RETRAINING=false` in Cloud Run env, redeploy.
- **Revert weights** by editing Firestore directly.

---

## Runbook: Data export for a single operator (GDPR / offboarding)

Requires manual script — not automated (intentional friction for data safety).

    # Export all operator data as JSON
    node scripts/export-operator-data.js --operator-id=OPERATOR_ID --output=./export.json

---

## Runbook: Add a new integration

1. Add config to `packages/validators/src/env.schema.ts`
2. Add config accessor to `apps/streamline/src/config/config.ts`
3. Create service at `apps/streamline/src/services/YOUR_SERVICE.service.ts`:
   - Wrap in `CircuitBreaker`
   - Use `retryWithBackoff` for calls
   - Log with `logger.child({ service: 'YOUR_SERVICE' })`
4. Wire into DI container: `apps/streamline/src/container.ts`
5. Add health check to `apps/streamline/src/routes/health.routes.ts`
6. Add unit tests

---

## Escalation

| Severity | Response time | Channel |
|----------|---------------|---------|
| P0 (data loss) | 15 min | PagerDuty → CTO |
| P1 (service down) | 30 min | PagerDuty → on-call |
| P2 (degraded) | 2 hours | Slack #incidents |
| P3 (minor) | Next business day | GitHub issue |

---

## Useful commands

    # Tail logs
    gcloud run services logs tail streamline-api --region=us-central1

    # Recent errors only
    gcloud run services logs read streamline-api \
      --region=us-central1 \
      --filter="severity>=ERROR" \
      --limit=50

    # Traffic split for canary deploys
    gcloud run services update-traffic streamline-api \
      --to-revisions=NEW_REV=10,CURRENT_REV=90 \
      --region=us-central1

    # Rollback
    gcloud run services update-traffic streamline-api \
      --to-revisions=PREV_REV=100 \
      --region=us-central1
