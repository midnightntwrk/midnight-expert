#!/usr/bin/env bash
# scripts/SessionStart.sh bases its compiler advice on the network-supported
# pin (midnight-tooling/network-supported-compiler.txt), not on "latest
# published". It must never tell the agent to upgrade to an unsupported
# compiler (#273). A fake `compact` binary on PATH drives each scenario.

set -euo pipefail
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SELF_DIR/_lib.sh"

SCRIPT="$PLUGINS_DIR/compact-core/scripts/SessionStart.sh"
REPO_PIN="$(tr -d '[:space:]' < "$PLUGINS_DIR/midnight-tooling/network-supported-compiler.txt")"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- Fake compact CLI -------------------------------------------------------
mkdir -p "$TMP/bin"
cat > "$TMP/bin/compact" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  check)
    if [ "$FAKE_LATEST" = "$FAKE_CURRENT" ]; then
      echo "compact: x86_64-unknown-linux-musl -- Up to date -- $FAKE_CURRENT"
    else
      echo "compact: x86_64-unknown-linux-musl -- Update Available -- $FAKE_CURRENT"
      echo "compact: Latest version available: $FAKE_LATEST."
    fi
    ;;
  "compile --version") echo "$FAKE_CURRENT" ;;
  "compile --language-version") echo "$FAKE_LANG" ;;
esac
EOF
chmod +x "$TMP/bin/compact"

# Sibling layout (as in the repo), with a pin we control.
mkdir -p "$TMP/plugins/compact-core" "$TMP/plugins/midnight-tooling"
echo "0.31.1" > "$TMP/plugins/midnight-tooling/network-supported-compiler.txt"
SIBLING_ROOT="$TMP/plugins/compact-core"

# No pin anywhere.
mkdir -p "$TMP/nopin/compact-core"
NOPIN_ROOT="$TMP/nopin/compact-core"

# Plugin-cache layout: <marketplace>/<plugin>/<version>/. The highest
# midnight-tooling version directory carries the pin.
mkdir -p "$TMP/cache/mkt/compact-core/0.12.0" \
         "$TMP/cache/mkt/midnight-tooling/0.3.0" \
         "$TMP/cache/mkt/midnight-tooling/0.10.0"
echo "0.29.0" > "$TMP/cache/mkt/midnight-tooling/0.3.0/network-supported-compiler.txt"
echo "0.31.1" > "$TMP/cache/mkt/midnight-tooling/0.10.0/network-supported-compiler.txt"
CACHE_ROOT="$TMP/cache/mkt/compact-core/0.12.0"

# Plugin-cache layout where only installed_plugins.json knows the path.
mkdir -p "$TMP/cache2/mkt2/compact-core/0.12.0" "$TMP/elsewhere/midnight-tooling" "$TMP/home2/.claude/plugins"
echo "0.31.1" > "$TMP/elsewhere/midnight-tooling/network-supported-compiler.txt"
jq -n --arg p "$TMP/elsewhere/midnight-tooling" \
  '{version: 2, plugins: {"midnight-tooling@mkt2": [{scope: "user", installPath: $p}]}}' \
  > "$TMP/home2/.claude/plugins/installed_plugins.json"
INSTALLED_ROOT="$TMP/cache2/mkt2/compact-core/0.12.0"

# run_session_start <plugin_root|""> <current> <latest> <lang> <home>
# Sets CTX to the emitted additionalContext and RAW to the raw stdout.
run_session_start() {
  local root="$1" current="$2" latest="$3" lang="$4" home="${5:-$TMP/home}"
  mkdir -p "$home"
  local -a env_args=(PATH="$TMP/bin:$PATH" HOME="$home"
    FAKE_CURRENT="$current" FAKE_LATEST="$latest" FAKE_LANG="$lang")
  if [ -n "$root" ]; then
    env_args+=(CLAUDE_PLUGIN_ROOT="$root")
  fi
  RAW=$(env -u CLAUDE_PLUGIN_ROOT -u CLAUDE_CONFIG_DIR "${env_args[@]}" bash "$SCRIPT" </dev/null)
  CTX=$(printf '%s' "$RAW" | jq -r '.hookSpecificOutput.additionalContext')
}

