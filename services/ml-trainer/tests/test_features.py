"""Tests for feature engineering."""

from __future__ import annotations

import numpy as np

from ml_trainer.features import FEATURE_NAMES, extract_features


def test_feature_vector_shape() -> None:
    lead = {
        "metrics": {"askingPrice": 15_000_000, "arv": 25_000_000, "repairEstimate": 3_000_000},
        "property": {"beds": 3, "baths": 2, "sqft": 1800, "condition": "medium_rehab"},
        "source": "probate",
        "motivation": "high",
        "createdAt": "2026-01-15T12:00:00Z",
    }
    interactions = {"totalInteractions": 5, "positiveCount": 3, "hasOffer": True}
    score = {"score": {"dealScore": 75, "motivationScore": 80, "urgencyScore": 60, "composite": 72}}

    vec = extract_features(lead, score, interactions)

    assert isinstance(vec, np.ndarray)
    assert vec.dtype == np.float32
    assert vec.shape == (len(FEATURE_NAMES),)


def test_missing_fields_produce_zeros() -> None:
    lead = {"property": {}, "metrics": {}, "source": "other", "motivation": "unknown"}
    vec = extract_features(lead, {}, {})
    assert vec.shape == (len(FEATURE_NAMES),)
    assert not np.isnan(vec).any()
