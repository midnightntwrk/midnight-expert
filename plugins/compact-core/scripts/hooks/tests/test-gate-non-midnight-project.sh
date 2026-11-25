#!/usr/bin/env bash
# The session-wide hooks stay quiet outside Midnight projects (no .compact
# file within eight levels, no package.json within five naming
# @midnight-ntwrk/*, no git remote naming midnight), so they don't add
# context, run `compact check`, or scan the tree on unrelated work. The
# baseline is deferred, not empty: contracts that existed before the session
# are never flagged, a contract the session writes is. A snapshot too big for
# one command-line argument still works.

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

# Sets a file's mtime to an hour ago (GNU touch -d, else BSD touch -t).
age_file() {
  touch -d "@$(( $(date +%s) - 3600 ))" "$1" 2>/dev/null \
    || touch -t "$(date -r $(( $(date +%s) - 3600 )) +%Y%m%d%H%M.%S)" "$1"
}

is_midnight() { if compact_is_midnight_project "$1"; then echo yes; else echo no; fi; }

echo "--- project detection"
new_root; printf 'print(1)\n' > "$R/app.py"
chk_eq "plain python project is not Midnight" "no" "$(is_midnight "$R")"

new_root; mkdir -p "$R/node_modules/x" "$R/.hidden"
printf 'contract' > "$R/node_modules/x/a.compact"; printf 'contract' > "$R/.hidden/a.compact"
chk_eq ".compact only in node_modules or hidden dirs is not Midnight" "no" "$(is_midnight "$R")"

new_root; mkdir -p "$R/a/b/c/d/e/f/g"; printf 'contract' > "$R/a/b/c/d/e/f/g/x.compact"
chk_eq ".compact eight levels down is Midnight" "yes" "$(is_midnight "$R")"

new_root; mkdir -p "$R/packages/apps/loan/contract"
printf '{"dependencies":{"@midnight-ntwrk/compact-runtime":"0.21.0"}}' > "$R/packages/apps/loan/contract/package.json"
chk_eq "Midnight package.json five levels down is Midnight" "yes" "$(is_midnight "$R")"

new_root; mkdir -p "$R/.git"
printf '[remote "origin"]\n\turl = https://github.com/midnightntwrk/midnight-docs.git\n' > "$R/.git/config"
chk_eq "git remote naming midnight is Midnight" "yes" "$(is_midnight "$R")"

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
chk_jq "baseline is deferred and the tree isn't scanned" "$STATE_FILE" '.compact_files' "null"

TRANSCRIPT="$R/transcript.jsonl"
transcript_no_compile "$TRANSCRIPT"
STOP_PAYLOAD=$(hook_payload "$R" "$SID" \
  "$(jq -cn --arg t "$TRANSCRIPT" '{transcript_path: $t, stop_hook_active: false}')")
jq '.triggers_since_last_block = 4' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
run_hook "Stop.sh" "$STOP_PAYLOAD" OUT ERR RC
chk_eq "Stop exits 0 with no contracts" "0" "$RC"
chk_eq "Stop doesn't count a trigger outside Midnight" "4" "$(jq -r '.triggers_since_last_block' "$STATE_FILE")"

echo "--- the session's first contract is flagged, older ones aren't"
# A contract the gate can't see (vendored), last changed before the session.
mkdir -p "$R/vendor/oz"; write_compact "$R" "vendor/oz/Old.compact" "contract old"
age_file "$R/vendor/oz/Old.compact"
jq --arg c "$(date -u -d "@$(( $(date +%s) - 60 ))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r $(( $(date +%s) - 60 )) +%Y-%m-%dT%H:%M:%SZ)" \
  '.created_at = $c' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
write_compact "$R" "first.compact" "contract first"
run_hook "Stop.sh" "$STOP_PAYLOAD" OUT ERR RC
chk_eq           "Stop blocks once a contract exists" "2" "$RC"
chk_contains     "block reason names the new contract" "$ERR" "first.compact"
chk_not_contains "block reason skips the pre-session contract" "$ERR" "Old.compact"
chk_jq "deferred baseline filled with the pre-session contract" "$STATE_FILE" \
  '.compact_files | keys | map(select(endswith("Old.compact"))) | length' "1"

echo "--- midnight-verify's sub-agent hook doesn't block on untouched contracts"
new_root; mkdir -p "$R/a/b/c/d/e/f/g/h"
write_compact "$R" "a/b/c/d/e/f/g/h/deep.compact" "contract deep"
age_file "$R/a/b/c/d/e/f/g/h/deep.compact"
SID="sess-sub"
STATE_FILE=$(state_path "$R" "$SID")
run_hook "SessionStart-compact-check.sh" "$(hook_payload "$R" "$SID")" _ _ _
jq --arg c "$(date -u -d "@$(( $(date +%s) - 60 ))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r $(( $(date +%s) - 60 )) +%Y-%m-%dT%H:%M:%SZ)" \
  '.created_at = $c' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
# Gets past the hook's first check (compact-runtime installed) to the contract check.
transcript_line "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "npm install @midnight-ntwrk/compact-runtime" > "$R/t.jsonl"
run_hook_at "$PLUGINS_DIR/midnight-verify/scripts/hooks/subagent-stop-contract-writer.sh" \
  "$(hook_payload "$R" "$SID" "$(jq -cn --arg t "$R/t.jsonl" '{transcript_path: $t, agent_transcript_path: $t}')")" \
  OUT ERR RC
chk_eq "contract-writer SubagentStop exits 0" "0" "$RC"
chk_not_contains "no block on the untouched deep contract" "$ERR" "deep.compact"

echo "--- a queued reminder is dropped once the contract is gone"
new_root; write_compact "$R" "gone.compact" "contract gone"
SID="sess-gone"
STATE_FILE=$(state_path "$R" "$SID")
run_hook "SessionStart-compact-check.sh" "$(hook_payload "$R" "$SID")" _ _ _
jq '.on_next_user_prompt = [{type: "compact-not-compiled", files: ["gone.compact"]}]' \
  "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
rm -f "$R/gone.compact"
transcript_no_compile "$R/t.jsonl"
run_hook "Stop.sh" "$(hook_payload "$R" "$SID" "$(jq -cn --arg t "$R/t.jsonl" '{transcript_path: $t}')")" OUT ERR RC
chk_eq "Stop exits 0" "0" "$RC"
chk_jq "compact-not-compiled reminder dropped" "$STATE_FILE" '.on_next_user_prompt | length' "0"

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
