#!/usr/bin/env bash
# Runs every Farm Ledger 10 test. Usage: tests/run.sh [--emulator] [--no-e2e]
#   unit + rules-model tests: node --test (no downloads)
#   e2e: Playwright (Chromium) against the in-memory backend — never touches Firebase
#   --emulator: also runs the REAL firestore.rules in the Firestore emulator (needs Java and
#               the emulator jar; blocked in the build sandbox, ready for a normal machine)
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/gen-asset-list.mjs
node tests/rules/gen-matrix-md.mjs
echo "== unit + rules model =="
node --test tests/unit/*.test.mjs tests/rules/model.test.mjs 2>&1 | tail -n 12
if [[ " $* " != *" --no-e2e "* ]]; then
  echo "== e2e (Playwright, in-memory backend) =="
  node --test --test-concurrency=1 tests/e2e/*.test.mjs 2>&1 | tail -n 12
fi
if [[ " $* " == *" --emulator "* ]]; then
  echo "== rules in the Firestore emulator =="
  (cd tools && npx firebase emulators:exec --project demo-fl10 --config ../firebase/firebase.json --only firestore "node --test ../tests/rules/emulator.test.mjs")
fi
