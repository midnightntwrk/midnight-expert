# Wallet SDK Quick Reference

Fast lookup tables for the Midnight Wallet SDK. Every claim in this file is verified against the wallet SDK source code.

---

## Package Map

The wallet SDK is split into focused packages under the `@midnight-ntwrk` scope. A **meta-package** (`@midnightntwrk/wallet-sdk` v1.1.0) re-exports all sub-packages through named sub-paths so you can depend on a single package.

### Meta-package sub-paths (`@midnightntwrk/wallet-sdk`)

| Sub-path | Wraps |
|---|---|
| `.` (root) | All packages combined |
| `./address-format` | `@midnightntwrk/wallet-sdk-address-format` |
| `./capabilities` | `@midnightntwrk/wallet-sdk-capabilities` |
| `./dust` | `@midnightntwrk/wallet-sdk-dust-wallet` |
| `./facade` | `@midnightntwrk/wallet-sdk-facade` |
| `./hd` | `@midnightntwrk/wallet-sdk-hd` |
| `./indexer-client` | `@midnightntwrk/wallet-sdk-indexer-client` |
| `./node-client` | `@midnightntwrk/wallet-sdk-node-client` |
| `./prover-client` | `@midnightntwrk/wallet-sdk-prover-client` |
| `./proving` | `@midnightntwrk/wallet-sdk-capabilities/proving` (proving capability surface; legacy alias) |
| `./runtime` | `@midnightntwrk/wallet-sdk-runtime` |
| `./shielded` | `@midnightntwrk/wallet-sdk-shielded` |
| `./testing` | `@midnightntwrk/wallet-sdk-utilities/testing` (legacy alias) |
| `./unshielded` | `@midnightntwrk/wallet-sdk-unshielded-wallet` |
| `./utilities` | `@midnightntwrk/wallet-sdk-utilities` |

Nested sub-paths are also re-exported, e.g. `./capabilities/balancer`, `./capabilities/proving`, `./capabilities/simulation`, `./capabilities/submission`, `./capabilities/pendingTransactions`, `./dust/v1`, `./shielded/v1`, `./unshielded/v1`, `./indexer-client/effect`, `./node-client/effect`, `./node-client/testing`, `./prover-client/effect`, `./runtime/abstractions`, `./utilities/networking`, `./utilities/types`, `./utilities/testing`.

Example: `import { WalletFacade } from '@midnightntwrk/wallet-sdk/facade'`

### Individual packages

| Package directory | npm name | Sub-exports | Purpose | Key exports |
|---|---|---|---|---|
| `abstractions` | `@midnightntwrk/wallet-sdk-abstractions` | — | Core interfaces and domain types | `WalletState`, `WalletSeed`, `SyncProgress`, `ProtocolVersion`, `ProtocolState`, `NetworkId`, `SerializedTransaction`, `TransactionHistoryStorage` |
| `address-format` | `@midnightntwrk/wallet-sdk-address-format` | — | Bech32m address encoding/decoding | `MidnightBech32m`, `ShieldedAddress`, `UnshieldedAddress`, `DustAddress`, `Bech32mCodec`, `ShieldedCoinPublicKey`, `ShieldedEncryptionPublicKey` |
| `capabilities` | `@midnightntwrk/wallet-sdk-capabilities` | `./balancer`, `./submission`, `./pendingTransactions`, `./proving`, `./simulation` | Wallet capability definitions and service factories | Capability interfaces; see `capabilities-deep-dive.md` |
| `dust-wallet` | `@midnightntwrk/wallet-sdk-dust-wallet` | `./v1` | DUST token wallet variant | `DustWallet` |
| `facade` | `@midnightntwrk/wallet-sdk-facade` | — | High-level wallet API | `WalletFacade`, `FacadeState`, `BalancingRecipe`, `Clock`, `systemClock`, `TermsAndConditions`, `FetchTermsAndConditionsConfiguration` |
| `hd` | `@midnightntwrk/wallet-sdk-hd` | — | HD key derivation | `HDWallet`, `Roles`, `AccountKey`, `RoleKey`, `CompositeRoleKey`, `generateMnemonicWords`, `validateMnemonic`, `generateRandomSeed`, `joinMnemonicWords`, `mnemonicToWords` |
| `indexer-client` | `@midnightntwrk/wallet-sdk-indexer-client` | `./effect` | Indexer API client | Indexer connection utilities; `./effect` exposes the raw Effect-ts API |
| `node-client` | `@midnightntwrk/wallet-sdk-node-client` | `./effect`, `./testing` | Node RPC client | Node connection utilities; `./effect` for Effect-ts API, `./testing` for test stubs |
| `prover-client` | `@midnightntwrk/wallet-sdk-prover-client` | `./effect` | Proof server client | `HttpProverClient`; `./effect` exposes the raw Effect-ts API |
| `runtime` | `@midnightntwrk/wallet-sdk-runtime` | `./abstractions` | Runtime for wallet variants | Runtime orchestration; `./abstractions` for runtime interface types |
| `shielded-wallet` | `@midnightntwrk/wallet-sdk-shielded` | `./v1` | Shielded (private) wallet variant | `ShieldedWallet`; `./v1` for the v1 implementation |
| `unshielded-wallet` | `@midnightntwrk/wallet-sdk-unshielded-wallet` | `./v1` | Unshielded (transparent) wallet variant | `UnshieldedWallet`, `createKeystore`, `PublicKey`; `./v1` for the v1 implementation |
| `utilities` | `@midnightntwrk/wallet-sdk-utilities` | `./networking`, `./types`, `./testing` | Domain-agnostic utilities | `ArrayOps`, `BlobOps`, `DateOps`, `EitherOps`, `Fluent`, `HList`, `LedgerOps`, `ObservableOps`, `Poly`, `RecordOps`, `SafeBigInt`; `./networking` for `HttpURL`/`WsURL`; `./types` for type-level utilities; `./testing` for test helpers |

