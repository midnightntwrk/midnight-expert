#!/usr/bin/env bash
# Test runner for compact-core hook scripts. Executed by CI
# (.github/workflows/ci-compact-core-hooks.yml) and locally.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"

FAILED=()

run_step() {
  local label="$1"; shift
  echo
  echo "==> $label"
  if "$@"; then
    echo "    OK: $label"
  else
    echo "    FAIL: $label"
    FAILED+=("$label")
  fi
}

run_step "test-sessionstart-snapshots-hashes.sh" \
  bash "$TESTS_DIR/test-sessionstart-snapshots-hashes.sh"
run_step "test-stop-blocks-on-modified.sh" \
  bash "$TESTS_DIR/test-stop-blocks-on-modified.sh"
run_step "test-stop-passes-with-compile.sh" \
  bash "$TESTS_DIR/test-stop-passes-with-compile.sh"
run_step "test-stop-cooldown-2h.sh" \
  bash "$TESTS_DIR/test-stop-cooldown-2h.sh"
run_step "test-stop-defers-on-stop-hook-active.sh" \
  bash "$TESTS_DIR/test-stop-defers-on-stop-hook-active.sh"
run_step "test-stop-clears-stale-queue-when-clean.sh" \
  bash "$TESTS_DIR/test-stop-clears-stale-queue-when-clean.sh"
run_step "test-sessionend-persists-unchecked.sh" \
  bash "$TESTS_DIR/test-sessionend-persists-unchecked.sh"
run_step "test-sessionstart-surfaces-prev-and-clears.sh" \
  bash "$TESTS_DIR/test-sessionstart-surfaces-prev-and-clears.sh"
run_step "test-sessionstart-refire-preserves-state.sh" \
  bash "$TESTS_DIR/test-sessionstart-refire-preserves-state.sh"
run_step "test-userpromptsubmit-prints-and-drains.sh" \
  bash "$TESTS_DIR/test-userpromptsubmit-prints-and-drains.sh"
run_step "test-userpromptsubmit-noop-when-empty.sh" \
  bash "$TESTS_DIR/test-userpromptsubmit-noop-when-empty.sh"
run_step "test-helper-exclusions.sh" \
  bash "$TESTS_DIR/test-helper-exclusions.sh"
run_step "test-reset-script.sh" \
  bash "$TESTS_DIR/test-reset-script.sh"
run_step "test-exclude-script.sh" \
  bash "$TESTS_DIR/test-exclude-script.sh"
run_step "test-state-isolation.sh" \
  bash "$TESTS_DIR/test-state-isolation.sh"
run_step "test-stop-escalation-after-2-flags.sh" \
  bash "$TESTS_DIR/test-stop-escalation-after-2-flags.sh"
run_step "test-stop-escalation-defer-path.sh" \
  bash "$TESTS_DIR/test-stop-escalation-defer-path.sh"
run_step "test-sessionstart-gc.sh" \
  bash "$TESTS_DIR/test-sessionstart-gc.sh"
run_step "test-handoff-staleness.sh" \
  bash "$TESTS_DIR/test-handoff-staleness.sh"
run_step "test-handoff-respects-exclusions.sh" \
  bash "$TESTS_DIR/test-handoff-respects-exclusions.sh"
run_step "test-drain-respects-exclusions.sh" \
  bash "$TESTS_DIR/test-drain-respects-exclusions.sh"
run_step "test-subagent-transcript-compile.sh" \
  bash "$TESTS_DIR/test-subagent-transcript-compile.sh"
run_step "test-stop-quiet-on-missing-state.sh" \
  bash "$TESTS_DIR/test-stop-quiet-on-missing-state.sh"
run_step "test-sessionstart-compiler-advice.sh" \
  bash "$TESTS_DIR/test-sessionstart-compiler-advice.sh"

echo
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "FAILED steps: ${#FAILED[@]}"
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
echo "All checks passed."
