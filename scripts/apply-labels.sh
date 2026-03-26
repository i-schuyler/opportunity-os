#!/usr/bin/env bash
# scripts/apply-labels.sh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

labels=(
  "feature:Feature request:1D76DB"
  "bug:Bug report:D73A4A"
  "docs:Documentation change:0E8A16"
  "ci:Continuous integration:5319E7"
  "needs-human:Manual review required:B60205"
  "automerge:Eligible for auto-merge:1F883D"
  "v0.1:v0.1 milestone:BFD4F2"
)

for entry in "${labels[@]}"; do
  name="${entry%%:*}"
  rest="${entry#*:}"
  description="${rest%%:*}"
  color="${rest##*:}"
  gh label create "$name" --description "$description" --color "$color" --force >/dev/null 2>&1 || true
done

echo "Labels applied."
# scripts/apply-labels.sh EOF
