#!/usr/bin/env bash
set -euo pipefail

# SessionEnd hook (per-session state): run the same .compact hash +
# compile-found check as the Stop hook. Persist any unchecked files as
# structured {path, sha256, flagged_at} handoff entries in OWN state file's
# unchecked_from_previous_session so a sibling session's SessionStart can
# collect them. compact_files is kept as-is (GC in SessionStart reaps the
# whole state file after 7 days). Configured async in hooks.json so it does
# not delay session shutdown -- this hook always exits 0.

INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat || true)
fi
TRANSCRIPT_PATH=""
CWD=""
SESSION_ID=""
if [ -n "$INPUT" ]; then
  TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
fi

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"
if [ -z "$PROJECT_ROOT" ]; then
  PROJECT_ROOT="$(pwd)"
fi

# shellcheck source=_compact-check.sh
source "$(dirname "$0")/_compact-check.sh"

# --- 0. Outside a Midnight project there is nothing to hand off. ---
if ! compact_is_midnight_project "$PROJECT_ROOT"; then
  exit 0
fi

# --- 1. Resolve state file; missing -> nothing tracked, no-op ---
STATE_FILE=$(compact_state_file "$PROJECT_ROOT" "$SESSION_ID")
if [ -z "$STATE_FILE" ] || [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# --- 2. Run the check and persist structured handoff entries ---
UNCHECKED=$(compact_unchecked_files "$PROJECT_ROOT" "$TRANSCRIPT_PATH" "$STATE_FILE")

NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
UNCHECKED_JSON='[]'
if [ -n "$UNCHECKED" ]; then
  UNCHECKED_JSON=$(
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      h=$(sha256sum "$f" 2>/dev/null | awk '{print $1}')
      jq -n --arg p "$f" --arg h "$h" --arg fa "$NOW_ISO" '{path: $p, sha256: $h, flagged_at: $fa}'
    done <<< "$UNCHECKED" | jq -s '.'
  )
fi

# --slurpfile, not --argjson: one argument is capped at 128 KiB on Linux.
UNCHECKED_TMP=$(mktemp)
printf '%s' "$UNCHECKED_JSON" > "$UNCHECKED_TMP"
jq --slurpfile u "$UNCHECKED_TMP" '.unchecked_from_previous_session = $u[0]' \
  "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null \
  && mv "$STATE_FILE.tmp" "$STATE_FILE" || true
rm -f "$UNCHECKED_TMP"

exit 0
