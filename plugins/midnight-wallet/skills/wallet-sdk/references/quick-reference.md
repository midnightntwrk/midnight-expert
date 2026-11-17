# Wallet SDK Quick Reference

Fast lookup tables for the Midnight Wallet SDK. Every claim in this file is verified against the wallet SDK source code.

---

## Package Map

The wallet SDK is split into focused packages under the `@midnightntwrk` scope. A **meta-package** (`@midnightntwrk/wallet-sdk` 2.0.0) re-exports all sub-packages through named sub-paths so you can depend on a single package. Wallet SDK 2.0.0 is the ledger 9 release; it depends on both `@midnightntwrk/ledger-v8` and `@midnightntwrk/ledger-v9`, because the wallets sync chains that span the fork.

### Meta-package sub-paths (`@midnightntwrk/wallet-sdk`)

| Sub-path | Wraps |
|---|---|
| `.` (root) | All packages combined |
| `./address-format` | `@midnightntwrk/wallet-sdk-address-format` |
| `./capabilities` | `@midnightntwrk/wallet-sdk-capabilities` |
| `./dust` | `@midnightntwrk/wallet-sdk-dust-wallet` |
| `./ledger/v8`, `./ledger/v9` | `@midnightntwrk/ledger-v8`, `@midnightntwrk/ledger-v9` |
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

