#!/usr/bin/env bash
# =============================================================================
# One-command Cloud Run deployment for Streamline Probate Engine
# Usage: ./scripts/gcp-deploy.sh [environment]
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ─── Config ───────────────────────────────────────────────────────────────────
ENVIRONMENT="${1:-staging}"
PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID env var is required}"
SERVICE_NAME="streamline-api"
REGION="${GCP_REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE_TAG="${IMAGE_NAME}:${GIT_SHA}"
IMAGE_LATEST="${IMAGE_NAME}:latest"

# ─── Validation ───────────────────────────────────────────────────────────────
validate_environment() {
  echo "▶ Validating environment..."
  if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❌ Invalid environment: $ENVIRONMENT (must be staging or production)"
    exit 1
  fi

  if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not installed"
    exit 1
  fi

  if ! command -v docker &> /dev/null; then
    echo "❌ docker not installed"
    exit 1
  fi

  echo "✅ Environment: $ENVIRONMENT"
  echo "✅ Project: $PROJECT_ID"
  echo "✅ Region: $REGION"
  echo "✅ Image: $IMAGE_TAG"
}

# ─── Build ────────────────────────────────────────────────────────────────────
build_image() {
  echo ""
  echo "▶ Building Docker image..."
  docker build \
    --target production \
    --platform linux/amd64 \
    --build-arg GIT_SHA="${GIT_SHA}" \
    --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -f apps/streamline/Dockerfile \
    -t "${IMAGE_TAG}" \
    -t "${IMAGE_LATEST}" \
    --cache-from "${IMAGE_LATEST}" \
    .
  echo "✅ Image built: ${IMAGE_TAG}"
}

# ─── Push ─────────────────────────────────────────────────────────────────────
push_image() {
  echo ""
  echo "▶ Authenticating with GCR..."
  gcloud auth configure-docker --quiet

  echo "▶ Pushing image..."
  docker push "${IMAGE_TAG}"
  docker push "${IMAGE_LATEST}"
  echo "✅ Image pushed"
}

# ─── Secrets ──────────────────────────────────────────────────────────────────
build_secret_flags() {
  local secrets=(
    "FIREBASE_PROJECT_ID=firebase-project-id:latest"
    "FIREBASE_CLIENT_EMAIL=firebase-client-email:latest"
    "FIREBASE_PRIVATE_KEY=firebase-private-key:latest"
    "JWT_SECRET=jwt-secret:latest"
    "SESSION_SECRET=session-secret:latest"
  )

  # Optional secrets — only include if they exist in Secret Manager
  local optional_secrets=(
    "GEMINI_API_KEY=gemini-api-key:latest"
    "TWILIO_ACCOUNT_SID=twilio-account-sid:latest"
    "TWILIO_AUTH_TOKEN=twilio-auth-token:latest"
    "TWILIO_FROM_NUMBER=twilio-from-number:latest"
    "SENDGRID_API_KEY=sendgrid-api-key:latest"
    "SENDGRID_FROM_EMAIL=sendgrid-from-email:latest"
    "REDIS_URL=redis-url:latest"
    "SENTRY_DSN=sentry-dsn:latest"
  )

  local flags="--set-secrets"
  local secret_pairs=()
  for s in "${secrets[@]}"; do
    secret_pairs+=("${s}")
  done

  for s in "${optional_secrets[@]}"; do
    local secret_name="${s#*=}"
    local secret_key="${secret_name%:*}"
    if gcloud secrets describe "${secret_key}" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
      secret_pairs+=("${s}")
    fi
  done

  echo "${flags} $(IFS=,; echo "${secret_pairs[*]}")"
}

# ─── Deploy ───────────────────────────────────────────────────────────────────
deploy() {
  echo ""
  echo "▶ Deploying to Cloud Run (${ENVIRONMENT})..."

  local min_instances=1
  local max_instances=5
  local memory="1Gi"
  local cpu="1"

  if [[ "$ENVIRONMENT" == "production" ]]; then
    min_instances=2
    max_instances=10
    memory="2Gi"
    cpu="2"
  fi

  local secret_flags
  secret_flags=$(build_secret_flags)

  # shellcheck disable=SC2086
  gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_TAG}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --platform managed \
    --min-instances "${min_instances}" \
    --max-instances "${max_instances}" \
    --memory "${memory}" \
    --cpu "${cpu}" \
    --port 8080 \
    --timeout 60s \
    --concurrency 80 \
    --allow-unauthenticated \
    --set-env-vars "NODE_ENV=${ENVIRONMENT},APP_VERSION=${GIT_SHA}" \
    ${secret_flags} \
    --quiet

  echo "✅ Deployment complete"
}

# ─── Verify ───────────────────────────────────────────────────────────────────
verify() {
  echo ""
  echo "▶ Verifying deployment..."
  local service_url
  service_url=$(gcloud run services describe "${SERVICE_NAME}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format "value(status.url)")

  echo "▶ Service URL: ${service_url}"

  local max_attempts=10
  local attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    local http_status
    http_status=$(curl -s -o /dev/null -w "%{http_code}" "${service_url}/health" || echo "000")

    if [[ "$http_status" == "200" ]]; then
      echo "✅ Health check passed (HTTP ${http_status})"
      echo ""
      echo "🚀 Deployment successful!"
      echo "   Environment : ${ENVIRONMENT}"
      echo "   Image       : ${IMAGE_TAG}"
      echo "   URL         : ${service_url}"
      return 0
    fi

    echo "   Attempt ${attempt}/${max_attempts} — HTTP ${http_status}, retrying in 5s..."
    sleep 5
    ((attempt++))
  done

  echo "❌ Health check failed after ${max_attempts} attempts"
  exit 1
}

# ─── Production confirmation ──────────────────────────────────────────────────
confirm_production() {
  if [[ "$ENVIRONMENT" == "production" ]]; then
    echo ""
    echo "⚠️  You are deploying to PRODUCTION"
    echo "   Project: ${PROJECT_ID}"
    echo "   Image:   ${IMAGE_TAG}"
    echo ""
    read -rp "Type 'deploy' to confirm: " confirmation
    if [[ "$confirmation" != "deploy" ]]; then
      echo "Aborted."
      exit 0
    fi
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo "============================================"
  echo " Streamline Probate Engine — GCP Deploy"
  echo "============================================"

  validate_environment
  confirm_production
  build_image
  push_image
  deploy
  verify
}

main "$@"
