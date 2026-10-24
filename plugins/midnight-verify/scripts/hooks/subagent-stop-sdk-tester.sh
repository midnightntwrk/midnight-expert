#!/usr/bin/env bash
set -euo pipefail

# SubagentStop hook for midnight-verify:sdk-tester
# Verifies the agent set up a workspace and loaded the devnet skill

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi
TRANSCRIPT=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty')

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  exit 0  # No transcript available, allow
fi


# Check 1: Verify workspace was created
if ! grep -qE '\.midnight-expert/verify/sdk-workspace|\.midnight-expert/verify/wallet-sdk-workspace' "$TRANSCRIPT"; then
  cat >&2 <<'EOF'
{"decision":"block","reason":"You must follow the process as described in the `midnight-verify:verify-by-devnet` skill. Do not attempt to take shortcuts. Only verifications which have followed the process will be accepted and not blocked."}
EOF
  exit 2
fi

# Check 2: Verify devnet skill was loaded
if ! grep -qE 'midnight-tooling:devnet' "$TRANSCRIPT"; then
  cat >&2 <<'EOF'
{"decision":"block","reason":"You must follow the process as described in the `midnight-verify:verify-by-devnet` skill. Do not attempt to take shortcuts. Only verifications which have followed the process will be accepted and not blocked."}
EOF
  exit 2
fi

exit 0