Nested sub-paths are also re-exported, e.g. `./capabilities/balancer`, `./capabilities/codecs`, `./capabilities/proving`, `./capabilities/simulation`, `./capabilities/submission`, `./capabilities/transactionLifecycle`, `./dust/v1`, `./dust/v2`, `./shielded/v1`, `./shielded/v2`, `./unshielded/v1`, `./unshielded/v2`, `./indexer-client/effect`, `./node-client/effect`, `./node-client/testing`, `./prover-client/effect`, `./runtime/abstractions`, `./utilities/networking`, `./utilities/types`, `./utilities/testing`. (1.x's `./capabilities/pendingTransactions` is gone; see `capabilities-deep-dive.md`.)

Example: `import { WalletFacade } from '@midnightntwrk/wallet-sdk/facade'`

### Individual packages

| Package directory | npm name | Sub-exports | Purpose | Key exports |
|---|---|---|---|---|
| `abstractions` | `@midnightntwrk/wallet-sdk-abstractions` | — | Core interfaces and domain types | `WalletState`, `WalletSeed`, `SyncProgress`, `ProtocolVersion`, `ProtocolState`, `NetworkId`, `SerializedTransaction`, `TransactionHistoryStorage`, `InMemoryTransactionHistoryStorage`, `WalletTransaction`, `ProtocolVersionMismatchError` |
| `address-format` | `@midnightntwrk/wallet-sdk-address-format` | — | Bech32m address encoding/decoding | `MidnightBech32m`, `ShieldedAddress`, `UnshieldedAddress`, `DustAddress`, `Bech32mCodec`, `ShieldedCoinPublicKey`, `ShieldedEncryptionPublicKey` |
| `capabilities` | `@midnightntwrk/wallet-sdk-capabilities` | `./balancer`, `./chainVersion`, `./codecs`, `./proving`, `./signatures`, `./simulation`, `./submission`, `./transactionLifecycle`, `./validation` | Wallet capability definitions and service factories | Capability interfaces; see `capabilities-deep-dive.md` |
| `dust-wallet` | `@midnightntwrk/wallet-sdk-dust-wallet` | `./v1`, `./v2` | DUST token wallet | `DustWallet`, `InsufficientDustForFeeError`, `isInsufficientDustForFeeError`; `./v1` (ledger 8) and `./v2` (ledger 9) variants |
| `facade` | `@midnightntwrk/wallet-sdk-facade` | — | High-level wallet API | `WalletFacade`, `FacadeState`, `BalancingRecipe`, `WalletEntrySchema`, `mergeWalletEntries`, `isAwaiting`, `lifecycleEntriesOf`, `protocolPhaseOf`, `DefaultForkSchedule`, `Clock` (namespace, incl. `Clock.systemClock`), types `SignSegment`, `TermsAndConditions`, `FetchTermsAndConditionsConfiguration` |
| `hd` | `@midnightntwrk/wallet-sdk-hd` | — | Seed and HD key derivation | `WalletSeeds`, `SeedDerivationError`, `HDWallet`, `Roles`, `AccountKey`, `RoleKey`, `CompositeRoleKey`, `generateMnemonicWords`, `validateMnemonic`, `generateRandomSeed`, `joinMnemonicWords`, `mnemonicToWords` |
| `indexer-client` | `@midnightntwrk/wallet-sdk-indexer-client` | `./effect` | Indexer API client | Indexer connection utilities; `./effect` exposes the raw Effect-ts API |
| `node-client` | `@midnightntwrk/wallet-sdk-node-client` | `./effect`, `./testing` | Node RPC client | Node connection utilities; `./effect` for Effect-ts API, `./testing` for test stubs |
| `prover-client` | `@midnightntwrk/wallet-sdk-prover-client` | `./effect` | Proof server client | `HttpProverClient`; `./effect` exposes the raw Effect-ts API |
| `runtime` | `@midnightntwrk/wallet-sdk-runtime` | `./abstractions` | Runtime for wallet variants | Runtime orchestration; `./abstractions` for runtime interface types |
| `shielded-wallet` | `@midnightntwrk/wallet-sdk-shielded` | `./v1`, `./v2` | Shielded (private) wallet | `ShieldedWallet`; `./v1` (ledger 8) and `./v2` (ledger 9) variants |
| `unshielded-wallet` | `@midnightntwrk/wallet-sdk-unshielded-wallet` | `./v1`, `./v2` | Unshielded (transparent) wallet | `UnshieldedWallet`, `createKeystore`, `PublicKey`, type `SignSegment`; `./v1` (ledger 8) and `./v2` (ledger 9) variants |
| `utilities` | `@midnightntwrk/wallet-sdk-utilities` | `./networking`, `./types`, `./testing`, `./testing/variants` | Domain-agnostic utilities | `ArrayOps`, `BlobOps`, `DateOps`, `EitherOps`, `Fluent`, `HList`, `LedgerOps`, `ObservableOps`, `Poly`, `RecordOps`, `SafeBigInt`; `./networking` for `HttpURL`/`WsURL`; `./types` for type-level utilities; `./testing` for test helpers |

> **Common mistake:** `createKeystore` and `PublicKey` are exported from `@midnightntwrk/wallet-sdk-unshielded-wallet`, not from `address-format`. The shielded wallet package is `@midnightntwrk/wallet-sdk-shielded` (not `shielded-wallet`).
>
> **Sub-exports:** When importing from a sub-path (e.g. `./effect`), use the full scoped name: `import { ... } from '@midnightntwrk/wallet-sdk-node-client/effect'`.

---

## HD Key Derivation

HD (Hierarchical Deterministic) wallets derive an entire tree of cryptographic keys from a single master seed. The wallet SDK follows the BIP-32 derivation standard with BIP-39 mnemonic encoding. For wallet construction you normally only need `WalletSeeds.fromMasterSeed(masterSeed)`, which returns the `shielded`, `unshielded` and `dust` seeds from the standard roles below.

### Roles

The `Roles` constant defines five key roles:

| Role | Value | Description | Used in standard construction? |
|---|---|---|---|
| `NightExternal` | `0` | External NIGHT keys (schnorr unshielded signing) | Yes → `WalletSeeds.unshielded` |
| `NightInternal` | `1` | Internal NIGHT change keys | No (reserved) |
| `Dust` | `2` | DUST token keys | Yes → `WalletSeeds.dust` |
| `Zswap` | `3` | Shielded transfer (Zswap) keys | Yes → `WalletSeeds.shielded` |
| `EcdsaUnshielded` | `4` | ECDSA unshielded signing keys (ledger 9 only) | Only with `unshieldedRole: Roles.EcdsaUnshielded` |

Standard wallet construction uses three roles: `NightExternal` (0), `Dust` (2), and `Zswap` (3). Role 4 was `Metadata` in 1.x; in 2.0.0 it is `EcdsaUnshielded`.

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
| `FacadeState` | `@midnightntwrk/wallet-sdk-facade` | Composite state: shielded, unshielded and dust wallet states, `lifecycle` entries, `protocolVersion`, `activeProtocolVersion`, `protocol` (`Settled` / `Crossing`), `isSynced` |
| `WalletSeeds` | `@midnightntwrk/wallet-sdk-hd` | `{ shielded, unshielded, dust }` seed bytes. What `wallet.start()` takes |
| `ProtocolPhase` | `@midnightntwrk/wallet-sdk-facade` | `{ _tag: 'Settled', version }` or `{ _tag: 'Crossing', from, to, behind }` |
| `LifecycleEntry` | `@midnightntwrk/wallet-sdk-facade` | One tracked transaction with a tagged `status` (`Balanced`, `Finalized`, `Submitted`, `Confirmed`, `PartialSuccess`, `Rejected`, `Orphaned`, `Expired`, `Reverted`) |
| `SignSegment` | `@midnightntwrk/wallet-sdk-facade` | `(data: Uint8Array) => Promise<Signature>` — async signing callback |
| `SyncProgress` | `@midnightntwrk/wallet-sdk-abstractions` | Tracks blockchain sync status. Has `isStrictlyComplete()` (gap = 0) and `isCompleteWithin(maxGap?)` (default gap = 50 blocks) methods |
| `ProtocolVersion` | `@midnightntwrk/wallet-sdk-abstractions` | Namespace; `ProtocolVersion.ProtocolVersion` is a branded `bigint`. Also `ForkSchedule` (where ledger 9 starts) and range helpers |
| `BalancingRecipe` | `@midnightntwrk/wallet-sdk-facade` | Union of `FinalizedTransactionRecipe`, `UnboundTransactionRecipe`, and `UnprovenTransactionRecipe`; each records its `protocolVersion` |
| `UtxoWithMeta` | `@midnightntwrk/wallet-sdk-facade` | UTXO with metadata (`ctime` and `registeredForDustGeneration` flag), over a ledger-v9 `Utxo` |
| `WalletState` | `@midnightntwrk/wallet-sdk-abstractions` | Branded `string` via Effect `Brand.nominal<WalletState>()`. Serialized wallet state for persistence |
| `ZswapSecretKeys` | `@midnightntwrk/ledger-v9` (and `-v8`) | Secret keys for shielded (Zswap) operations. Not needed when starting from seeds; `startWithKeys` takes both versions' keys |
| `DustSecretKey` | `@midnightntwrk/ledger-v9` (and `-v8`) | Secret key for DUST operations. Same as above |
| `PublicKey` | `@midnightntwrk/wallet-sdk-unshielded-wallet` | Object containing `publicKey` (SignatureVerifyingKey), `addressHex` (UserAddress), and `address` (Bech32m string). Created via `PublicKey.fromKeyStore()` |
| `Clock` | `@midnightntwrk/wallet-sdk-facade` | Namespace; `Clock.Clock` is `{ readonly now: () => Date }` — injectable time source passed as `WalletFacade.init({ clock })`. Default `Clock.systemClock`; supply a deterministic clock in tests |
| `TermsAndConditions` | `@midnightntwrk/wallet-sdk-facade` | Terms-and-conditions payload type. Fetched via the static `WalletFacade.fetchTermsAndConditions()` method |
| `FetchTermsAndConditionsConfiguration` | `@midnightntwrk/wallet-sdk-facade` | Minimal config accepted by `WalletFacade.fetchTermsAndConditions()` |
| `V9.Simulator` / `V8.Simulator` | `@midnightntwrk/wallet-sdk-capabilities/simulation` | In-process blockchain simulator for testing, one per ledger version (`Simulator.init(config)` returns an Effect); `ForkSimulator` drives a chain across the fork |
| `V9.SimulatorState` | `@midnightntwrk/wallet-sdk-capabilities/simulation` | Snapshot of the simulator's blockchain state (blocks, mempool, etc.) |

> **See also:** [state-and-balances.md](state-and-balances.md) for how `FacadeState` and `SyncProgress` are used in practice. [transactions.md](transactions.md) for `BalancingRecipe` usage. [capabilities-deep-dive.md](capabilities-deep-dive.md) for `Simulator` and `SimulatorState` usage.
