#!/usr/bin/env bash
set -euo pipefail

# resolve-versions.sh
# Queries Docker Hub for the latest stable (X.Y.Z) tags of Midnight devnet images.
# Output: key=value pairs, one per line
#   node=X.Y.Z
#   indexer=X.Y.Z
#   proof-server=X.Y.Z
# Exit 0 on success, 1 on failure.

# Check dependencies
for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: Required command '${cmd}' not found. Please install it." >&2
    exit 1
  fi
done

# Each entry: key|image|max_exclusive
# max_exclusive (optional) caps version resolution to tags strictly below the
# given version. This keeps the local devnet on images that actually work as a
# self-contained dev network, rather than blindly taking the highest tag on
# Docker Hub:
# The caps keep every image on the ledger 9 line the networks run (support
# matrix: node 2.1.x, indexer 4.4.x, proof server 9.0.x) while still taking
# patch releases. A new minor needs checking against the compiler pin
# (plugins/midnight-tooling/network-supported-compiler.txt) before a cap moves.
# midnightntwrk/midnight-examples runs the same set locally in CI.
IMAGES=(
  "node|midnightntwrk/midnight-node|2.2.0"
  "indexer|midnightntwrk/indexer-standalone|4.5.0"
  "proof-server|midnightntwrk/proof-server|9.1.0"
)

# Fetch all tags for an image from Docker Hub, handling pagination.
# Docker Hub returns max 100 results per page.
fetch_tags() {
  local image="$1"
  local url="https://hub.docker.com/v2/repositories/${image}/tags/?page_size=100&ordering=last_updated"
  local all_tags=""

  while [ -n "$url" ] && [ "$url" != "null" ]; do
    local response
    response=$(curl -sf --max-time 15 "$url") || {
      echo "ERROR: Failed to fetch tags for ${image}. Is Docker Hub reachable?" >&2
      return 1
    }

    local page_tags
    page_tags=$(echo "$response" | jq -r '.results[].name // empty')
    all_tags="${all_tags}${all_tags:+$'\n'}${page_tags}"

    url=$(echo "$response" | jq -r '.next // "null"')
  done

  echo "$all_tags"
}

# Filter tags to pure X.Y.Z semver (no pre-release, no arch suffix, no rc/alpha/beta).
# Returns the highest version, optionally strictly below $2 (max_exclusive).
highest_stable() {
  local tags="$1"
  local max_exclusive="${2:-}"
  local stable
  stable=$(echo "$tags" \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -t. -k1,1n -k2,2n -k3,3n)

  if [ -n "$max_exclusive" ]; then
    # Keep only versions strictly less than max_exclusive (numeric semver compare).
    stable=$(echo "$stable" | awk -F. -v m="$max_exclusive" '
      BEGIN { split(m, mm, ".") }
      {
        if ($1 < mm[1]) { print; next }
        if ($1 > mm[1]) { next }
        if ($2 < mm[2]) { print; next }
        if ($2 > mm[2]) { next }
        if ($3 < mm[3]) { print }
      }')
  fi

  echo "$stable" | tail -1
}

errors=0

for entry in "${IMAGES[@]}"; do
  IFS='|' read -r name image max_exclusive <<< "$entry"

  tags=$(fetch_tags "$image") || { errors=$((errors + 1)); continue; }

  version=$(highest_stable "$tags" "$max_exclusive")
  if [ -z "$version" ]; then
    echo "ERROR: No stable version found for ${image}" >&2
    errors=$((errors + 1))
    continue
  fi

  echo "${name}=${version}"
done

if [ "$errors" -gt 0 ]; then
  exit 1
fi
