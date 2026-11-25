#!/usr/bin/env bash
# The session-wide hooks stay quiet outside Midnight projects (no .compact
# file within six levels, no package.json naming @midnight-ntwrk/*), so they
# don't add context, run `compact check`, or scan the tree on unrelated work.
# A first contract written mid-session is still flagged, and a snapshot too
# big for one command-line argument still works.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SELF_DIR/_lib.sh"

# shellcheck source=../_compact-check.sh
source "$HOOKS_DIR/_compact-check.sh"

COMPACT_CORE_SESSIONSTART="$PLUGINS_DIR/compact-core/scripts/SessionStart.sh"
VERIFY_SESSIONSTART="$PLUGINS_DIR/midnight-verify/scripts/hooks/SessionStart.sh"

ROOTS=()
cleanup() { [ ${#ROOTS[@]} -eq 0 ] || rm -rf "${ROOTS[@]}"; }
trap cleanup EXIT
# Sets R to a fresh project root. Not used as $(new_root): a subshell would
# drop the ROOTS entry and leak the directory.
new_root() { R=$(mk_project_root); ROOTS+=("$R"); }

is_midnight() { if compact_is_midnight_project "$1"; then echo yes; else echo no; fi; }

echo "--- project detection"
new_root; printf 'print(1)\n' > "$R/app.py"
chk_eq "plain python project is not Midnight" "no" "$(is_midnight "$R")"

new_root; mkdir -p "$R/node_modules/x" "$R/.hidden"
printf 'contract' > "$R/node_modules/x/a.compact"; printf 'contract' > "$R/.hidden/a.compact"
chk_eq ".compact only in node_modules or hidden dirs is not Midnight" "no" "$(is_midnight "$R")"

new_root; mkdir -p "$R/a/b/c/d/e"; printf 'contract' > "$R/a/b/c/d/e/x.compact"
chk_eq ".compact six levels down is Midnight" "yes" "$(is_midnight "$R")"

new_root; mkdir -p "$R/api"
printf '{"dependencies":{"@midnight-ntwrk/midnight-js-contracts":"5.0.1"}}' > "$R/api/package.json"
chk_eq "package.json naming @midnight-ntwrk/* is Midnight" "yes" "$(is_midnight "$R")"

new_root; printf '{"dependencies":{"react":"19.0.0"}}' > "$R/package.json"
chk_eq "package.json without Midnight packages is not Midnight" "no" "$(is_midnight "$R")"

chk_eq "missing project root is not Midnight" "no" "$(is_midnight "/nonexistent/$$")"

echo "--- session hooks in a plain project"
new_root; printf 'print(1)\n' > "$R/app.py"
SID="sess-plain"
STATE_FILE=$(state_path "$R" "$SID")
PAYLOAD=$(hook_payload "$R" "$SID")

OUT=$(printf '%s' "$PAYLOAD" | HOME="$R" CLAUDE_PROJECT_DIR="$R" bash "$COMPACT_CORE_SESSIONSTART")
CTX=$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.additionalContext')
chk_contains     "compact-core SessionStart says it skipped" "$CTX" "doesn't look like a Midnight project"
chk_not_contains "compact-core SessionStart gives no compiler advice" "$CTX" "compact compiler v"

OUT=$(printf '%s' "$PAYLOAD" | HOME="$R" CLAUDE_PROJECT_DIR="$R" bash "$VERIFY_SESSIONSTART")
chk_eq "midnight-verify SessionStart prints nothing" "" "$OUT"

run_hook "SessionStart-compact-check.sh" "$PAYLOAD" _ _ _
chk_jq "baseline is empty and the tree isn't scanned" "$STATE_FILE" '.compact_files' "{}"

TRANSCRIPT="$R/transcript.jsonl"
transcript_no_compile "$TRANSCRIPT"
STOP_PAYLOAD=$(hook_payload "$R" "$SID" \
  "$(jq -cn --arg t "$TRANSCRIPT" '{transcript_path: $t, stop_hook_active: false}')")
jq '.triggers_since_last_block = 4' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
run_hook "Stop.sh" "$STOP_PAYLOAD" OUT ERR RC
chk_eq "Stop exits 0 with no contracts" "0" "$RC"
chk_eq "Stop doesn't count a trigger outside Midnight" "4" "$(jq -r '.triggers_since_last_block' "$STATE_FILE")"

echo "--- the session's first contract is still flagged"
write_compact "$R" "first.compact" "contract first"
run_hook "Stop.sh" "$STOP_PAYLOAD" OUT ERR RC
chk_eq       "Stop blocks once a contract exists" "2" "$RC"
chk_contains "block reason names the new contract" "$ERR" "first.compact"

echo "--- a snapshot bigger than one argument (128 KiB on Linux)"
new_root; mkdir -p "$R/contracts"
LONG=$(printf 'n%.0s' $(seq 1 150))
for i in $(seq 1 600); do printf 'contract %s' "$i" > "$R/contracts/${LONG}_$i.compact"; done
SID="sess-big"
STATE_FILE=$(state_path "$R" "$SID")
run_hook "SessionStart-compact-check.sh" "$(hook_payload "$R" "$SID")" _ ERR RC
chk_eq "SessionStart exits 0" "0" "$RC"
chk_jq "all 600 contracts are in the baseline" "$STATE_FILE" '.compact_files | length' "600"
SNAP_BYTES=$(jq -c '.compact_files' "$STATE_FILE" | wc -c | tr -d ' ')
chk_eq "snapshot is over 128 KiB" "yes" "$([ "$SNAP_BYTES" -gt 131072 ] && echo yes || echo no)"

summary
