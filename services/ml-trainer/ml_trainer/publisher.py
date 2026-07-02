"""Uploads trained models to GCS + updates Firestore metadata."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore, storage

from ml_trainer.model import TrainingResult

logger = logging.getLogger(__name__)


class ModelPublisher:
    """Publishes model artifacts to GCS and metadata to Firestore."""

    def __init__(
        self,
        db: firestore.Client,
        storage_client: storage.Client,
        bucket_name: str,
        min_auc_to_publish: float,
    ) -> None:
        self.db = db
        self.storage_client = storage_client
        self.bucket = storage_client.bucket(bucket_name)
        self.min_auc_to_publish = min_auc_to_publish

    def publish(
        self,
        operator_id: str,
        result: TrainingResult,
    ) -> str | None:
        """Publish model if it clears the AUC bar. Returns version string or None."""

        # Guardrail 1: absolute minimum AUC
        if result.auc < self.min_auc_to_publish:
            logger.warning(
                "AUC %.3f below minimum %.3f — refusing to publish",
                result.auc,
                self.min_auc_to_publish,
            )
            return None

        # Guardrail 2: don't regress from current
        current_meta = self._load_current_metadata(operator_id)
        current_auc = current_meta.get("auc", 0.0) if current_meta else 0.0

        if result.auc < current_auc - 0.02:  # 2% degradation tolerance
            logger.warning(
                "AUC regression: current=%.3f, new=%.3f — refusing to publish",
                current_auc,
                result.auc,
            )
            return None

        # Generate version string
        version = datetime.now(timezone.utc).strftime("v%Y%m%d-%H%M%S")

        # Upload ONNX to GCS
        model_blob_name = f"models/{operator_id}/{version}.onnx"
        model_blob = self.bucket.blob(model_blob_name)
        model_blob.upload_from_string(
            result.model_bytes,
            content_type="application/octet-stream",
        )
        model_url = f"gs://{self.bucket.name}/{model_blob_name}"

        # Upload metadata
        metadata = {
            "version": version,
            "modelUrl": model_url,
            "trainedAt": datetime.now(timezone.utc).isoformat(),
            "auc": result.auc,
            "accuracy": result.accuracy,
            "f1": result.f1,
            "threshold": result.threshold,
            "trainingSize": result.training_size,
            "validationSize": result.validation_size,
            "positiveRate": result.positive_rate,
            "topFeatures": dict(list(result.feature_importances.items())[:10]),
        }
        metadata_blob = self.bucket.blob(f"models/{operator_id}/{version}.metadata.json")
        metadata_blob.upload_from_string(
            json.dumps(metadata, indent=2),
            content_type="application/json",
        )

        # Update Firestore pointer document so the API loads the new model
        self.db.collection("scoring_weights").document(operator_id).set(
            {
                **metadata,
                "modelType": "xgboost-onnx",
                "operatorId": operator_id,
            },
            merge=True,
        )

        logger.info(
            "Published model %s for operator %s (AUC=%.3f)",
            version,
            operator_id,
            result.auc,
        )

        return version

    def _load_current_metadata(self, operator_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("scoring_weights").document(operator_id).get()
        return doc.to_dict() if doc.exists else None
