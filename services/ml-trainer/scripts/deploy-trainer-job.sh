#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID required}"
REGION="${GCP_REGION:-us-central1}"
BUCKET="${MODEL_ARTIFACTS_BUCKET:?MODEL_ARTIFACTS_BUCKET required}"
SERVICE_ACCOUNT="${TRAINER_SERVICE_ACCOUNT:?TRAINER_SERVICE_ACCOUNT required}"

IMAGE="gcr.io/${PROJECT_ID}/ml-trainer:latest"
JOB_NAME="streamline-ml-trainer"

echo "→ Building and pushing image: ${IMAGE}"
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --tag "${IMAGE}" \
  .

echo "→ Ensuring GCS bucket exists: gs://${BUCKET}"
gsutil mb -p "${PROJECT_ID}" -l "${REGION}" "gs://${BUCKET}" 2>/dev/null || echo "  (bucket already exists)"

echo "→ Deploying Cloud Run Job: ${JOB_NAME}"

gcloud run jobs delete "${JOB_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --quiet 2>/dev/null || true

gcloud run jobs create "${JOB_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --memory=2Gi \
  --cpu=2 \
  --task-timeout=1800 \
  --max-retries=1 \
  --parallelism=1 \
  --set-env-vars="FIREBASE_PROJECT_ID=${PROJECT_ID},MODEL_ARTIFACTS_BUCKET=${BUCKET},MIN_SAMPLES=50,MIN_AUC_TO_PUBLISH=0.60" \
  --args="--all"

echo "✓ Job deployed. Execute manually with:"
echo "  gcloud run jobs execute ${JOB_NAME} --region=${REGION}"