> **Common mistake:** `createKeystore` and `PublicKey` are exported from `@midnightntwrk/wallet-sdk-unshielded-wallet`, not from `address-format`. The shielded wallet package is `@midnightntwrk/wallet-sdk-shielded` (not `shielded-wallet`).
>
> **Sub-exports:** When importing from a sub-path (e.g. `./effect`), use the full scoped name: `import { ... } from '@midnightntwrk/wallet-sdk-node-client/effect'`.

---

## HD Key Derivation

HD (Hierarchical Deterministic) wallets derive an entire tree of cryptographic keys from a single master seed. The wallet SDK follows the BIP-32 derivation standard with BIP-39 mnemonic encoding.

### Roles

The `Roles` constant defines five key roles:

| Role | Value | Description | Used in standard construction? |
|---|---|---|---|
| `NightExternal` | `0` | External NIGHT receive keys | Yes |
| `NightInternal` | `1` | Internal NIGHT change keys | No (reserved) |
| `Dust` | `2` | DUST token keys | Yes |
| `Zswap` | `3` | Shielded transfer (Zswap) keys | Yes |
| `Metadata` | `4` | Metadata signing keys | No (reserved) |

Standard wallet construction uses three roles: `NightExternal` (0), `Dust` (2), and `Zswap` (3).

### Derivation Path

```
m / 44' / 2400' / {account}' / {role} / {index}
```

| Segment | Value | Meaning |
|---|---|---|
| `m` | — | Master key root |
| `44'` | Hardened | BIP-44 purpose (multi-account hierarchy) |
| `2400'` | Hardened | Midnight coin type (registered in SLIP-44) |
| `{account}'` | Hardened | Account index (0-based) |
| `{role}` | Unhardened | Role from the table above (0-4) |
| `{index}` | Unhardened | Key index within the role (0-based) |

The apostrophe (`'`) marks hardened derivation, which prevents child keys from being used to derive parent keys.

> **See also:** [key-derivation.md](key-derivation.md) for the full derivation flow with code examples and result type handling.

---

## Addresses and Bech32m Encoding

### What is Bech32m?

Bech32m is an improved address encoding format (BIP-350) that provides built-in error detection. Midnight uses Bech32m for all on-chain addresses with the `mn` prefix.

### Address Format

All Midnight addresses follow the pattern:

```
mn_{type}_{network}{encoded_data}
```

