# Proof Server Key Material

Cryptographic key material (public parameters and proving keys) is managed at startup and on demand. This reference covers what is fetched, when, and how the data provider resolves keys at runtime.

## Startup Prefetch

Unless `--no-fetch-params` is set, the server prefetches two categories of material before accepting requests:

### Public Parameters

```text
k = 10, 11, 12, 13, 14, 15
```

Public parameters define the polynomial commitment scheme size. All circuits with the same `k` share one parameter set, so prefetching `k = 10..=15` covers the full range used by current Compact-compiled circuits. A circuit's `k` is reported by `POST /k`.

Source: `main.rs:78` — `(10..=15).map(|k| PUBLIC_PARAMS.0.fetch_k(k))`.

### Built-in Proving Keys

| Key ID | Purpose |
|--------|---------|
| `midnight/zswap/spend` | Spending a shielded coin (nullifier creation) |
| `midnight/zswap/output` | Creating a shielded coin (commitment creation) |
| `midnight/zswap/sign` | Schnorr signature proof for transaction binding |
| `midnight/dust/spend` | Spending native DUST tokens |

These four keys cover all built-in Midnight protocol circuits. Application-specific proving keys (for custom Compact contracts) are **not** prefetched; see On-Demand Resolution below.

Source: `main.rs:82–88` — the array literal passed to `resolver.resolve_key`.

## Data Provider

```text
PUBLIC_PARAMS (ZswapResolver / Resolver)
├── MidnightDataProvider(FetchMode::OnDemand, OutputMode::Log)
│       └── used for public parameters and zswap keys
└── DustResolver(MidnightDataProvider(..., DUST_EXPECTED_FILES))
        └── wraps the provider for DUST-specific key lookup
```

| Component | Type | Role |
|-----------|------|------|
| `PUBLIC_PARAMS` | `ZswapResolver` (static `lazy_static`) | Shared resolver for public parameters and zswap proving keys; defined in `endpoints.rs` |
| `MidnightDataProvider` | `FetchMode::OnDemand, OutputMode::Log` | Fetches keys from the network on first access; logs fetch progress |
| `DustResolver` | Wraps `MidnightDataProvider` | Resolves DUST-specific proving keys using `DUST_EXPECTED_FILES` as the key manifest |

`PUBLIC_PARAMS` is a process-wide `lazy_static` defined in `endpoints.rs` and shared by all endpoint handlers. Both the startup prefetch in `main.rs` and the per-request `Resolver` constructed in `endpoints.rs` clone this shared instance.

## On-Demand Resolution

Keys not prefetched at startup — primarily application-specific proving keys for custom Compact contracts — are resolved on first use by the `MidnightDataProvider` (mode `FetchMode::OnDemand`). This fetch happens inside the proving request and can take tens of seconds to minutes depending on network speed and cache state.

```text
POST /prove  (first request for a new circuit)
    │
    └──→ Resolver::resolve_key(KeyLocation("app/my-contract/circuit"))
              │
              └──→ MidnightDataProvider::fetch(...)   ← network fetch
                        │
                        └──→ key cached locally
                                  │
                                  └──→ proof generation proceeds
```

Subsequent requests for the same circuit use the locally cached key and are not slow.

## k ↔ Public Parameters Relationship

`POST /k` accepts a serialized circuit and returns its `k` value. That `k` determines which public-parameter set is required for proof generation:

```text
circuit  ──POST /k──→  k = 12
                           │
                           └──→ PUBLIC_PARAMS.fetch_k(12)
                                    │
                                    └──→ if k in 10..=15: already prefetched
                                         else: fetched on demand (slow)
```

A circuit with `k` outside the prefetched range (`10..=15`) will trigger an on-demand parameter fetch on the first `/prove` call.

## Cross-references

- `proof-server:proof-server-configuration` — `--no-fetch-params` flag details and startup time trade-offs
- `proof-server:proof-server-architecture` — proving pipeline overview and worker pool
- `compact-core:compact-circuit-costs` — how circuit structure determines `k` and proof cost
- `midnight-dapp-dev:core` — client-side counterpart: how a DApp's own `zkConfigProvider` interacts with these same four builtin keys (`midnight/zswap/spend`, `midnight/zswap/output`, `midnight/zswap/sign`, `midnight/dust/spend`) when proving is self-hosted via `httpClientProofProvider` instead of wallet-delegated — see the "Gotcha" box in `references/provider-patterns.md`
