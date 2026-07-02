#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID required}"
REGION="${GCP_REGION:-us-central1}"
QUEUE_NAME="${CLOUD_TASKS_QUEUE:-streamline-automation-queue}"

echo "→ Creating Cloud Tasks queue: $QUEUE_NAME in $PROJECT_ID / $REGION"

gcloud tasks queues create "$QUEUE_NAME" \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --max-attempts=5 \
  --max-retry-duration=3600s \
  --min-backoff=10s \
  --max-backoff=600s \
  --max-doublings=4 \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=100 \
  || echo "  (queue already exists — use queues update to modify)"

echo "✓ Cloud Tasks queue ready"
echo ""
echo "Add to your Cloud Run service env:"
echo "  CLOUD_TASKS_QUEUE=$QUEUE_NAME"
echo "  CLOUD_TASKS_LOCATION=$REGION"
echo "  CLOUD_TASKS_SERVICE_ACCOUNT=<your-sa-email>"
echo "  CLOUD_TASKS_SHARED_SECRET=<random-32-char-secret>"