UPGRADE_NEEDLE="You should upgrade"

echo "--- on the pinned version, newer compiler published (the #273 repro)"
run_session_start "$SIBLING_ROOT" "0.31.1" "0.35.0" "0.23.0"
chk_jq "emits valid hook JSON" <(printf '%s' "$RAW") '.continue' "true"
chk_contains "says current is network-supported" "$CTX" "v0.31.1, the network-supported version"
chk_contains "warns not to upgrade to the newer compiler" "$CTX" "A newer compiler (v0.35.0) is published, but it is not network-supported yet"
chk_contains "pins pragma to the supported language version" "$CTX" "pragma language_version 0.23;"
chk_not_contains "no upgrade instruction" "$CTX" "$UPGRADE_NEEDLE"

echo "--- on the pinned version, nothing newer published"
run_session_start "$SIBLING_ROOT" "0.31.1" "0.31.1" "0.23.0"
chk_contains "says current is network-supported" "$CTX" "v0.31.1, the network-supported version"
chk_not_contains "no newer-compiler warning" "$CTX" "A newer compiler"

echo "--- older than the pinned version"
run_session_start "$SIBLING_ROOT" "0.30.0" "0.35.0" "0.22.0"
chk_contains "recommends installing the supported version" "$CTX" "install v0.31.1"
chk_contains "points at install-cli" "$CTX" "/midnight-tooling:install-cli"
chk_not_contains "does not recommend latest" "$CTX" "v0.35.0 is published"
chk_not_contains "no upgrade instruction" "$CTX" "$UPGRADE_NEEDLE"

echo "--- newer than the pinned version (on latest, compact check says up to date)"
run_session_start "$SIBLING_ROOT" "0.35.0" "0.35.0" "0.24.0"
chk_contains "warns it is newer than supported" "$CTX" "newer than the network-supported version v0.31.1"
chk_contains "gives the switch-back command" "$CTX" "compact update 0.31.1"
chk_not_contains "no pragma pin to the unsupported language version" "$CTX" "pragma language_version 0.24;"
chk_not_contains "no 'most recent' framing" "$CTX" "most recent published"

echo "--- pin unreadable, newer compiler published"
run_session_start "$NOPIN_ROOT" "0.31.1" "0.35.0" "0.23.0"
chk_contains "mentions the newer compiler neutrally" "$CTX" "v0.35.0 is published"
chk_contains "points at the support matrix" "$CTX" "support-matrix"
chk_not_contains "no upgrade instruction" "$CTX" "$UPGRADE_NEEDLE"

echo "--- pin unreadable, on latest"
run_session_start "$NOPIN_ROOT" "0.35.0" "0.35.0" "0.24.0"
chk_contains "asks to confirm against the support matrix" "$CTX" "Confirm it is listed at"

echo "--- plugin-cache layout: pin read from the highest midnight-tooling version"
run_session_start "$CACHE_ROOT" "0.31.1" "0.35.0" "0.23.0"
chk_contains "resolves pin via cache sibling" "$CTX" "v0.31.1, the network-supported version"

echo "--- plugin-cache layout: pin read via installed_plugins.json"
run_session_start "$INSTALLED_ROOT" "0.31.1" "0.35.0" "0.23.0" "$TMP/home2"
chk_contains "resolves pin via installed_plugins.json" "$CTX" "v0.31.1, the network-supported version"

echo "--- repo layout without CLAUDE_PLUGIN_ROOT: reads the real pin ($REPO_PIN)"
run_session_start "" "$REPO_PIN" "99.0.0" "0.23.0"
chk_contains "resolves the repo pin" "$CTX" "v${REPO_PIN}, the network-supported version"

echo "--- compact present but version unreadable"
run_session_start "$SIBLING_ROOT" "" "0.35.0" ""
chk_jq "still emits valid hook JSON" <(printf '%s' "$RAW") '.continue' "true"
chk_not_contains "no upgrade instruction" "$CTX" "$UPGRADE_NEEDLE"

summary
