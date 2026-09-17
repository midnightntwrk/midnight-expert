# Cross-Reference Index

> **Last verified:** 2026-09-17 — every symbol compile-probed against Compact compiler `0.31.1` / language `0.23`; all resolve via `import CompactStandardLibrary;` (no symbol is available without the import).

Alphabetical index of every Compact standard library export. Use this as a quick lookup to find the name, kind, and authoritative documentation location for any stdlib symbol. For detailed usage, examples, and semantics, follow the authoritative location path to the relevant skill reference file.

| Name | Kind | Description | Authoritative Location |
|------|------|-------------|------------------------|
| `assert` | builtin | Abort transaction if condition is false | `compact-language-ref/references/stdlib-functions.md` |
| `blockTimeGt` | circuit | Block time greater than comparison | `compact-language-ref/references/stdlib-functions.md` |
| `blockTimeGte` | circuit | Block time greater-or-equal comparison | `compact-language-ref/references/stdlib-functions.md` |
| `blockTimeLt` | circuit | Block time less than comparison | `compact-language-ref/references/stdlib-functions.md` |
| `blockTimeLte` | circuit | Block time less-or-equal comparison | `compact-language-ref/references/stdlib-functions.md` |
| `constructJubjubPoint` | circuit | Construct JubjubPoint from X, Y coordinates | `compact-standard-library/references/cryptographic-functions.md` |
| `ContractAddress` | type | Contract address wrapper | `compact-standard-library/references/types-and-constructors.md` |
| `Counter` | ledger ADT | Numeric counter with increment/decrement | `compact-ledger/references/types-and-operations.md` |
| `createZswapInput` | circuit | Low-level zswap input creation | `compact-tokens/references/token-operations.md` |
| `createZswapOutput` | circuit | Low-level zswap output creation | `compact-tokens/references/token-operations.md` |
| `default<T>` | builtin | Default value for any type | `compact-language-ref/references/stdlib-functions.md` |
| `degradeToTransient` | circuit | Convert Bytes<32> to Field | `compact-language-ref/references/stdlib-functions.md` |
| `disclose` | builtin | Mark value as publicly visible | `compact-language-ref/references/stdlib-functions.md` |
| `ecAdd` | circuit | Add two JubjubPoints | `compact-standard-library/references/cryptographic-functions.md` |
| `ecMul` | circuit | Scalar multiply JubjubPoint | `compact-standard-library/references/cryptographic-functions.md` |
| `ecMulGenerator` | circuit | Scalar multiply generator point | `compact-standard-library/references/cryptographic-functions.md` |
| `Either<L, R>` | type | Disjoint union (sum type) | `compact-standard-library/references/types-and-constructors.md` |
| `evolveNonce` | circuit | Derive next nonce for coin operations | `compact-tokens/references/token-operations.md` |
| `hashToCurve<T>` | circuit | Map arbitrary value to JubjubPoint | `compact-standard-library/references/cryptographic-functions.md` |
| `HistoricMerkleTree<N, T>` | ledger ADT | MerkleTree with root history | `compact-ledger/references/types-and-operations.md` |
| `JubjubPoint` | type | Elliptic curve point | `compact-standard-library/references/types-and-constructors.md` |
| `jubjubPointX` | circuit | Get X coordinate of JubjubPoint | `compact-standard-library/references/cryptographic-functions.md` |
| `jubjubPointY` | circuit | Get Y coordinate of JubjubPoint | `compact-standard-library/references/cryptographic-functions.md` |
| `left<A, B>` | circuit | Construct left Either variant | `compact-standard-library/references/types-and-constructors.md` |
| `List<T>` | ledger ADT | Ordered sequence | `compact-ledger/references/types-and-operations.md` |
| `Map<K, V>` | ledger ADT | Key-value store | `compact-ledger/references/types-and-operations.md` |
| `Maybe<T>` | type | Optional value container | `compact-standard-library/references/types-and-constructors.md` |
| `mergeCoin` | circuit | Merge two existing shielded coins | `compact-tokens/references/token-operations.md` |
| `mergeCoinImmediate` | circuit | Merge existing + newly created coin | `compact-tokens/references/token-operations.md` |
| `MerkleTree<N, T>` | ledger ADT | Privacy-preserving set | `compact-ledger/references/types-and-operations.md` |
| `MerkleTreeDigest` | type | Merkle root hash wrapper | `compact-standard-library/references/types-and-constructors.md` |
| `MerkleTreePath<N, T>` | type | Path from leaf to root | `compact-standard-library/references/types-and-constructors.md` |
| `MerkleTreePathEntry` | type | Sibling + direction in Merkle path | `compact-standard-library/references/types-and-constructors.md` |
| `merkleTreePathRoot<N, T>` | circuit | Compute root from leaf + path | `compact-standard-library/references/cryptographic-functions.md` |
| `merkleTreePathRootNoLeafHash<N>` | circuit | Compute root from pre-hashed leaf | `compact-standard-library/references/cryptographic-functions.md` |
| `mintShieldedToken` | circuit | Mint new shielded coin | `compact-tokens/references/token-operations.md` |
| `mintUnshieldedToken` | circuit | Mint unshielded token | `compact-tokens/references/token-operations.md` |
| `nativeToken` | circuit | Native token color (zero) | `compact-tokens/references/token-operations.md` |
| `none<T>` | circuit | Construct empty Maybe | `compact-standard-library/references/types-and-constructors.md` |
| `ownPublicKey` | circuit | Current user's coin public key | `compact-tokens/references/token-operations.md` |
| `pad` | builtin | Create Bytes<N> from string literal | `compact-language-ref/references/stdlib-functions.md` |
| `persistentCommit<T>` | circuit | SHA-256 commitment with randomness | `compact-language-ref/references/stdlib-functions.md` |
| `persistentHash<T>` | circuit | SHA-256 hash; stable across upgrades | `compact-language-ref/references/stdlib-functions.md` |
| `QualifiedShieldedCoinInfo` | type | Existing shielded coin with index | `compact-tokens/references/token-operations.md` |
| `receiveShielded` | circuit | Accept shielded coin | `compact-tokens/references/token-operations.md` |
| `receiveUnshielded` | circuit | Receive unshielded token | `compact-tokens/references/token-operations.md` |
| `right<A, B>` | circuit | Construct right Either variant | `compact-standard-library/references/types-and-constructors.md` |
| `sendImmediateShielded` | circuit | Send from just-created coin | `compact-tokens/references/token-operations.md` |
| `sendShielded` | circuit | Send from existing coin | `compact-tokens/references/token-operations.md` |
| `sendUnshielded` | circuit | Send unshielded token | `compact-tokens/references/token-operations.md` |
| `Set<T>` | ledger ADT | Unique element collection | `compact-ledger/references/types-and-operations.md` |
| `ShieldedCoinInfo` | type | Newly created shielded coin | `compact-tokens/references/token-operations.md` |
| `ShieldedSendResult` | type | Send result with change coin | `compact-tokens/references/token-operations.md` |
| `shieldedBurnAddress` | circuit | Burn address for shielded coins | `compact-tokens/references/token-operations.md` |
| `some<T>` | circuit | Construct Maybe containing value | `compact-standard-library/references/types-and-constructors.md` |
| `tokenType` | circuit | Compute token color from domain separator + contract | `compact-tokens/references/token-operations.md` |
| `transientCommit<T>` | circuit | Circuit-efficient commitment | `compact-language-ref/references/stdlib-functions.md` |
| `transientHash<T>` | circuit | Circuit-efficient hash; may change between versions | `compact-language-ref/references/stdlib-functions.md` |
| `unshieldedBalance` | circuit | Query unshielded balance (exact) | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceGt` | circuit | Balance greater than comparison | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceGte` | circuit | Balance greater-or-equal comparison | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceLt` | circuit | Balance less than comparison | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceLte` | circuit | Balance less-or-equal comparison | `compact-tokens/references/token-operations.md` |
| `upgradeFromTransient` | circuit | Convert Field to Bytes<32> | `compact-language-ref/references/stdlib-functions.md` |
| `UserAddress` | type | User wallet address for unshielded tokens | `compact-standard-library/references/types-and-constructors.md` |
| `ZswapCoinPublicKey` | type | Coin public key for shielded operations | `compact-standard-library/references/types-and-constructors.md` |

Authoritative location paths use the format `<skill-name>/references/<file>.md`, referring to reference files within sibling skills under the `compact-core` plugin. Each path points to the skill and file that contains the most detailed documentation for that particular export.
