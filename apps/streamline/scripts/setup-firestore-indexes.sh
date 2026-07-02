#!/usr/bin/env bash
set -euo pipefail

# Deploys firestore.rules + firestore.indexes.json to the configured Firebase project.
# Prereqs: firebase-tools installed and authenticated (npm i -g firebase-tools; firebase login).

PROJECT_ID="${FIREBASE_PROJECT_ID:-}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ FIREBASE_PROJECT_ID env var required"
  exit 1
fi

echo "→ Deploying Firestore rules and indexes to project: $PROJECT_ID"

firebase deploy \
  --project "$PROJECT_ID" \
  --only firestore:rules,firestore:indexes

echo "✓ Firestore rules and indexes deployed"

echo ""
echo "Reminder: enable TTL on the following fields via Firebase Console:"
echo "  - Collection: idempotency_keys, field: expiresAt"
echo ""
echo "Docs: https://firebase.google.com/docs/firestore/ttl"
