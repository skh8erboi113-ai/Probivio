"""Feature engineering.

Converts raw Firestore documents into a dense numeric feature vector.
The exact same feature extraction logic must exist on the Node side to
compute inputs at inference time. See:
  apps/streamline/src/services/ml-feature-extractor.service.ts
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np

# Deterministic feature order — DO NOT reorder without bumping model version
FEATURE_NAMES: list[str] = [
    # Deal features
    "deal_asking_price_log",
    "deal_arv_log",
    "deal_repair_estimate_log",
    "deal_assignment_fee_log",
    "deal_max_offer_log",
    "deal_equity_ratio",
    "deal_repair_ratio",
    "deal_satisfies_70_rule",
    "deal_has_arv",
    "deal_has_repair_estimate",
    "deal_has_asking_price",
    # Property features
    "prop_beds",
    "prop_baths",
    "prop_sqft_log",
    "prop_year_built",
    "prop_lot_size_log",
    "prop_condition_ordinal",
    # Source features (one-hot)
    "source_probate",
    "source_direct_mail",
    "source_cold_call",
    "source_referral",
    "source_driving",
    "source_web",
    # Motivation features (ordinal)
    "motivation_ordinal",
    # Interaction features
    "int_total_count",
    "int_positive_count",
    "int_negative_count",
    "int_response_rate",
    "int_avg_response_time_minutes",
    "int_days_since_first_contact",
    "int_days_since_last_contact",
    "int_has_appointment",
    "int_has_offer",
    "int_has_contract",
    # Temporal features
    "temporal_lead_age_days",
    "temporal_hour_of_day",
    "temporal_day_of_week",
    # Prior score signals (from heuristic)
    "prior_deal_score",
    "prior_motivation_score",
    "prior_urgency_score",
    "prior_composite_score",
]

CONDITION_ORDINAL: dict[str, float] = {
    "unknown": 0.0,
    "turnkey": 1.0,
    "light_rehab": 2.0,
    "medium_rehab": 3.0,
    "heavy_rehab": 4.0,
    "teardown": 5.0,
}

MOTIVATION_ORDINAL: dict[str, float] = {
    "unknown": 0.0,
    "low": 1.0,
    "medium": 2.0,
    "high": 3.0,
    "urgent": 4.0,
}


@dataclass(frozen=True)
class TrainingSample:
    """One (features, label) pair for training."""

    features: np.ndarray
    label: int  # 1 = closed_won, 0 = closed_lost / dead
    lead_id: str
    operator_id: str


def safe_log(value: float | int | None) -> float:
    """Log-transform with safe zero handling."""
    if value is None or value <= 0:
        return 0.0
    return float(np.log1p(value))


def extract_features(
    lead: dict[str, Any],
    score_history_entry: dict[str, Any],
    interaction_features: dict[str, Any],
) -> np.ndarray:
    """Extract feature vector from a lead + its historical score + interaction rollup.

    The score_history_entry is the score AT THE TIME OF FIRST CONTACT — this is what
    the model is learning to predict. The label (won/lost) comes from lead.status.
    """
    metrics = lead.get("metrics", {})
    property_data = lead.get("property", {})
    source = lead.get("source", "other")
    motivation = lead.get("motivation", "unknown")
    condition = property_data.get("condition", "unknown")

    # Deal features
    asking = metrics.get("askingPrice")
    arv = metrics.get("arv")
    repair = metrics.get("repairEstimate")

    equity_ratio = 0.0
    if arv and repair is not None and asking:
        equity_ratio = float(max(0.0, min(1.0, (arv - repair - asking) / arv)))

    repair_ratio = 0.0
    if arv and repair is not None and arv > 0:
        repair_ratio = float(min(1.0, repair / arv))

    satisfies_70 = 0.0
    if arv and repair is not None and metrics.get("maxOffer"):
        target = arv * 0.7 - repair
        satisfies_70 = 1.0 if metrics["maxOffer"] <= target else 0.0

    # Temporal
    created_at = lead.get("createdAt")
    lead_age_days = 0.0
    hour_of_day = 0.0
    day_of_week = 0.0

    if created_at:
        try:
            dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
            lead_age_days = (datetime.now(timezone.utc) - dt).days
            hour_of_day = float(dt.hour)
            day_of_week = float(dt.weekday())
        except (ValueError, TypeError):
            pass

    # Prior scores from heuristic
    prior_score = score_history_entry.get("score", {}) if score_history_entry else {}

    vec = [
        safe_log(asking),
        safe_log(arv),
        safe_log(repair),
        safe_log(metrics.get("assignmentFee")),
        safe_log(metrics.get("maxOffer")),
        equity_ratio,
        repair_ratio,
        satisfies_70,
        1.0 if arv else 0.0,
        1.0 if repair is not None else 0.0,
        1.0 if asking else 0.0,
        float(property_data.get("beds") or 0),
        float(property_data.get("baths") or 0),
        safe_log(property_data.get("sqft")),
        float(property_data.get("yearBuilt") or 0),
        safe_log(property_data.get("lotSize")),
        CONDITION_ORDINAL.get(condition, 0.0),
        1.0 if source == "probate" else 0.0,
        1.0 if source == "direct_mail" else 0.0,
        1.0 if source == "cold_call" else 0.0,
        1.0 if source == "referral" else 0.0,
        1.0 if source == "driving_for_dollars" else 0.0,
        1.0 if source == "web_form" else 0.0,
        MOTIVATION_ORDINAL.get(motivation, 0.0),
        float(interaction_features.get("totalInteractions", 0)),
        float(interaction_features.get("positiveCount", 0)),
        float(interaction_features.get("negativeCount", 0)),
        float(interaction_features.get("responseRate", 0.0)),
        float(interaction_features.get("avgResponseTimeMinutes", 0.0)),
        float(interaction_features.get("daysSinceFirstContact", 0)),
        float(interaction_features.get("daysSinceLastContact", 0)),
        1.0 if interaction_features.get("hasAppointment") else 0.0,
        1.0 if interaction_features.get("hasOffer") else 0.0,
        1.0 if interaction_features.get("hasContract") else 0.0,
        float(lead_age_days),
        hour_of_day,
        day_of_week,
        float(prior_score.get("dealScore", 50)),
        float(prior_score.get("motivationScore", 50)),
        float(prior_score.get("urgencyScore", 50)),
        float(prior_score.get("composite", 50)),
    ]

    return np.array(vec, dtype=np.float32)
