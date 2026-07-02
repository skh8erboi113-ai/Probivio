#!/usr/bin/env bash
set -euo pipefail

# Creates Cloud Scheduler jobs for periodic Streamline workloads.
# Prereqs: gcloud CLI authenticated; scheduler API enabled.

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID required}"
REGION="${GCP_REGION:-us-central1}"
API_URL="${STREAMLINE_API_URL:?STREAMLINE_API_URL required}"
SCHEDULER_SECRET="${SCHEDULER_SHARED_SECRET:?SCHEDULER_SHARED_SECRET required}"
SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT:?SCHEDULER_SERVICE_ACCOUNT required}"

echo "→ Creating Cloud Scheduler jobs in $PROJECT_ID / $REGION"

# Nightly retraining sweep — 3:00 AM UTC daily
gcloud scheduler jobs create http streamline-retrain-nightly \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --uri="${API_URL}/scheduler/retrain-all" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-Scheduler-Secret=${SCHEDULER_SECRET}" \
  --message-body='{"operatorIds":[]}' \
  --oidc-service-account-email="$SERVICE_ACCOUNT" \
  --attempt-deadline=15m \
  || echo "  (job already exists — use jobs update to modify)"

# Stale-lead sweep — every 6 hours
gcloud scheduler jobs create http streamline-stale-leads \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --schedule="0 */6 * * *" \
  --time-zone="UTC" \
  --uri="${API_URL}/scheduler/stale-lead-sweep" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-Scheduler-Secret=${SCHEDULER_SECRET}" \
  --message-body='{"daysThreshold":14}' \
  --oidc-service-account-email="$SERVICE_ACCOUNT" \
  --attempt-deadline=10m \
  || echo "  (job already exists — use jobs update to modify)"

echo "✓ Cloud Scheduler jobs configured"
