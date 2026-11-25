#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook (per-session state): resolve this session's state file,
# GC stale session state, collect unchecked-contract handoffs left by SIBLING
# sessions' SessionEnd runs (not our own), and write a fresh compact_files
# baseline for this session.
#
# Handoff pipeline, in order: exclusion filter -> drop entries whose file no
# longer exists -> drop entries whose current sha256 no longer matches the
# recorded one -> newest-wins dedupe by path -> drop entries older than 72h.
# Every sibling file that contributed an entry (whether it survived or was
# dropped) is atomically cleared so its handoff note appears exactly once.

INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat || true)
fi
CWD=""
SESSION_ID=""
if [ -n "$INPUT" ]; then
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
fi

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"
if [ -z "$PROJECT_ROOT" ]; then
  PROJECT_ROOT="$(pwd)"
fi

# shellcheck source=_compact-check.sh
source "$(dirname "$0")/_compact-check.sh"

# --- 1. Resolve state file ---
STATE_FILE=$(compact_state_file "$PROJECT_ROOT" "$SESSION_ID")
if [ -z "$STATE_FILE" ]; then
  # No session_id -- nothing we can key state on. Quiet no-op.
  exit 0
fi
STATE_DIR="$(dirname "$STATE_FILE")"

# --- 2. GC: drop sibling state files older than 7 days (mtime) ---
find "$STATE_DIR" -maxdepth 1 -type f -name '*.json' -mtime +7 -delete 2>/dev/null || true

# --- 3/4. Collect handoffs from SIBLING session state files (not our own).
#     Exclusions (compact_is_excluded, below) are read from
#     .claude/compact-check.json as each candidate path is checked. ---
ALL_ENTRIES=$(mktemp)
SOURCES_TO_CLEAR=()
trap 'rm -f "$ALL_ENTRIES"' EXIT

