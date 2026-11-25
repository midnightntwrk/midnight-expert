#!/usr/bin/env bash
set -euo pipefail

# Stop hook (per-session state): detect .compact files that have changed (or
# appeared) since this session's baseline and have not been compiled in this
# session.
#
# The check ALWAYS runs (regardless of stop_hook_active or cooldown). Whether
# we BLOCK on the result is gated by a 5-trigger + 2-hour cooldown and the
# stop_hook_active reattempt flag:
#
#   - block path  (cooldown clear, not a reattempt): emit {decision:"block",
#                                                    reason:...} on stderr
#                                                    and exit 2.
#   - defer path  (cooldown active OR reattempt):    queue the unchecked file
#                                                    list under
#                                                    on_next_user_prompt[type
#                                                    == "compact-not-compiled"]
#                                                    in this session's state
#                                                    file and exit 0. The
#                                                    midnight-expert
#                                                    UserPromptSubmit hook
#                                                    surfaces and drains it
#                                                    on the next user turn.
#
# When the check finds nothing unchecked, any stale compact-not-compiled queue
# entry left from a prior turn is removed.
#
# If this session has flagged uncompiled contracts >= 2 times in the last 30
# minutes, the block reason gains escalation text pointing at the reset and
# exclude scripts.

# --- Read hook input ---
INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# --- Determine project root ---
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"
if [ -z "$PROJECT_ROOT" ]; then
  exit 0
fi

# shellcheck source=_compact-check.sh
source "$(dirname "$0")/_compact-check.sh"

# --- 0. Outside a Midnight project there is nothing to check. Exit before
#     anything scans the tree (it can be a home directory or a huge repo). ---
if ! compact_is_midnight_project "$PROJECT_ROOT"; then
  exit 0
fi

# --- 1. Resolve state file; quiet-on-doubt init if missing ---
STATE_FILE=$(compact_state_file "$PROJECT_ROOT" "$SESSION_ID")
if [ -z "$STATE_FILE" ]; then
  exit 0
fi
compact_state_init "$STATE_FILE" "$PROJECT_ROOT" "$SESSION_ID"

# --- 2. Always run the .compact change/compile check ---
UNCHECKED=$(compact_unchecked_files "$PROJECT_ROOT" "$TRANSCRIPT_PATH" "$STATE_FILE")

# --- 3. Increment trigger count (always) ---
TRIGGERS=$(jq -r '.triggers_since_last_block // 0' "$STATE_FILE")
LAST_TIMESTAMP=$(jq -r '.last_block_timestamp // null' "$STATE_FILE")
TRIGGERS=$((TRIGGERS + 1))

jq --argjson t "$TRIGGERS" '.triggers_since_last_block = $t' \
  "$STATE_FILE" > "$STATE_FILE.tmp" \
  && mv "$STATE_FILE.tmp" "$STATE_FILE"

