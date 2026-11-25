#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook: inject a "training data is unreliable" warning so the
# model treats recalled Midnight/Compact/SDK knowledge as suspect and prefers
# verification. The .compact hash-baseline + Stop/SessionEnd compile-check
# logic that used to live alongside this script has moved to the compact-core
# plugin (plugins/compact-core/scripts/hooks/).

# Outside a Midnight project, stay silent. Every session runs this hook, and
# the warning is noise on unrelated work. If the helper can't be loaded,
# fall through and warn as before.
HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
fi
HOOK_CWD="$(printf '%s' "$HOOK_INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)"
GATE_ROOT="${CLAUDE_PROJECT_DIR:-${HOOK_CWD:-$(pwd)}}"
GATE_HELPER="$(dirname "${BASH_SOURCE[0]}")/_compact-check.sh"
if [ -r "$GATE_HELPER" ] && source "$GATE_HELPER" 2>/dev/null \
   && ! compact_is_midnight_project "$GATE_ROOT"; then
  exit 0
fi

ADDITIONAL_CONTEXT="WARNING: Your training data about Midnight, Compact, and the Midnight SDK is UNRELIABLE. It contains known errors and is likely outdated.

Do NOT trust your recalled knowledge about:
- Compact syntax, types, or operators
- Standard library functions (names, signatures, behavior)
- SDK API signatures, package names, or import paths
- Tooling behavior, CLI flags, or configuration
- Privacy/disclosure rules
- Transaction semantics or protocol behavior

Everything you 'know' about the Midnight Network and Compact is suspect. Treat your training data as potentially wrong.

Before presenting ANY Compact code, SDK usage, or Midnight-specific claims to the user:
1. Verify using /verify or by dispatching the appropriate midnight-verify agent
2. Compilation alone does NOT prove correctness — code must be compiled AND executed
3. Prefer skill content from midnight-expert plugins over recalled knowledge, but even skills are hints, not proof

The cost of checking is low. The cost of presenting wrong information is high. When in doubt, VERIFY.

The current date is: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

if which compact > /dev/null 2>&1; then
  ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT}

You can check for the latest version of the Compact compiler with \`compact check\`"
fi

if which npm > /dev/null 2>&1; then
  ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT}

You can check for the latest version of the Midnight SDK with \`npm view @midnight-ntwrk/midnight-js\`"
fi

jq -n --arg ctx "$ADDITIONAL_CONTEXT" '{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $ctx
  }
}'
