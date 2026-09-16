#!/usr/bin/env bash
# Fixture-based tests for detect-project.sh.
# Each test creates a temp dir, populates it, runs detect-project.sh against
# it, and asserts specific JSON fields with jq. Exits 0 on full pass, 1 on
# any failure. No external test framework — designed to run as part of the
# skill's CI-less manual verification.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECT="$SCRIPT_DIR/detect-project.sh"

PASS=0
FAIL=0
CASE_JSON=""

assert_eq() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf '  [PASS] %s\n' "$label"
    PASS=$((PASS+1))
  else
    printf '  [FAIL] %s — expected %q, got %q\n' "$label" "$expected" "$actual" >&2
    FAIL=$((FAIL+1))
  fi
}

run_case() {
  local name="$1"
  local fixture_dir="$2"
  printf '\nCase: %s (%s)\n' "$name" "$fixture_dir"
  local out
  out="$(cd "$fixture_dir" && bash "$DETECT")"
  echo "$out" | jq . >/dev/null 2>&1 || {
    printf '  [FAIL] output is not valid JSON\n' >&2
    FAIL=$((FAIL+1))
    return
  }
  CASE_JSON="$out"
}

field() {
  echo "$CASE_JSON" | jq -r "$1"
}

# --- fixtures ---

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fixture 1: empty project
F1="$TMP/empty"
mkdir -p "$F1"
run_case "empty project" "$F1"
assert_eq "has_compact_files" "false" "$(field '.has_compact_files')"
assert_eq "has_runtime_npm_dep" "false" "$(field '.has_runtime_npm_dep')"
assert_eq "is_claude_plugin" "false" "$(field '.is_claude_plugin')"
assert_eq "category" "built-on" "$(field '.recommendation.category')"
assert_eq "add_compact_topic" "false" "$(field '.recommendation.add_compact_topic')"

# Fixture 2: real Compact dApp
F2="$TMP/compact-dapp"
mkdir -p "$F2/contracts"
cat > "$F2/contracts/counter.compact" <<'EOF'
pragma language_version 0.23;
ledger count: Counter;
EOF
cat > "$F2/package.json" <<'EOF'
{
  "name": "example-counter",
  "dependencies": {
    "@midnight-ntwrk/midnight-js-contracts": "^1.0.0"
  }
}
EOF
run_case "compact dApp" "$F2"
assert_eq "has_compact_files" "true" "$(field '.has_compact_files')"
assert_eq "has_pragma_language_version" "true" "$(field '.has_pragma_language_version')"
assert_eq "has_runtime_npm_dep" "true" "$(field '.has_runtime_npm_dep')"
assert_eq "category" "built-on" "$(field '.recommendation.category')"
assert_eq "add_compact_topic" "true" "$(field '.recommendation.add_compact_topic')"

# Fixture 3: wallet integrator (no contracts, only wallet SDK)
F3="$TMP/wallet-integrator"
mkdir -p "$F3"
cat > "$F3/package.json" <<'EOF'
{
  "name": "wallet-thing",
  "dependencies": {
    "@midnight-ntwrk/wallet-api": "^1.0.0"
  }
}
EOF
run_case "wallet integrator" "$F3"
assert_eq "has_compact_files" "false" "$(field '.has_compact_files')"
assert_eq "has_wallet_sdk_npm_dep" "true" "$(field '.has_wallet_sdk_npm_dep')"
assert_eq "category" "integrates" "$(field '.recommendation.category')"
assert_eq "add_compact_topic" "false" "$(field '.recommendation.add_compact_topic')"

# Fixture 4: Claude plugin marketplace (extends)
F4="$TMP/claude-plugin"
mkdir -p "$F4/plugins/foo/.claude-plugin"
echo '{"name":"foo","version":"0.1.0"}' > "$F4/plugins/foo/.claude-plugin/plugin.json"
run_case "claude plugin marketplace" "$F4"
assert_eq "is_claude_plugin" "true" "$(field '.is_claude_plugin')"
assert_eq "category" "extends" "$(field '.recommendation.category')"

# Fixture 5: .compact file with no pragma (should not recommend compact topic)
F5="$TMP/fake-compact"
mkdir -p "$F5"
echo "// I am not real Compact source" > "$F5/foo.compact"
run_case "fake .compact file" "$F5"
assert_eq "has_compact_files" "true" "$(field '.has_compact_files')"
assert_eq "has_pragma_language_version" "false" "$(field '.has_pragma_language_version')"
assert_eq "add_compact_topic" "false" "$(field '.recommendation.add_compact_topic')"

# Fixture 6: priority — Compact wins over CLI
F6="$TMP/compact-cli"
mkdir -p "$F6/contracts"
cat > "$F6/contracts/c.compact" <<'EOF'
pragma language_version 0.23;
EOF
cat > "$F6/package.json" <<'EOF'
{
  "name": "thing",
  "bin": "./bin/thing.js"
}
EOF
run_case "compact + CLI (priority)" "$F6"
assert_eq "has_compact_files" "true" "$(field '.has_compact_files')"
assert_eq "is_cli_tool" "true" "$(field '.is_cli_tool')"
assert_eq "category" "built-on" "$(field '.recommendation.category')"

# --- summary ---
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
