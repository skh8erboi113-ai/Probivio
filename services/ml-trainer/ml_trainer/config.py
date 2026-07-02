"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class TrainerConfig:
    """Immutable trainer configuration."""

    firebase_project_id: str
    gcs_bucket: str
    min_samples_for_training: int
    validation_split: float
    min_auc_to_publish: float

    @classmethod
    def from_env(cls) -> TrainerConfig:
        project = os.environ.get("FIREBASE_PROJECT_ID")
        if not project:
            raise RuntimeError("FIREBASE_PROJECT_ID env var required")

        bucket = os.environ.get("MODEL_ARTIFACTS_BUCKET")
        if not bucket:
            raise RuntimeError("MODEL_ARTIFACTS_BUCKET env var required")

        return cls(
            firebase_project_id=project,
            gcs_bucket=bucket,
            min_samples_for_training=int(os.environ.get("MIN_SAMPLES", "50")),
            validation_split=float(os.environ.get("VALIDATION_SPLIT", "0.2")),
            min_auc_to_publish=float(os.environ.get("MIN_AUC_TO_PUBLISH", "0.60")),
        )
