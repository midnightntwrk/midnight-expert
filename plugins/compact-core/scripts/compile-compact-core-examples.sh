#!/usr/bin/env bash
# Compile every compact-core example/template .compact file standalone and fail
# if any expected-to-compile file fails. Mirrors
# plugins/compact-examples/scripts/compile-examples.sh but scoped to the
# compact-core skill examples, which previously had no compile coverage.
# Run in CI on ubuntu-latest (a CASE-SENSITIVE filesystem) so import-path case
# mismatches are caught before they reach users.
#
# Requires the `compact` toolchain on PATH (see midnight-tooling:install-cli).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Files intentionally NOT compiled standalone here:
#   - the project template carries {{ }} placeholders (e.g. __name__), so it is
#     not valid source until create-mn-app substitutes them.
#   - the compact-tokens examples `import` OpenZeppelin / security building-block
#     modules (e.g. ../security/Initializable.compact, ./openzeppelin/
#     ShieldedERC20.compact) that live in the compact-examples module tree, not
#     alongside them — they only resolve when bundled into a project. FOLLOW-UP:
#     vendor those modules into compact-core, or relocate these examples, so
#     they can be compiled here instead of skipped.
SKIP=(
  "skills/compact-init-project/templates/example/contract/__name__.compact"
  "skills/compact-tokens/examples/FungibleToken.compact"
  "skills/compact-tokens/examples/MultiToken.compact"
  "skills/compact-tokens/examples/NonFungibleToken.compact"
  "skills/compact-tokens/examples/ShieldedFungibleToken.compact"
)

is_skipped() {
  local f="$1" s
  for s in "${SKIP[@]}"; do [ "$f" = "$s" ] && return 0; done
  return 1
}

if ! command -v compact >/dev/null 2>&1; then
  echo "error: 'compact' not found on PATH. Install via the compact-installer (see midnight-tooling:install-cli)." >&2
  exit 127
fi

cd "$ROOT"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

compiled=0 skipped=0 failed=0
while IFS= read -r f; do
  rel="${f#./}"
  if is_skipped "$rel"; then
    echo "skip (not standalone-compilable): $rel"
    skipped=$((skipped + 1))
    continue
  fi
  out_dir="$tmp/$(printf '%s' "$rel" | tr '/' '_')"
  if compact compile --skip-zk "$rel" "$out_dir" >"$tmp/log" 2>&1; then
    compiled=$((compiled + 1))
  else
    echo "::error file=plugins/compact-core/$rel::compile failed"
    echo "----- $rel -----"
    tail -8 "$tmp/log" | sed 's/^/    /'
    failed=$((failed + 1))
  fi
done < <(find . -name '*.compact' | sort)

echo ""
echo "compiled=$compiled  skipped=$skipped  failed=$failed"
[ "$failed" -eq 0 ]
