#!/usr/bin/env bash
# ci.sh
set -euo pipefail

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required for ci.sh"
  exit 2
fi

npm install
npm run lint
npm test
npm run build

echo "ci.sh: all checks passed"
# ci.sh EOF
