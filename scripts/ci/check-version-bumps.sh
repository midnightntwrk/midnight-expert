#!/usr/bin/env bash
# check-version-bumps.sh - Fail when a plugin changes without a version bump
#
# Claude Code only offers an update when a plugin's plugin.json version
# changes, so a plugin whose files change without a bump never reaches
# installed users.
#
# Usage: check-version-bumps.sh <base-ref>
#   Compares HEAD against the merge base with <base-ref>. Every plugin under
#   plugins/ with a changed file (a file moved between plugins counts for
#   both) must have a plugin.json version greater than the one at the merge
#   base. New and deleted plugins are skipped.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/colors.sh"

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <base-ref>" >&2
    exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required but not installed"
    exit 1
fi

BASE_REF="$1"
MERGE_BASE=$(git merge-base "$BASE_REF" HEAD)

# Returns 0 when pre-release $1 is greater than pre-release $2 (semver rules:
# dot-separated identifiers, numeric ones compared as numbers and below
# alphanumeric ones, and a longer list wins when one is a prefix of the other).
prerelease_gt() {
    local -a a b
    IFS=. read -ra a <<<"$1"
    IFS=. read -ra b <<<"$2"
    local i x y
    for ((i = 0; i < ${#a[@]} && i < ${#b[@]}; i++)); do
        x="${a[i]}" y="${b[i]}"
        [[ "$x" == "$y" ]] && continue
        if [[ "$x" =~ ^[0-9]+$ && "$y" =~ ^[0-9]+$ ]]; then
            ((10#$x > 10#$y))
            return
        fi
        [[ "$x" =~ ^[0-9]+$ ]] && return 1
        [[ "$y" =~ ^[0-9]+$ ]] && return 0
        [[ "$x" > "$y" ]]
        return
    done
    ((${#a[@]} > ${#b[@]}))
}

# Returns 0 when $1 is a greater semver version than $2, 1 when it isn't,
# and 2 when either isn't x.y.z or x.y.z-pre.release. Build metadata (+...)
# is ignored, as semver says.
version_gt() {
    local va="${1%%+*}" vb="${2%%+*}"
    local a="${va%%-*}" b="${vb%%-*}" pa="" pb=""
    [[ "$va" == *-* ]] && pa="${va#*-}"
    [[ "$vb" == *-* ]] && pb="${vb#*-}"
    local re='^[0-9]+\.[0-9]+\.[0-9]+$'
    [[ "$a" =~ $re && "$b" =~ $re ]] || return 2
    local a1 a2 a3 b1 b2 b3
    IFS=. read -r a1 a2 a3 <<<"$a"
    IFS=. read -r b1 b2 b3 <<<"$b"
    ((10#$a1 != 10#$b1)) && { ((10#$a1 > 10#$b1)); return; }
    ((10#$a2 != 10#$b2)) && { ((10#$a2 > 10#$b2)); return; }
    ((10#$a3 != 10#$b3)) && { ((10#$a3 > 10#$b3)); return; }
    # Same x.y.z: a release is greater than any of its pre-releases.
    [[ -z "$pa" && -z "$pb" ]] && return 1
    [[ -z "$pa" ]] && return 0
    [[ -z "$pb" ]] && return 1
    prerelease_gt "$pa" "$pb"
}

print_section "Checking plugin version bumps against ${BASE_REF} (${MERGE_BASE:0:8})"

CHANGED_PLUGINS=$(git diff --name-only --no-renames "$MERGE_BASE" HEAD -- plugins/ \
    | awk -F/ 'NF > 2 { print $2 }' | sort -u)

if [[ -z "$CHANGED_PLUGINS" ]]; then
    print_info "No plugin changes"
    exit 0
fi

HAS_ERRORS=false

while IFS= read -r plugin; do
    plugin_json="plugins/$plugin/.claude-plugin/plugin.json"

    if [[ ! -f "$plugin_json" ]]; then
        print_info "$plugin: removed, skipping"
        continue
    fi
    if ! git cat-file -e "$MERGE_BASE:$plugin_json" 2>/dev/null; then
        print_info "$plugin: new plugin, skipping"
        continue
    fi

    old=$(git show "$MERGE_BASE:$plugin_json" | jq -r '.version // empty')
    new=$(jq -r '.version // empty' "$plugin_json")

    if [[ -z "$new" ]]; then
        print_error "$plugin: plugin.json has no version"
        HAS_ERRORS=true
        continue
    fi

    if [[ -z "$old" ]]; then
        print_success "$plugin: version added ($new)"
        continue
    fi

    rc=0
    version_gt "$new" "$old" || rc=$?
    case $rc in
        0) print_success "$plugin: $old -> $new" ;;
        1)
            print_error "$plugin changed but its version is $new (was $old). Bump the version in $plugin_json."
            HAS_ERRORS=true
            ;;
        *)
            print_error "$plugin: can't compare versions '$new' and '$old', use x.y.z or x.y.z-pre.release"
            HAS_ERRORS=true
            ;;
    esac
done <<<"$CHANGED_PLUGINS"

if [[ "$HAS_ERRORS" == "true" ]]; then
    exit 1
fi
print_success "Every changed plugin has a version bump"
