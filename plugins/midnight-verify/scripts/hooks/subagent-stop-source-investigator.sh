#!/usr/bin/env bash
set -euo pipefail

# SubagentStop hook for midnight-verify:source-investigator
# Verifies the agent actually inspected source code

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi
TRANSCRIPT=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty')

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  exit 0  # No transcript available, allow
fi


# Check 1: Verify source code was inspected via GitHub tools or git clone
if ! grep -qE 'mcp__octocode-mcp__githubSearchCode|mcp__octocode-mcp__githubGetFileContent|mcp__octocode-mcp__githubViewRepoStructure|git clone' "$TRANSCRIPT"; then
  cat >&2 <<'EOF'
{"decision":"block","reason":"You must follow the process as described in the `midnight-verify:verify-by-source` skill. Do not attempt to take shortcuts. Only verifications which have followed the process will be accepted and not blocked."}
EOF
  exit 2
fi

exit 0
