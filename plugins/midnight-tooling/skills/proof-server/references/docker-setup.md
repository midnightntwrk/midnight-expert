# Docker Setup

> **Last verified:** 2026-09-17 — proof-server image `midnightntwrk/proof-server` tag `8.1.0`, port 6300 confirmed consistent across the tooling docs.

For all Docker prerequisites, installation, resource requirements, and troubleshooting, see the devnet skill's Docker setup reference: `skills/devnet/references/docker-setup.md`.

That guide covers everything needed for both devnet usage and standalone proof-server usage.

## Standalone Proof Server

If running a proof server outside the devnet (e.g., connecting to testnet/mainnet), use:

```bash
docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:<tag> -- midnight-proof-server -v
```

See the main Docker setup reference for Docker installation and daemon troubleshooting.