- **Prefix:** Always `mn`
- **Type segment:** Identifies the address kind (e.g., `addr`, `shield-addr`, `dust`)
- **Network segment:** Identifies the network (omitted for mainnet; e.g., `devnet`, `testnet`)
- **Encoded data:** Bech32m-encoded payload

Example (unshielded, devnet): `mn_addr_devnet1qpz...`

### Address Types

| Type | Bech32m type segment | Class | Key data |
|---|---|---|---|
| Unshielded | `addr` | `UnshieldedAddress` | 32-byte public key |
| Shielded | `shield-addr` | `ShieldedAddress` | Coin public key + encryption public key (concatenated) |
| DUST | `dust` | `DustAddress` | BLS scalar (SCALE-encoded bigint) |

### Network Binding

Addresses are network-bound. Encoding and decoding require a `NetworkId`. Decoding an address with a mismatched network throws an error:

```
Expected devnet address, got testnet one
```

The special `mainnet` symbol (exported as `mainnet` from `address-format`) represents the mainnet network, and mainnet addresses omit the network segment entirely.

> **See also:** [wallet-construction.md](wallet-construction.md) for how addresses are derived during wallet setup.

---

## Common Type Lookups

| Type | Package | Description |
|---|---|---|
| `FacadeState` | `@midnightntwrk/wallet-sdk-facade` | Composite state combining shielded, unshielded, and dust wallet states with pending transactions |
| `SyncProgress` | `@midnightntwrk/wallet-sdk-abstractions` | Tracks blockchain sync status. Has `isStrictlyComplete()` (gap = 0) and `isCompleteWithin(maxGap?)` (default gap = 50 blocks) methods |
| `ProtocolVersion` | `@midnightntwrk/wallet-sdk-abstractions` | Branded `bigint` via Effect `Brand.nominal<ProtocolVersion>()`. Represents the protocol version with range checking utilities |
| `BalancingRecipe` | `@midnightntwrk/wallet-sdk-facade` | Union of `FinalizedTransactionRecipe`, `UnboundTransactionRecipe`, and `UnprovenTransactionRecipe` |
| `UtxoWithMeta` | `@midnightntwrk/wallet-sdk-facade` | UTXO with metadata (`ctime` and `registeredForDustGeneration` flag). The facade re-exports this as the public type |
| `WalletState` | `@midnightntwrk/wallet-sdk-abstractions` | Branded `string` via Effect `Brand.nominal<WalletState>()`. Serialized wallet state for persistence |
| `ZswapSecretKeys` | `@midnight-ntwrk/ledger-v8` | Secret keys for shielded (Zswap) operations. From the ledger package, not the wallet SDK |
| `DustSecretKey` | `@midnight-ntwrk/ledger-v8` | Secret key for DUST operations. From the ledger package, not the wallet SDK |
| `PublicKey` | `@midnightntwrk/wallet-sdk-unshielded-wallet` | Object containing `publicKey` (SignatureVerifyingKey), `addressHex` (UserAddress), and `address` (Bech32m string). Created via `PublicKey.fromKeyStore()` |
| `Clock` | `@midnightntwrk/wallet-sdk-facade` | `{ readonly now: () => Date }` — injectable time source for time-sensitive operations. Use `systemClock` (the default) or supply a deterministic clock in tests |
| `TermsAndConditions` | `@midnightntwrk/wallet-sdk-facade` | Terms-and-conditions payload type. Fetched via the static `WalletFacade.fetchTermsAndConditions()` method |
| `FetchTermsAndConditionsConfiguration` | `@midnightntwrk/wallet-sdk-facade` | Minimal config accepted by `WalletFacade.fetchTermsAndConditions()` |
| `Simulator` | `@midnightntwrk/wallet-sdk-capabilities/simulation` | In-process blockchain simulator for testing. Constructed with a `SimulatorConfig`; start with `immediateBlockProducer` for instant finality |
| `SimulatorState` | `@midnightntwrk/wallet-sdk-capabilities/simulation` | Read-only snapshot of the simulator's blockchain state (blocks, mempool, etc.) |

> **See also:** [state-and-balances.md](state-and-balances.md) for how `FacadeState` and `SyncProgress` are used in practice. [transactions.md](transactions.md) for `BalancingRecipe` usage. [capabilities-deep-dive.md](capabilities-deep-dive.md) for `Simulator` and `SimulatorState` usage.
