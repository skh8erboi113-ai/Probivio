"""XGBoost model training + ONNX export."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
import xgboost as xgb
from onnxmltools.convert import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_recall_curve,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

from ml_trainer.features import FEATURE_NAMES, TrainingSample

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrainingResult:
    """Output of a training run."""

    model_bytes: bytes
    auc: float
    accuracy: float
    f1: float
    threshold: float  # Optimal probability threshold from PR curve
    training_size: int
    validation_size: int
    positive_rate: float
    feature_importances: dict[str, float]


class ModelTrainer:
    """Trains XGBoost binary classifier + exports to ONNX."""

    def __init__(self, validation_split: float = 0.2, random_seed: int = 42) -> None:
        self.validation_split = validation_split
        self.random_seed = random_seed

    def train(self, samples: list[TrainingSample]) -> TrainingResult:
        """Train on the provided samples. Returns model bytes + metrics."""
        if len(samples) < 20:
            raise ValueError(f"Need >=20 samples, got {len(samples)}")

        X = np.vstack([s.features for s in samples])
        y = np.array([s.label for s in samples], dtype=np.int32)

        pos_rate = float(y.mean())
        if pos_rate == 0.0 or pos_rate == 1.0:
            raise ValueError(f"Single-class dataset (positive_rate={pos_rate})")

        # Stratified split preserves class balance
        X_train, X_val, y_train, y_val = train_test_split(
            X,
            y,
            test_size=self.validation_split,
            random_state=self.random_seed,
            stratify=y,
        )

        logger.info(
            "Training: %d samples (positive_rate=%.2f), validation: %d",
            len(X_train),
            pos_rate,
            len(X_val),
        )

        # Handle imbalance via scale_pos_weight
        neg_count = int((y_train == 0).sum())
        pos_count = int((y_train == 1).sum())
        scale_pos_weight = neg_count / max(pos_count, 1)

        model = xgb.XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            min_child_weight=3,
            gamma=0.1,
            reg_alpha=0.1,
            reg_lambda=1.0,
            scale_pos_weight=scale_pos_weight,
            objective="binary:logistic",
            eval_metric="auc",
            tree_method="hist",
            random_state=self.random_seed,
            n_jobs=-1,
        )

        model.fit(
            X_train,
            y_train,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )

        # Evaluate on hold-out
        probs = model.predict_proba(X_val)[:, 1]

        auc = float(roc_auc_score(y_val, probs))
        threshold = self._optimal_threshold(y_val, probs)
        preds = (probs >= threshold).astype(int)
        accuracy = float(accuracy_score(y_val, preds))
        f1 = float(f1_score(y_val, preds, zero_division=0))

        logger.info(
            "Validation metrics: AUC=%.3f, threshold=%.3f, accuracy=%.3f, f1=%.3f",
            auc,
            threshold,
            accuracy,
            f1,
        )

        # Export to ONNX
        onnx_model = convert_xgboost(
            model,
            initial_types=[("input", FloatTensorType([None, len(FEATURE_NAMES)]))],
            target_opset=15,
        )
        model_bytes = onnx_model.SerializeToString()

        # Feature importances
        importance_dict = dict(zip(FEATURE_NAMES, model.feature_importances_, strict=True))
        importances = {
            name: float(imp)
            for name, imp in sorted(importance_dict.items(), key=lambda x: -x[1])
        }

        return TrainingResult(
            model_bytes=model_bytes,
            auc=auc,
            accuracy=accuracy,
            f1=f1,
            threshold=threshold,
            training_size=len(X_train),
            validation_size=len(X_val),
            positive_rate=pos_rate,
            feature_importances=importances,
        )

    def _optimal_threshold(self, y_true: np.ndarray, probs: np.ndarray) -> float:
        """Choose threshold that maximizes F1 on the validation set."""
        precision, recall, thresholds = precision_recall_curve(y_true, probs)
        # F1 for each threshold (skip last precision/recall value which has no threshold)
        f1s = np.where(
            (precision[:-1] + recall[:-1]) > 0,
            2 * precision[:-1] * recall[:-1] / (precision[:-1] + recall[:-1] + 1e-10),
            0.0,
        )
        if len(f1s) == 0:
            return 0.5
        best_idx = int(np.argmax(f1s))
        return float(thresholds[best_idx])
