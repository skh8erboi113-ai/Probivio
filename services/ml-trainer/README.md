# ML Trainer

Python 3.12 service that trains the Streamline lead-scoring model.

Runs as a **Cloud Run Job** (not a service — no HTTP endpoint). Triggered by Cloud Scheduler nightly, or manually via `gcloud run jobs execute`.

## What it does

1. Pulls training data from Firestore (`score_history` + terminal-status leads)
2. Engineers ~40 features per sample (deal financials, motivation signals, interaction patterns, temporal features)
3. Trains an **XGBoost binary classifier** (won vs lost)
4. Validates on hold-out set — refuses to publish if AUC < previous version
5. Exports to ONNX format
6. Uploads to Cloud Storage bucket
7. Updates `scoring_weights/{operatorId}` document with model metadata

The Node API polls the metadata document and hot-loads new ONNX models without redeploy.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Point at a service account with Firestore + GCS access
export GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json

# Train for a specific operator
python -m ml_trainer.train --operator=<uid> --min-samples=50

# Train all operators (as Cloud Run Job would)
python -m ml_trainer.train --all --min-samples=50
```

## Deployment

Build image and push to Artifact Registry:

```bash
./scripts/deploy-trainer-job.sh
```

## Model artifacts

Stored in Cloud Storage at:

```
gs://<bucket>/models/{operatorId}/{version}.onnx
gs://<bucket>/models/{operatorId}/{version}.metadata.json
```

Metadata includes feature list, training params, hold-out metrics.
