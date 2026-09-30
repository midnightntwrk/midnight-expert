#!/usr/bin/env bash
set -u

emit() {
  local name="$1"
  local status="$2"
  local detail="$3"
  detail="$(printf '%s' "$detail" | tr '\n' ';' | sed 's/  */ /g; s/; */; /g; s/; $//')"
  printf '%s | %s | %s\n' "$name" "$status" "$detail"
}

INSTALLED_PLUGINS="$HOME/.claude/plugins/installed_plugins.json"

if [ ! -f "$INSTALLED_PLUGINS" ]; then
  emit "Plugin registry" "critical" "~/.claude/plugins/installed_plugins.json not found"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  emit "cross-refs" "warn" "python3 not available — cannot validate cross-plugin references"
  exit 0
fi

# Helper: resolve install path for a plugin key (name@marketplace)
resolve_path() {
  local key="$1"
  python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
entries = data.get('plugins', {}).get(sys.argv[2], [])
if entries:
    print(entries[0].get('installPath', ''))
" "$INSTALLED_PLUGINS" "$key" 2>/dev/null
}

# Helper: get version from plugin.json at a given path
get_version() {
  local path="$1"
  if [ -f "$path/.claude-plugin/plugin.json" ]; then
    python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
print(data.get('version', 'unknown'))
" "$path/.claude-plugin/plugin.json" 2>/dev/null
  fi
}

# Helper: check if a skill exists at a plugin install path
check_skill() {
  local install_path="$1"
  local skill_name="$2"
  [ -f "$install_path/skills/$skill_name/SKILL.md" ]
}

# Helper: check if an agent exists at a plugin install path
check_agent() {
  local install_path="$1"
  local agent_name="$2"
  [ -f "$install_path/agents/$agent_name.md" ]
}

# Helper: check if a slash command exists at a plugin install path
check_command() {
  local install_path="$1"
  local command_name="$2"
  [ -f "$install_path/commands/$command_name.md" ]
}

fail=0

# Resolve all unique target plugins upfront into a temp file (avoids bash 4+ associative arrays)
CACHE_FILE="$(mktemp)"
trap 'rm -f "$CACHE_FILE"' EXIT

resolve_and_cache() {
  local key="$1"
  # Check if already cached
  if grep -q "^$key|" "$CACHE_FILE" 2>/dev/null; then
    return
  fi
  local rpath
  rpath="$(resolve_path "$key")"
  local rver=""
  if [ -n "$rpath" ]; then
    rver="$(get_version "$rpath")"
    rver="${rver:-unknown}"
  fi
  printf '%s|%s|%s\n' "$key" "$rpath" "$rver" >> "$CACHE_FILE"
}

get_cached_path() {
  grep "^$1|" "$CACHE_FILE" 2>/dev/null | head -1 | cut -d'|' -f2
}

get_cached_version() {
  grep "^$1|" "$CACHE_FILE" 2>/dev/null | head -1 | cut -d'|' -f3
}

# Cross-plugin reference map
# Format: source_plugin|target_plugin@marketplace|ref_type|ref_name
# ref_type: skill | agent | command
REFS=(
  # compact-core → midnight-tooling (skills)
  "compact-core|midnight-tooling@midnight-expert|skill|compact-cli"
  "compact-core|midnight-tooling@midnight-expert|skill|devnet"
  "compact-core|midnight-tooling@midnight-expert|skill|proof-server"
  "compact-core|midnight-tooling@midnight-expert|skill|troubleshooting"
  # compact-core → midnight-tooling (commands)
  "compact-core|midnight-tooling@midnight-expert|command|doctor"
  "compact-core|midnight-tooling@midnight-expert|command|install-cli"
  # compact-core → devs (external)
  "compact-core|devs@agent-foundry|skill|code-review"
  "compact-core|devs@agent-foundry|skill|typescript-core"
  "compact-core|devs@agent-foundry|skill|security-core"
  # midnight-verify → compact-core (skills)
  "midnight-verify|compact-core@midnight-expert|skill|compact-standard-library"
  "midnight-verify|compact-core@midnight-expert|skill|compact-structure"
  "midnight-verify|compact-core@midnight-expert|skill|compact-language-ref"
  "midnight-verify|compact-core@midnight-expert|skill|compact-privacy-disclosure"
  "midnight-verify|compact-core@midnight-expert|skill|compact-witness-ts"
  "midnight-verify|compact-core@midnight-expert|skill|compact-review"
  # midnight-verify → midnight-tooling
  "midnight-verify|midnight-tooling@midnight-expert|skill|compact-cli"
  "midnight-verify|midnight-tooling@midnight-expert|skill|devnet"
  "midnight-verify|midnight-tooling@midnight-expert|command|install-cli"
  # midnight-verify → devs (external)
  "midnight-verify|devs@agent-foundry|agent|deps-maintenance"
  # midnight-fact-check → midnight-verify (agents)
  "midnight-fact-check|midnight-verify@midnight-expert|agent|contract-writer"
  "midnight-fact-check|midnight-verify@midnight-expert|agent|source-investigator"
  "midnight-fact-check|midnight-verify@midnight-expert|agent|type-checker"
  "midnight-fact-check|midnight-verify@midnight-expert|agent|cli-tester"
  "midnight-fact-check|midnight-verify@midnight-expert|agent|sdk-tester"
  "midnight-fact-check|midnight-verify@midnight-expert|agent|witness-verifier"
  "midnight-fact-check|midnight-verify@midnight-expert|agent|zkir-checker"
  # midnight-fact-check → midnight-verify (skills)
  "midnight-fact-check|midnight-verify@midnight-expert|skill|verify-correctness"
  # midnight-cq → midnight-tooling
  "midnight-cq|midnight-tooling@midnight-expert|skill|troubleshooting"
)

# Pre-resolve all unique targets
for ref in "${REFS[@]}"; do
  target="$(printf '%s' "$ref" | cut -d'|' -f2)"
  resolve_and_cache "$target"
done

for ref in "${REFS[@]}"; do
  IFS='|' read -r source target ref_type ref_name <<< "$ref"

  target_path="$(get_cached_path "$target")"
  target_ver="$(get_cached_version "$target")"
  target_name="${target%%@*}"

  # Check if target plugin is installed
  if [ -z "$target_path" ]; then
    if [ "$target_name" = "devs" ]; then
      emit "$source → $target_name:$ref_name" "critical" "devs plugin not installed — fix: claude plugin marketplace add aaronbassett/agent-foundry && claude plugin install devs@agent-foundry"
    else
      emit "$source → $target_name:$ref_name" "critical" "$target_name not installed"
    fi
    fail=1
    continue
  fi

  # Check if specific skill/agent/command exists
  case "$ref_type" in
    skill)   check_skill "$target_path" "$ref_name"; found=$? ;;
    agent)   check_agent "$target_path" "$ref_name"; found=$? ;;
    command) check_command "$target_path" "$ref_name"; found=$? ;;
    *)
      emit "$source → $target_name:$ref_name" "warn" "unknown ref type '$ref_type'"
      fail=1
      continue
      ;;
  esac

  if [ "$found" -eq 0 ]; then
    emit "$source → $target_name:$ref_name" "pass" "$ref_type found ($target_name v$target_ver)"
  else
    emit "$source → $target_name:$ref_name" "warn" "$ref_type not found in $target_name v$target_ver — update may be needed"
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  emit "ALL_REFS_PASS" "pass" "all cross-plugin references resolved"
fi
