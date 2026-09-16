#!/usr/bin/env bash

# SessionStart hook for the compact-core plugin.
# Checks compact CLI availability, compiler version, and language version.
# Outputs JSON to stdout for the hook system.
#
# IMPORTANT: This script must NEVER exit with a non-zero code or fail to
# produce valid JSON on stdout — doing so could block the session from
# starting. All commands are guarded and the script falls back to static
# context if anything goes wrong.

COMMON_CONTEXT='The Midnight Network is under active development with frequent breaking changes. Do not assume stability across versions.

The newest published compiler may outpace live-network support — prefer the latest **network-supported** compiler over the absolute latest for anything you intend to deploy. "Latest available" is not the same as "latest supported".

All `@midnight-ntwrk/*` packages are published on public npm. Do not add custom registry configuration — no `.npmrc` or `.yarnrc.yml` registry overrides. Verify package versions with `npm view`, never from memory.

You should check for new compact developer tools, compact compiler, and Midnight SDK versions regularly.

```
compact check # check for new compact compiler versions (cached with 15m TTL)
compact self check # check for new compact developer tools versions (cached with 15m TTL)
npm view <package-name> version # check for latest version of <package-name>
```'

# Pre-built fallback JSON containing only the static context.
# Used whenever jq is missing or anything else goes wrong — no escaping needed
# because this is a known-safe literal string.
FALLBACK_JSON='{"continue":true,"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The Midnight Network is under active development with frequent breaking changes. Do not assume stability across versions.\n\nThe newest published compiler may outpace live-network support — prefer the latest **network-supported** compiler over the absolute latest for anything you intend to deploy. \"Latest available\" is not the same as \"latest supported\".\n\nAll `@midnight-ntwrk/*` packages are published on public npm. Do not add custom registry configuration — no `.npmrc` or `.yarnrc.yml` registry overrides. Verify package versions with `npm view`, never from memory.\n\nYou should check for new compact developer tools, compact compiler, and Midnight SDK versions regularly.\n\n```\ncompact check # check for new compact compiler versions (cached with 15m TTL)\ncompact self check # check for new compact developer tools versions (cached with 15m TTL)\nnpm view <package-name> version # check for latest version of <package-name>\n```"}}'

# --- Catch-all: if anything unexpected happens, emit fallback and exit clean ---
trap 'printf "%s\n" "$FALLBACK_JSON"; exit 0' ERR

# --- Gate: jq is required for dynamic messages. Without it, emit fallback. ---
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' "$FALLBACK_JSON"
  exit 0
fi

# --- Helper: emit the hook JSON via jq ---
emit_json() {
  jq -n \
    --arg ctx "$1" \
    '{
      "continue": true,
      "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": $ctx
      }
    }'
}

# --- Check 1: Is the compact CLI installed? ---
if ! command -v compact >/dev/null 2>&1; then
  msg="Could not find the compact developer tools. Use the \`/midnight-tooling:install-cli\` command to install them.

${COMMON_CONTEXT}"

  emit_json "$msg"
  exit 0
fi

# --- Check 2: Is the compiler up to date? ---
check_output="$(compact check 2>&1 || true)"
current_version="$(compact compile --version 2>/dev/null || echo "unknown")"

if echo "$check_output" | grep -qi "Up to date"; then
  # Compiler is current — get the language version
  lang_version="$(compact compile --language-version 2>/dev/null || echo "unknown")"

  msg="You are using the most recent version of the compact compiler v${current_version}, \`pragma language_version ${lang_version%.*};\`. Pin your pragma to this exact language version so contracts declare the version they were verified against, rather than an open-ended \`>=\` that silently accepts untested future versions.

${COMMON_CONTEXT}"
else
  # Update available — try to extract the latest version from check output
  # compact check output format: "compact: <arch> -- <status> -- <version>"
  latest_version="$(echo "$check_output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | tail -1 || echo "unknown")"

  msg="A compact compiler update is available. Your current version is v${current_version}, the latest version available is v${latest_version}. Use the \`/midnight-tooling:compact-cli\` skill to upgrade your version. You should upgrade your compiler version before writing any compact code.

${COMMON_CONTEXT}"
fi

emit_json "$msg"
exit 0
