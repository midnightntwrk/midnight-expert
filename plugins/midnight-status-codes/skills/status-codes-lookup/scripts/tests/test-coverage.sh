#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$SCRIPT_DIR/audit-compiler-coverage.sh"

OUT=$(bash "$AUDIT" 2>&1 || true)

PASS=0; FAIL=0

if grep -q '=== Coverage report ' <<<"$OUT"; then
  echo "PASS: produces report header"; PASS=$((PASS+1))
else
  echo "FAIL: missing report header"; FAIL=$((FAIL+1))
fi
if grep -q 'Uncovered templates:' <<<"$OUT"; then
  echo "PASS: reports uncovered count"; PASS=$((PASS+1))
else
  echo "FAIL: missing uncovered line"; FAIL=$((FAIL+1))
fi
if grep -q 'ref: compactc-v0.31.1' <<<"$OUT"; then
  echo "PASS: pins ref from JSON"; PASS=$((PASS+1))
else
  echo "FAIL: ref pin missing or wrong"; FAIL=$((FAIL+1))
fi

echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
