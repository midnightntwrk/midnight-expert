#!/usr/bin/env bash
# Spin up a temp project with the LATEST published @midnightntwrk/wallet-sdk-*
# packages, then run the smoke-test fixture against the local devnet.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/smoke-test.ts"

if [[ ! -f "$FIXTURE" ]]; then
  echo "ERROR: smoke-test fixture missing at $FIXTURE" >&2
  exit 2
fi

if ! curl -fsS http://localhost:9944/health >/dev/null 2>&1; then
  echo "ERROR: local devnet node not reachable at http://localhost:9944/health" >&2
  echo "       Start the devnet with /midnight-tooling:devnet start" >&2
  exit 2
fi

WORKDIR="$(mktemp -d -t midnight-smoke-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
echo "Working in $WORKDIR"

cd "$WORKDIR"
npm init -y >/dev/null
npm pkg set type=module

PACKAGES=(
  "@midnightntwrk/wallet-sdk"
  "@midnightntwrk/wallet-sdk-facade"
  "@midnightntwrk/wallet-sdk-hd"
  "@midnightntwrk/wallet-sdk-shielded"
  "@midnightntwrk/wallet-sdk-unshielded-wallet"
  "@midnightntwrk/wallet-sdk-dust-wallet"
  "@midnightntwrk/wallet-sdk-capabilities"
  "@midnightntwrk/wallet-sdk-abstractions"
  "@midnightntwrk/wallet-sdk-address-format"
  "@midnightntwrk/wallet-sdk-runtime"
  "@midnightntwrk/wallet-sdk-utilities"
  "@midnightntwrk/wallet-sdk-indexer-client"
  "@midnightntwrk/wallet-sdk-node-client"
  "@midnightntwrk/wallet-sdk-prover-client"
  "@midnight-ntwrk/ledger-v8"
  "ws"
  "rxjs"
)
echo "Installing latest packages…"
npm install --silent "${PACKAGES[@]}"
npm install --silent -D tsx typescript @types/node @types/ws

cp "$FIXTURE" "$WORKDIR/smoke-test.ts"

echo "Running smoke fixture…"
START=$(date +%s)
if npx tsx "$WORKDIR/smoke-test.ts"; then
  END=$(date +%s)
  echo "PASS — smoke test completed in $((END-START))s"
  exit 0
else
  END=$(date +%s)
  echo "FAIL — smoke test failed after $((END-START))s"
  exit 1
fi
