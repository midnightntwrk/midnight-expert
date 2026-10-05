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

SUPPORT_MATRIX_URL="https://docs.midnight.network/relnotes/support-matrix"
SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'

# --- Helper: true when $1 sorts strictly before $2 as a version ---
version_lt() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]
}

# --- Helper: print the network-supported compiler pin, or nothing ---
# The pin is owned by midnight-tooling (network-supported-compiler.txt), the
# same file install-cli and the example-compile CI read. Candidate locations:
#   1. repo checkout: plugins/compact-core and plugins/midnight-tooling are siblings
#   2. plugin cache:  the midnight-tooling installPath recorded in installed_plugins.json
#   3. plugin cache:  the highest <marketplace>/midnight-tooling/<version>/ directory
read_supported_version() {
  local plugin_root marketplace_dir marketplace installed_json install_path cached f v
  local -a candidates=()

  plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  candidates+=("$plugin_root/../midnight-tooling/network-supported-compiler.txt")

  marketplace_dir="$(cd "$plugin_root/../.." 2>/dev/null && pwd || true)"
  marketplace="$(basename "${marketplace_dir:-/}")"
  installed_json="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json"
  if [ -r "$installed_json" ]; then
    install_path="$(jq -r --arg key "midnight-tooling@${marketplace}" \
      '.plugins[$key][0].installPath // empty' "$installed_json" 2>/dev/null || true)"
    if [ -n "$install_path" ]; then
      candidates+=("$install_path/network-supported-compiler.txt")
    fi
  fi

  if [ -n "$marketplace_dir" ] && [ -d "$marketplace_dir/midnight-tooling" ]; then
    cached="$(ls -1 "$marketplace_dir/midnight-tooling" 2>/dev/null | sort -V | tail -1 || true)"
    if [ -n "$cached" ]; then
      candidates+=("$marketplace_dir/midnight-tooling/$cached/network-supported-compiler.txt")
    fi
  fi

  for f in "${candidates[@]}"; do
    if [ -r "$f" ]; then
      v="$(tr -d '[:space:]' < "$f" || true)"
      if [[ "$v" =~ $SEMVER_RE ]]; then
        printf '%s' "$v"
        return 0
      fi
    fi
  done
  return 0
}

# --- Check 2: Is the compiler the network-supported version? ---
# "Latest published" and "network-supported" are different things: the newest
# compiler routinely outpaces what live networks accept, and contracts built
# with it pass every local check and fail at deploy (#261, #273). The
# network-supported pin decides the advice; `compact check` only says whether
# something newer exists.
check_output="$(compact check 2>&1 || true)"
current_version="$(compact compile --version 2>/dev/null || true)"
lang_version="$(compact compile --language-version 2>/dev/null || true)"
supported_version="$(read_supported_version || true)"

if ! [[ "$current_version" =~ $SEMVER_RE ]]; then
  current_version=""
fi

if echo "$check_output" | grep -qi "Up to date"; then
  latest_version="$current_version"
else
  # compact check output format: "compact: <arch> -- <status> -- <version>"
  # followed by "compact: Latest version available: <version>."
  latest_version="$(echo "$check_output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | tail -1 || true)"
fi
if ! [[ "$latest_version" =~ $SEMVER_RE ]]; then
  latest_version=""
fi

pragma_advice=""
if [[ "$lang_version" =~ $SEMVER_RE ]]; then
  pragma_advice=" Pin your pragma to this exact language version, \`pragma language_version ${lang_version%.*};\`, so contracts declare the version they were verified against, rather than an open-ended \`>=\` that silently accepts untested future versions."
fi

newer_published=""
if [ -n "$supported_version" ] && [ -n "$latest_version" ] && version_lt "$supported_version" "$latest_version"; then
  newer_published=" A newer compiler (v${latest_version}) is published, but it is not network-supported yet — do not upgrade to it for anything you intend to deploy."
fi

if [ -z "$current_version" ]; then
  msg="$COMMON_CONTEXT"
elif [ -n "$supported_version" ] && [ "$current_version" = "$supported_version" ]; then
  msg="You are using compact compiler v${current_version}, the network-supported version.${pragma_advice}${newer_published}

${COMMON_CONTEXT}"
elif [ -n "$supported_version" ] && version_lt "$current_version" "$supported_version"; then
  msg="Your compact compiler v${current_version} is older than the network-supported version v${supported_version}. Use the \`/midnight-tooling:install-cli\` command to install v${supported_version} (it installs the network-supported version, not the latest published one) before writing Compact you intend to deploy.${newer_published}

${COMMON_CONTEXT}"
elif [ -n "$supported_version" ]; then
  msg="Your compact compiler v${current_version} is newer than the network-supported version v${supported_version}. No live network accepts contracts compiled with it yet — they pass every local check and fail at deploy. For anything you intend to deploy, switch with \`compact update ${supported_version}\` (or the \`/midnight-tooling:install-cli\` command). See ${SUPPORT_MATRIX_URL}.

${COMMON_CONTEXT}"
elif [ -n "$latest_version" ] && version_lt "$current_version" "$latest_version"; then
  # Pin unreadable: say a newer compiler exists, but never tell the agent to upgrade.
  msg="You are using compact compiler v${current_version}; v${latest_version} is published. The newest published compiler is often not network-supported yet — check ${SUPPORT_MATRIX_URL} before changing versions, and do not upgrade for anything you intend to deploy unless the matrix lists it.

${COMMON_CONTEXT}"
else
  msg="You are using the most recent published compact compiler v${current_version}. Confirm it is listed at ${SUPPORT_MATRIX_URL} before deploying — the newest compiler is often not network-supported yet.${pragma_advice}

${COMMON_CONTEXT}"
fi

emit_json "$msg"
exit 0