# --- 4. Clean: drop any stale compact-not-compiled queue entry and exit ---
if [ -z "$UNCHECKED" ]; then
  jq '
    .on_next_user_prompt = [(.on_next_user_prompt // [])[] | select(.type? != "compact-not-compiled")]
  ' "$STATE_FILE" > "$STATE_FILE.tmp" \
    && mv "$STATE_FILE.tmp" "$STATE_FILE"
  exit 0
fi

# --- 5. Unchecked: track flag_events (append now, prune to last 30 min) ---
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOW_EPOCH=$(date -u +%s)
WINDOW_SECONDS=$((30 * 60))

epoch_of() {
  local iso="$1"
  local ts="${iso%Z}"; ts="${ts%%.*}"
  date -u -d "${ts}Z" "+%s" 2>/dev/null \
    || date -juf "%Y-%m-%dT%H:%M:%S" "$ts" "+%s" 2>/dev/null \
    || echo 0
}

EXISTING_EVENTS=$(jq -r '(.flag_events // [])[]?' "$STATE_FILE")
KEPT_EVENTS=()
while IFS= read -r ev; do
  [ -z "$ev" ] && continue
  ev_epoch=$(epoch_of "$ev")
  if [ $((NOW_EPOCH - ev_epoch)) -le "$WINDOW_SECONDS" ]; then
    KEPT_EVENTS+=("$ev")
  fi
done <<< "$EXISTING_EVENTS"
KEPT_EVENTS+=("$NOW_ISO")

PRUNED_COUNT=${#KEPT_EVENTS[@]}
PRUNED_EVENTS_JSON=$(printf '%s\n' "${KEPT_EVENTS[@]}" | jq -R . | jq -s 'map(select(. != ""))')

jq --argjson fe "$PRUNED_EVENTS_JSON" '.flag_events = $fe' \
  "$STATE_FILE" > "$STATE_FILE.tmp" \
  && mv "$STATE_FILE.tmp" "$STATE_FILE"

ESCALATION_TEXT=""
if [ "$PRUNED_COUNT" -ge 2 ]; then
  PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
  ESCALATION_TEXT="This check has flagged uncompiled contracts ${PRUNED_COUNT} times in the last 30 minutes. If -- and ONLY if -- you are certain these are false positives (you have NOT created or modified any of the files listed above in this session), you may reset this session's compile-check baseline:

    bash ${PLUGIN_ROOT}/scripts/compact-check-reset.sh --state-file ${STATE_FILE}

Do NOT use the reset script to silence reminders about files you actually changed -- compile those instead. If a flagged file is intentionally non-compilable (e.g. a test fixture with deliberately invalid syntax), permanently exclude it from this check instead:

    bash ${PLUGIN_ROOT}/scripts/compact-check-exclude.sh <file-or-directory>

Exclusions are project-level config stored in .claude/compact-check.json and should be committed."
fi

# --- 6. Decide block vs defer ---
SHOULD_BLOCK=true
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  SHOULD_BLOCK=false
fi
if [ "$TRIGGERS" -lt 5 ]; then
  SHOULD_BLOCK=false
fi
if [ "$LAST_TIMESTAMP" != "null" ] && [ -n "$LAST_TIMESTAMP" ]; then
  # last_block_timestamp is written as UTC (date -u ...Z, see below). Parse
  # it back as UTC on both GNU (re-append Z) and BSD/macOS (-u forces UTC) so
  # the cooldown DIFF is never skewed by the host's local timezone offset.
  LAST_EPOCH=$(epoch_of "$LAST_TIMESTAMP")
  DIFF=$(( NOW_EPOCH - LAST_EPOCH ))
  if [ "$DIFF" -lt 7200 ]; then
    SHOULD_BLOCK=false
  fi
fi

if [ "$SHOULD_BLOCK" = "true" ]; then
  # Block path: emit reason on stderr, reset triggers, record block timestamp.
  BLOCK_JSON=$(printf '%s\n' "$UNCHECKED" | compact_block_reason_for_files "$ESCALATION_TEXT")

  jq --arg ts "$NOW_ISO" \
     '.last_block_timestamp = $ts |
      .triggers_since_last_block = 0' \
     "$STATE_FILE" > "$STATE_FILE.tmp" \
    && mv "$STATE_FILE.tmp" "$STATE_FILE"

  printf '%s\n' "$BLOCK_JSON" >&2
  exit 2
fi

# --- Defer path: replace the compact-not-compiled queue entry, exit 0.
# When the escalation threshold was reached (ESCALATION_TEXT non-empty), the
# same escalation text carried by the block path is attached to the queued
# entry as an optional `escalation` field so UserPromptSubmit can surface it
# on the next turn. Below threshold, the field is omitted entirely (never
# written as null/empty) so older/forward-compat consumers see no change. ---
FILES_JSON=$(printf '%s\n' "$UNCHECKED" | jq -R . | jq -s 'map(select(. != ""))')

jq --argjson files "$FILES_JSON" --arg escalation "$ESCALATION_TEXT" '
  ($escalation | length > 0) as $has_escalation
  | .on_next_user_prompt = (
      [(.on_next_user_prompt // [])[] | select(.type? != "compact-not-compiled")]
      + [
          { type: "compact-not-compiled", files: $files }
          + (if $has_escalation then { escalation: $escalation } else {} end)
        ]
    )
' "$STATE_FILE" > "$STATE_FILE.tmp" \
  && mv "$STATE_FILE.tmp" "$STATE_FILE"

exit 0
