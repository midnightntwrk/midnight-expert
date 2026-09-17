#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOOKUP="$SCRIPT_DIR/lookup.sh"

# Use any existing entry that has a reference_anchor (created in later tasks).
# For this test we use a synthetic codes.json + fixture markdown.

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Mirror the real script + resolver into TMPDIR so paths resolve correctly
cp "$SCRIPT_DIR/lookup.sh" "$TMPDIR/lookup.sh"
cp "$SCRIPT_DIR/resolve-anchor.sh" "$TMPDIR/resolve-anchor.sh"
chmod +x "$TMPDIR/lookup.sh" "$TMPDIR/resolve-anchor.sh"

# Synthetic markdown reference
cat > "$TMPDIR/refs.md" <<'MD'
# Top

## Synthetic anchor target

This is the body the lookup script must render verbatim.
Two lines.

## Other heading

Other body.
MD

# Synthetic codes.json with one entry pointing to that anchor
cat > "$TMPDIR/codes.json" <<JSON
{
  "version": "test",
  "generated": "2026-05-04",
  "entries": [
    {
      "code": "synthetic-test",
      "name": "Synthetic test entry",
      "source": "compact-compiler",
      "category": "diagnostic",
      "phase": "type-check",
      "id": "compiler.type-check.synthetic-test",
      "group": {"name": "Synth", "description": "Synth group"},
      "description": "Synthetic entry for the test.",
      "fixes": ["Do nothing"],
      "aliases": ["alt-name"],
      "severity": "error",
      "see_also": [],
      "reference_anchor": "refs.md#synthetic-anchor-target",
      "verified_against": {
        "source_repo": "LFDT-Minokawa/compact",
        "ref": "compactc-v0.31.1",
        "anchor": "compiler/test.ss:1",
        "anchor_modified": "2026-04-29",
        "verified_at": "2026-05-04"
      }
    }
  ]
}
JSON

OUT=$(bash "$TMPDIR/lookup.sh" --code synthetic-test 2>&1)

PASS=0; FAIL=0
chk() { if grep -qF "$2" <<<"$OUT"; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; echo "$OUT" | sed 's/^/  | /'; FAIL=$((FAIL+1)); fi; }

chk "renders code"          "Code: synthetic-test"
chk "renders phase"         "Phase: type-check"
chk "renders id"            "ID: compiler.type-check.synthetic-test"
chk "renders anchor body"   "This is the body the lookup script must render verbatim."
chk "renders anchor body 2" "Two lines."
[[ "$OUT" != *"Other body"* ]] && { echo "PASS: anchor stops at next heading"; PASS=$((PASS+1)); } || { echo "FAIL: anchor leaked"; FAIL=$((FAIL+1)); }

echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
