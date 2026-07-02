# Deployment Guide

Complete steps to deploy Streamline to Google Cloud Run in production.

---

## Prerequisites

- GCP project with billing enabled
- `gcloud` CLI installed and authenticated
- Domain name (optional but recommended)
- Firebase project linked to the GCP project

---

## 1. Enable required GCP APIs

    gcloud services enable \
      run.googleapis.com \
      cloudbuild.googleapis.com \
      secretmanager.googleapis.com \
      cloudtasks.googleapis.com \
      cloudscheduler.googleapis.com \
      firestore.googleapis.com \
      redis.googleapis.com \
      artifactregistry.googleapis.com

---

## 2. Create service accounts

**Streamline API runtime account:**

    gcloud iam service-accounts create streamline-api \
      --display-name="Streamline API Runtime"

    export SA_EMAIL="streamline-api@$(gcloud config get-value project).iam.gserviceaccount.com"

    # Grant only what's needed
    gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/datastore.user"

    gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor"

    gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/cloudtasks.enqueuer"

    gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/firebase.sdkAdminServiceAgent"

**Cloud Scheduler invoker:**

    gcloud iam service-accounts create scheduler-invoker \
      --display-name="Cloud Scheduler → Streamline invoker"

**Cloud Tasks invoker:**

    gcloud iam service-accounts create tasks-invoker \
      --display-name="Cloud Tasks → Streamline invoker"

---

## 3. Store secrets in Secret Manager

    echo -n "your-firebase-project-id" | gcloud secrets create firebase-project-id --data-file=-
    echo -n "firebase-adminsdk@..." | gcloud secrets create firebase-client-email --data-file=-
    cat firebase-private-key.pem | gcloud secrets create firebase-private-key --data-file=-
    echo -n "your-gemini-key" | gcloud secrets create gemini-api-key --data-file=-
    openssl rand -hex 32 | gcloud secrets create jwt-secret --data-file=-
    openssl rand -hex 32 | gcloud secrets create session-secret --data-file=-
    openssl rand -hex 32 | gcloud secrets create scheduler-shared-secret --data-file=-
    openssl rand -hex 32 | gcloud secrets create tasks-shared-secret --data-file=-

Grant runtime access:

    for SECRET in firebase-project-id firebase-client-email firebase-private-key gemini-api-key jwt-secret session-secret scheduler-shared-secret tasks-shared-secret; do
      gcloud secrets add-iam-policy-binding $SECRET \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/secretmanager.secretAccessor"
    done

---

## 4. Deploy Firestore rules and indexes

    export FIREBASE_PROJECT_ID="your-project-id"
    ./apps/streamline/scripts/setup-firestore-indexes.sh

Manually enable TTL in Firebase Console:
- Collection `idempotency_keys` → field `expiresAt`

---

## 5. Create Cloud Tasks queue

    export GCP_PROJECT_ID="your-project-id"
    export GCP_REGION="us-central1"
    ./apps/streamline/scripts/deploy-cloud-tasks-queue.sh

---

## 6. Provision Redis (Cloud Memorystore)

    gcloud redis instances create streamline-cache \
      --region=us-central1 \
      --size=1 \
      --tier=basic \
      --redis-version=redis_7_0

Capture the reserved IP for `REDIS_URL`:

    gcloud redis instances describe streamline-cache \
      --region=us-central1 \
      --format='value(host)'

Requires **Serverless VPC Access connector** for Cloud Run to reach it.

---

## 7. Build and deploy the API

    ./apps/streamline/scripts/gcp-deploy.sh

Or via the GitHub Actions `deploy.yml` workflow (triggered on push to `main`).

---

## 8. Set up Cloud Scheduler jobs

    export STREAMLINE_API_URL="https://streamline-api-xxxxx-uc.a.run.app"
    export SCHEDULER_SHARED_SECRET=$(gcloud secrets versions access latest --secret=scheduler-shared-secret)
    export SCHEDULER_SERVICE_ACCOUNT="scheduler-invoker@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

    ./apps/streamline/scripts/deploy-cloud-scheduler.sh

---

## 9. Deploy the frontend

**Option A — Firebase Hosting:**

    cd apps/web
    pnpm build
    firebase deploy --only hosting

**Option B — Any static host (Vercel, Netlify, S3):**

Build outputs to `apps/web/dist/`. Upload the directory as-is.

Configure your host to:
- Rewrite all routes to `/index.html` (SPA fallback)
- Set proper cache headers on `/assets/*` (immutable)

---

## 10. Custom domain (optional)

Map your domain to Cloud Run:

    gcloud beta run domain-mappings create \
      --service=streamline-api \
      --domain=api.yourdomain.com \
      --region=us-central1

Add the returned DNS records to your registrar.

Update CORS in production env:

    ALLOWED_ORIGINS=https://app.yourdomain.com

---

## Post-deployment verification

    # Health check
    curl https://api.yourdomain.com/health

    # Should return {"status":"ok",...}

    # API docs
    open https://api.yourdomain.com/docs
