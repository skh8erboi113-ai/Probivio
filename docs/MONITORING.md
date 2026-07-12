# Monitoring Setup

Cloud Monitoring queries + alert policies for Streamline.

---

## Recommended dashboards

### Dashboard: API Health

**Metrics:**

    resource.type="cloud_run_revision"
    resource.labels.service_name="streamline-api"
    metric.type="run.googleapis.com/request_count"

Group by: `metric.labels.response_code_class`

**Panels:**

1. **Request rate** — sum(rate(request_count))
2. **Error rate** — sum(rate(request_count{response_code_class="5xx"})) / sum(rate(request_count))
3. **p95 latency** — histogram_percentile(0.95, request_latencies)
4. **Container instance count** — instance_count

---

## Alert policies

### Alert: High error rate

    condition:
      threshold: 0.01  (1%)
      duration: 300s   (5 min)
      metric: 5xx_ratio

    notification: PagerDuty on-call

    documentation: |
      Elevated 5xx rate. Check Sentry recent issues:
      https://sentry.io/organizations/YOUR_ORG/issues/

      Common causes:
      - Firestore quota exhausted
      - Gemini circuit open
      - Redis unreachable (rate limiter degraded)

### Alert: p95 latency SLO breach

    condition:
      threshold: 1000  (ms)
      duration: 600s   (10 min)
      metric: request_latencies_p95

    notification: Slack #incidents

### Alert: Cold-start rate elevated

    condition:
      threshold: 5%
      duration: 300s
      metric: instance_startup_count / request_count

    documentation: |
      Cold starts detected. Verify min-instances=1 is set.

### Alert: Firestore quota approaching

    condition:
      threshold: 80%
      duration: 900s   (15 min)
      metric: firestore.googleapis.com/api/request_count

    documentation: |
      Approaching Firestore daily quota. Consider:
      - Adding cache layer
      - Reviewing recent query patterns
      - Upgrading tier

---

## Log-based metrics

Create these custom metrics in Cloud Logging for granular monitoring:

### Metric: Circuit breaker state changes

    resource.type="cloud_run_revision"
    jsonPayload.message="Circuit breaker state change"

Extract labels:
- `service` → jsonPayload.circuit
- `from` → jsonPayload.from
- `to` → jsonPayload.to

Alert when `to=OPEN` fires more than 3 times in 10 minutes.

### Metric: Rate limit hits

    resource.type="cloud_run_revision"
    jsonPayload.message="Rate limit hit"

Extract labels:
- `route` → jsonPayload.route
- `operatorId` → jsonPayload.operatorId

Alert when a single operator triggers > 100 rate limits per hour (potential abuse).

### Metric: Agent decisions blocked by guardrails

    resource.type="cloud_run_revision"
    jsonPayload.message="Agent decision logged"
    jsonPayload.executed=false

Trend this over time. Sudden spikes indicate either a misconfigured guardrail (e.g. email cap set
too low) or Gemini consistently proposing actions outside the whitelist (check `blockedReason` —
anything other than `daily_email_cap_reached` / `no_email_on_file` / `ai_may_not_close_deals`
warrants investigation).

### Metric: Scoring latency

    resource.type="cloud_run_revision"
    jsonPayload.message="Lead scored"

Extract:
- `durationMs` → jsonPayload.durationMs
- `composite` → jsonPayload.composite

Plot distribution to catch regressions in scoring performance.

---

## Sentry configuration

**Recommended settings:**

    Environment: production
    Release: <GIT_SHA> (set via CI)
    Traces sample rate: 0.1
    Profiles sample rate: 0.1

**Recommended alerts:**

1. New issue → Slack immediately
2. Regression (previously resolved issue reappears) → PagerDuty
3. Issue affecting > 100 users in 1 hour → PagerDuty
4. Any issue tagged `critical` → PagerDuty

**Ignored errors** (add to Sentry inbound filter):

- `UnauthorizedError` — expected client errors
- `ValidationError` — expected client errors
- `NotFoundError` — expected client errors
- `RateLimitError` — expected under load
- Any error with statusCode < 500
