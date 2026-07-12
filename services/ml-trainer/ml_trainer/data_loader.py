"""Firestore data loader for training samples."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

from ml_trainer.features import TrainingSample, extract_features

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = {"closed_won", "closed_lost", "dead"}
WON_STATUS = "closed_won"


class TrainingDataLoader:
    """Pulls and joins Firestore data for training."""

    def __init__(self, db: firestore.Client) -> None:
        self.db = db

    def load_samples(
        self, operator_id: str, limit: int = 10_000
    ) -> list[TrainingSample]:
        """Load and construct training samples for one operator.

        Only leads with terminal statuses (won/lost/dead) contribute samples.
        """
        logger.info("Loading training samples for operator %s", operator_id)

        # 1. Fetch terminal-status leads
        leads_query = (
            self.db.collection("leads")
            .where("operatorId", "==", operator_id)
            .where("status", "in", list(TERMINAL_STATUSES))
            .limit(limit)
        )
        leads = {doc.id: doc.to_dict() for doc in leads_query.stream()}
        logger.info("  Loaded %d terminal-status leads", len(leads))

        if not leads:
            return []

        # 2. Fetch all interactions for those leads, grouped by leadId
        interactions_by_lead: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for lead_id in leads.keys():
            interactions_query = (
                self.db.collection("interactions")
                .where("operatorId", "==", operator_id)
                .where("leadId", "==", lead_id)
                .order_by("occurredAt")
            )
            for doc in interactions_query.stream():
                interactions_by_lead[lead_id].append(doc.to_dict())

        logger.info(
            "  Loaded interactions for %d leads",
            len([lid for lid, ints in interactions_by_lead.items() if ints]),
        )

        # 3. Fetch score history for those leads (use earliest score as prior)
        score_by_lead: dict[str, dict[str, Any]] = {}
        for lead_id in leads.keys():
            history_query = (
                self.db.collection("score_history")
                .where("operatorId", "==", operator_id)
                .where("leadId", "==", lead_id)
                .order_by("createdAt")
                .limit(1)
            )
            for doc in history_query.stream():
                score_by_lead[lead_id] = doc.to_dict()

        logger.info("  Loaded prior scores for %d leads", len(score_by_lead))

        # 4. Build samples
        samples: list[TrainingSample] = []
        for lead_id, lead_data in leads.items():
            interaction_features = self._compute_interaction_features(
                interactions_by_lead.get(lead_id, [])
            )
            score_entry = score_by_lead.get(lead_id, {})

            try:
                features = extract_features(lead_data, score_entry, interaction_features)
            except (KeyError, TypeError, ValueError) as e:
                logger.warning("Feature extraction failed for lead %s: %s", lead_id, e)
                continue

            label = 1 if lead_data.get("status") == WON_STATUS else 0
            samples.append(
                TrainingSample(
                    features=features,
                    label=label,
                    lead_id=lead_id,
                    operator_id=operator_id,
                )
            )

        logger.info(
            "  Built %d training samples (won=%d, lost=%d)",
            len(samples),
            sum(1 for s in samples if s.label == 1),
            sum(1 for s in samples if s.label == 0),
        )

        return samples

    def _compute_interaction_features(
        self, interactions: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Aggregate raw interactions into feature values.

        Mirror of packages/db/src/interaction.repository.ts computeFeatures().
        """
        if not interactions:
            return {
                "totalInteractions": 0,
                "positiveCount": 0,
                "negativeCount": 0,
                "responseRate": 0.0,
                "avgResponseTimeMinutes": 0.0,
                "daysSinceFirstContact": 0,
                "daysSinceLastContact": 0,
                "hasAppointment": False,
                "hasOffer": False,
                "hasContract": False,
            }

        outbound_types = {"email_sent", "call_made"}
        inbound_types = {"email_replied", "call_answered"}

        positive = sum(1 for i in interactions if i.get("outcome") == "positive")
        negative = sum(1 for i in interactions if i.get("outcome") == "negative")

        outbound = [i for i in interactions if i.get("type") in outbound_types]
        inbound = [i for i in interactions if i.get("type") in inbound_types]
        response_rate = len(inbound) / len(outbound) if outbound else 0.0

        # Response time
        response_times: list[float] = []
        for i in range(len(interactions) - 1):
            current = interactions[i]
            nxt = interactions[i + 1]
            if current.get("type") in outbound_types and nxt.get("type") in inbound_types:
                try:
                    t1 = datetime.fromisoformat(str(current["occurredAt"]).replace("Z", "+00:00"))
                    t2 = datetime.fromisoformat(str(nxt["occurredAt"]).replace("Z", "+00:00"))
                    response_times.append((t2 - t1).total_seconds() / 60.0)
                except (ValueError, KeyError):
                    continue

        avg_response = sum(response_times) / len(response_times) if response_times else 0.0

        try:
            first = datetime.fromisoformat(str(interactions[0]["occurredAt"]).replace("Z", "+00:00"))
            last = datetime.fromisoformat(str(interactions[-1]["occurredAt"]).replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            days_first = (now - first).days
            days_last = (now - last).days
        except (ValueError, KeyError):
            days_first = 0
            days_last = 0

        types_present = {i.get("type") for i in interactions}

        return {
            "totalInteractions": len(interactions),
            "positiveCount": positive,
            "negativeCount": negative,
            "responseRate": min(1.0, response_rate),
            "avgResponseTimeMinutes": avg_response,
            "daysSinceFirstContact": days_first,
            "daysSinceLastContact": days_last,
            "hasAppointment": "appointment_set" in types_present,
            "hasOffer": "offer_made" in types_present,
            "hasContract": "contract_signed" in types_present,
        }
