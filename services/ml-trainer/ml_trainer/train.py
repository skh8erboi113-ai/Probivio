"""CLI entrypoint for training.

Usage:
    python -m ml_trainer.train --operator=<uid>
    python -m ml_trainer.train --all
"""

from __future__ import annotations

import argparse
import logging
import sys

from google.cloud import firestore, storage

from ml_trainer.config import TrainerConfig
from ml_trainer.data_loader import TrainingDataLoader
from ml_trainer.model import ModelTrainer
from ml_trainer.publisher import ModelPublisher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


def train_operator(
    operator_id: str,
    config: TrainerConfig,
    loader: TrainingDataLoader,
    trainer: ModelTrainer,
    publisher: ModelPublisher,
) -> bool:
    """Train one operator. Returns True if published."""
    logger.info("=== Training operator %s ===", operator_id)

    samples = loader.load_samples(operator_id, limit=10_000)

    if len(samples) < config.min_samples_for_training:
        logger.info(
            "Skipping — only %d samples (need %d)",
            len(samples),
            config.min_samples_for_training,
        )
        return False

    try:
        result = trainer.train(samples)
    except ValueError as e:
        logger.warning("Training failed: %s", e)
        return False

    version = publisher.publish(operator_id, result)
    return version is not None


def discover_all_operators(db: firestore.Client) -> list[str]:
    """Find all operators with any leads."""
    operators = set()
    for doc in db.collection("operators").stream():
        operators.add(doc.id)
    return sorted(operators)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--operator", help="Train a single operator by UID")
    parser.add_argument("--all", action="store_true", help="Train all operators")
    parser.add_argument("--min-samples", type=int, help="Override MIN_SAMPLES env")
    args = parser.parse_args()

    if not args.operator and not args.all:
        parser.error("Must specify --operator or --all")

    config = TrainerConfig.from_env()
    if args.min_samples:
        # Rebuild config with override
        config = TrainerConfig(
            firebase_project_id=config.firebase_project_id,
            gcs_bucket=config.gcs_bucket,
            min_samples_for_training=args.min_samples,
            validation_split=config.validation_split,
            min_auc_to_publish=config.min_auc_to_publish,
        )

    db = firestore.Client(project=config.firebase_project_id)
    storage_client = storage.Client(project=config.firebase_project_id)

    loader = TrainingDataLoader(db)
    trainer = ModelTrainer(validation_split=config.validation_split)
    publisher = ModelPublisher(
        db=db,
        storage_client=storage_client,
        bucket_name=config.gcs_bucket,
        min_auc_to_publish=config.min_auc_to_publish,
    )

    if args.operator:
        success = train_operator(args.operator, config, loader, trainer, publisher)
        return 0 if success else 1

    # --all mode
    operators = discover_all_operators(db)
    logger.info("Discovered %d operators", len(operators))

    successes = 0
    failures = 0
    for op_id in operators:
        try:
            if train_operator(op_id, config, loader, trainer, publisher):
                successes += 1
            else:
                failures += 1
        except (RuntimeError, OSError, ValueError) as e:
            logger.exception("Operator %s failed: %s", op_id, e)
            failures += 1

    logger.info("Complete: %d published, %d skipped/failed", successes, failures)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