shopt -s nullglob
for sib in "$STATE_DIR"/*.json; do
  [ "$sib" = "$STATE_FILE" ] && continue
  COUNT=$(jq '(.unchecked_from_previous_session // []) | length' "$sib" 2>/dev/null || echo 0)
  if [ "${COUNT:-0}" -gt 0 ] 2>/dev/null; then
    jq -c '(.unchecked_from_previous_session // [])[]' "$sib" 2>/dev/null >> "$ALL_ENTRIES"
    SOURCES_TO_CLEAR+=("$sib")
  fi
done
shopt -u nullglob

# Pipeline: exclusion filter -> existence -> hash match.
FILTERED_ENTRIES=$(mktemp)
while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  # A malformed sibling entry (not shaped {path,sha256,flagged_at}) must be
  # skipped, not fatal -- jq errors on e.g. a bare string/number element, so
  # this extraction is guarded the same way every other sibling-data read in
  # this file is guarded.
  path=$(printf '%s' "$entry" | jq -r '.path' 2>/dev/null || echo "")
  sha=$(printf '%s' "$entry" | jq -r '.sha256' 2>/dev/null || echo "")

  if [ -z "$path" ] || [ "$path" = "null" ]; then
    continue
  fi

  if compact_is_excluded "$PROJECT_ROOT" "$path"; then
    continue
  fi
  if [ ! -f "$path" ]; then
    continue
  fi
  current_hash=$(sha256sum "$path" | awk '{print $1}')
  if [ "$current_hash" != "$sha" ]; then
    continue
  fi

  printf '%s\n' "$entry" >> "$FILTERED_ENTRIES"
done < "$ALL_ENTRIES"

# Pipeline: newest-wins dedupe by path -> 72h TTL. Annotate each surviving
# entry with an epoch (bash-computed, dual GNU/BSD, matching the rest of the
# codebase) so the dedupe/TTL comparison in jq stays pure-numeric.
epoch_of() {
  local iso="$1"
  local ts="${iso%Z}"; ts="${ts%%.*}"
  date -u -d "${ts}Z" "+%s" 2>/dev/null \
    || date -juf "%Y-%m-%dT%H:%M:%S" "$ts" "+%s" 2>/dev/null \
    || echo 0
}

ANNOTATED=$(mktemp)
while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  flagged_at=$(printf '%s' "$entry" | jq -r '.flagged_at')
  epoch=$(epoch_of "$flagged_at")
  printf '%s' "$entry" | jq -c --argjson e "$epoch" '. + {_epoch: $e}' >> "$ANNOTATED"
done < "$FILTERED_ENTRIES"

NOW_EPOCH=$(date -u +%s)
TTL_SECONDS=$((72 * 3600))

SURVIVING_JSON=$(jq -s --argjson now "$NOW_EPOCH" --argjson ttl "$TTL_SECONDS" '
  group_by(.path)
  | map(max_by(._epoch))
  | map(select(($now - ._epoch) <= $ttl))
  | map(del(._epoch))
' "$ANNOTATED" 2>/dev/null || echo '[]')

rm -f "$FILTERED_ENTRIES" "$ANNOTATED"

# --- 5. Consume: clear every sibling that contributed an entry (survived or dropped) ---
for sib in "${SOURCES_TO_CLEAR[@]+"${SOURCES_TO_CLEAR[@]}"}"; do
  jq '.unchecked_from_previous_session = []' "$sib" > "$sib.tmp" 2>/dev/null \
    && mv "$sib.tmp" "$sib"
done

# --- 6. Write own state file: full skeleton, fresh compact_files snapshot --
#     ONLY if it doesn't already exist. SessionStart fires (matcher "*") on
#     resume and on context auto-compaction too, with the SAME session_id --
#     not just on a brand-new session. Unconditionally overwriting here would
#     wipe any pending on_next_user_prompt defer entry (before
#     UserPromptSubmit can drain it), flag_events, trigger/cooldown counters,
#     and re-baseline compact_files so a file modified-but-uncompiled before
#     the re-fire would never be flagged again. Steps 2-5 above stay
#     unconditional -- GC and handoff collection/consumption are idempotent
#     and must still run on every fire.
#     Outside a Midnight project the tree is not scanned (it can be a home
#     directory or a huge monorepo) and compact_files is null, a deferred
#     baseline. The first check that runs later fills it with the contracts
#     modified before this session started (compact_baseline_resolve), so
#     those are never flagged and a contract this session writes is. ---
if [ ! -f "$STATE_FILE" ]; then
  if compact_is_midnight_project "$PROJECT_ROOT"; then
    COMPACT_FILES_JSON=$(compact_snapshot_files "$PROJECT_ROOT")
  else
    COMPACT_FILES_JSON='null'
  fi
  CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Snapshot on stdin, not --argjson (one argument is capped at 128 KiB on Linux).
  printf '%s' "$COMPACT_FILES_JSON" | jq \
    --arg root "$PROJECT_ROOT" \
    --arg sid "$SESSION_ID" \
    --arg created "$CREATED_AT" \
    '{
      schema_version: 1,
      project_root: $root,
      session_id: $sid,
      created_at: $created,
      compact_files: .,
      triggers_since_last_block: 0,
      last_block_timestamp: null,
      flag_events: [],
      on_next_user_prompt: [],
      unchecked_from_previous_session: []
    }' > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
fi

# --- 7. Emit additionalContext only if there is something to say ---
SURVIVING_COUNT=$(printf '%s' "$SURVIVING_JSON" | jq 'length')
if [ "$SURVIVING_COUNT" -eq 0 ]; then
  exit 0
fi

PREV_LIST=$(printf '%s' "$SURVIVING_JSON" | jq -r '.[] | "- \(.path)"')
PREV_UNCHECKED_NOTE="The following Compact contracts were created or modified during the previous session but were never compiled (no \`compact compile\` / \`compactc\` invocation naming them was recorded in that session's transcript):

${PREV_LIST}

If you continue work that touches these contracts, run /verify on them or invoke \`compact compile\` / \`compactc\` before treating any related claim as confirmed."

jq -n --arg ctx "$PREV_UNCHECKED_NOTE" '{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $ctx
  }
}'
