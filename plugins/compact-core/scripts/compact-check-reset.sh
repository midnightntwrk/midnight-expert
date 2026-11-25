#!/usr/bin/env bash
# compact-check-reset.sh --state-file <path>
#
# Resets a per-session compact-check state file in place:
#   - re-snapshots `compact_files` from the file's `project_root`
#     (respecting the project's .claude/compact-check.json exclusions)
#   - clears triggers_since_last_block, last_block_timestamp, flag_events,
#     on_next_user_prompt, and unchecked_from_previous_session
#
# <path> must be an existing JSON file under $HOME/.midnight-expert/state/
# that has a `.project_root` field.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: compact-check-reset.sh --state-file <path>

Resets a per-session compact-check state file:
  - re-snapshots compact_files from the file's project_root, respecting
    that project's .claude/compact-check.json exclusions
  - clears triggers_since_last_block, last_block_timestamp, flag_events,
    on_next_user_prompt, and unchecked_from_previous_session

<path> must be an existing JSON file under $HOME/.midnight-expert/state/
containing a .project_root field.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=hooks/_compact-check.sh
source "$SCRIPT_DIR/hooks/_compact-check.sh"

STATE_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --state-file)
      STATE_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$STATE_FILE" ]; then
  echo "error: --state-file <path> is required" >&2
  usage >&2
  exit 1
fi

STATE_DIR_PREFIX="$HOME/.midnight-expert/state/"
case "$STATE_FILE" in
  "$STATE_DIR_PREFIX"*) ;;
  *)
    echo "error: state file must be under $STATE_DIR_PREFIX (got: $STATE_FILE)" >&2
    exit 1
    ;;
esac

if [ ! -f "$STATE_FILE" ]; then
  echo "error: state file does not exist: $STATE_FILE" >&2
  exit 1
fi

if ! jq -e . "$STATE_FILE" >/dev/null 2>&1; then
  echo "error: state file is not valid JSON: $STATE_FILE" >&2
  exit 1
fi

PROJECT_ROOT=$(jq -r '.project_root // empty' "$STATE_FILE")
if [ -z "$PROJECT_ROOT" ]; then
  echo "error: state file has no .project_root: $STATE_FILE" >&2
  exit 1
fi

COMPACT_FILES_JSON=$(compact_snapshot_files "$PROJECT_ROOT")
COUNT=$(printf '%s' "$COMPACT_FILES_JSON" | jq 'length')

# --slurpfile, not --argjson: one argument is capped at 128 KiB on Linux.
CF_TMP=$(mktemp)
printf '%s' "$COMPACT_FILES_JSON" > "$CF_TMP"
jq --slurpfile cf "$CF_TMP" '
  .compact_files = $cf[0]
  | .triggers_since_last_block = 0
  | .last_block_timestamp = null
  | .flag_events = []
  | .on_next_user_prompt = []
  | .unchecked_from_previous_session = []
' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
rm -f "$CF_TMP"

echo "Reset $STATE_FILE: baselined $COUNT contract(s)."
