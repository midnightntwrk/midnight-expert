# Reusable Modules

Standalone Compact modules from the OpenZeppelin Compact Contracts library and community contributors. These are building blocks — import them into your own contracts rather than deploying them directly.

All modules use `pragma language_version 0.23`. Most include TypeScript witnesses and test suites. Note: `modules/crypto/schnorr.compact` is a Schnorr polyfill pending `jubjubSchnorrVerify` in CompactStandardLibrary.

---

## Access Control

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| Ownable | `modules/access/Ownable.compact` | Single-admin access control using the **secure witness-derived identity pattern**. `_owner` is an `AdminPublicKey` (32-byte value derived from a private `getUserSecret()` witness via domain-separated `persistentHash`), pinned at deploy — never `ownPublicKey()`. Identity-bearing circuits (`assertOnlyOwner`, `transferOwnership`, `renounceOwnership`) take the caller's DERIVED admin key as an explicit parameter, supplied by the top-level contract that holds the witness. Imports `modules/utils/Identity`; the `Either`-era `_unsafe*` variants were dropped. Key circuits: `initialize`, `owner`, `assertOnlyOwner`, `transferOwnership`, `renounceOwnership`, `_transferOwnership`. Depends on `Initializable` and `Identity`. | `witnesses/OwnableWitnesses.ts` (no-op; witness is top-level) | `test/Ownable.test.ts` | Intermediate |
| ZOwnablePK | `modules/access/ZOwnablePK.compact` | Privacy-preserving single-admin ownership using the **secure witness-derived identity pattern**. The owner key is derived from a private `getUserSecret()` witness (`_deriveOwnerPublicKey` / `_deriveOwnerNonce`, domain-separated `persistentHash`) — `ownPublicKey()` is never used. The contract stores only a commitment (the derived key + derived nonce + `instanceSalt` + `counter`); `assertOnlyOwner` re-derives the caller from the witness and checks it against the commitment. The `counter` increments on each transfer for unlinkability. Key circuits: `initialize(ownerId, instanceSalt)`, `owner`, `assertOnlyOwner`, `transferOwnership`, `renounceOwnership`, `_computeOwnerCommitment`, `_computeOwnerId`. Requires a `getUserSecret(): UserSecretKey` witness. | `witnesses/ZOwnablePKWitnesses.ts` | `test/ZOwnablePK.test.ts` | Advanced |
| AccessControl | `modules/access/AccessControl.compact` | Role-based access control (RBAC) using the **secure witness-derived identity pattern**. Roles are granted to a `UserPublicKey` derived from a private `getUserSecret()` witness via domain-separated `persistentHash` — never `ownPublicKey()`. Roles identified by `Bytes<32>`. Identity-bearing circuits (`assertOnlyRole`, `grantRole`, `revokeRole`, `renounceRole`) take the caller's DERIVED key as an explicit parameter, supplied by the top-level contract that holds the witness; the `Either`-era `_unsafeGrantRole` was dropped. Ledgers: `_operatorRoles`, `_adminRoles`, `DEFAULT_ADMIN_ROLE`. Key circuits: `hasRole`, `assertOnlyRole`, `grantRole`, `revokeRole`, `renounceRole`, `_setRoleAdmin`, `_grantRole`, `_revokeRole`. Imports `modules/utils/Identity`. | `witnesses/AccessControlWitnesses.ts` (no-op; witness is top-level) | `test/AccessControl.test.ts` | Intermediate |

**Test mocks**: `test/mocks/MockOwnable.compact`, `test/mocks/MockZOwnablePK.compact`, `test/mocks/MockAccessControl.compact`

**Test simulators**: `test/simulators/OwnableSimulator.ts`, `test/simulators/ZOwnablePKSimulator.ts`, `test/simulators/AccessControlSimulator.ts`

---

## Security

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| Initializable | `modules/security/Initializable.compact` | One-time initialization guard. Tracks `_isInitialized: Boolean`. Key circuits: `initialize()` (asserts not initialized, sets flag), `assertInitialized()`, `assertNotInitialized()`. Used as a dependency by Ownable, ZOwnablePK, FungibleToken, NonFungibleToken, and MultiToken modules. | `witnesses/InitializableWitnesses.ts` | `test/Initializable.test.ts` | Beginner |
| Pausable | `modules/security/Pausable.compact` | Emergency stop mechanism. Tracks `_isPaused: Boolean`. Key circuits: `isPaused()`, `assertPaused()`, `assertNotPaused()`, `_pause()`, `_unpause()`. Typically composed with Ownable so only the owner can pause. | `witnesses/PausableWitnesses.ts` | `test/Pausable.test.ts` | Beginner |

**Test mocks**: `test/mocks/MockInitializable.compact`, `test/mocks/MockPausable.compact`

**Test simulators**: `test/simulators/InitializableSimulator.ts`, `test/simulators/PausableSimulator.ts`

---

## Token

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| FungibleToken | `modules/token/FungibleToken.compact` | ERC-20-inspired fungible token module using the **secure witness-derived identity pattern**. `_balances` and `_allowances` are keyed by a `UserPublicKey` derived from a private `getUserSecret()` witness (domain-separated `persistentHash`) — never a raw, prover-supplied `ownPublicKey()`. Identity-bearing circuits (`transfer`, `approve`, `transferFrom`, `_spendAllowance`) take the caller's DERIVED identity as an explicit parameter, supplied by the top-level contract that holds the witness. `Uint<128>` balances. The `Either`-era `_unsafe*`/`isContractAddress` machinery was dropped (`default<UserPublicKey>` is the mint-source/burn-dest sentinel). Ledgers: `_balances`, `_allowances`, `_totalSupply`, `_name`, `_symbol`, `_decimals`. Key circuits: `initialize`, metadata views, `balanceOf`, `allowance`, `transfer`, `transferFrom`, `approve`, `_mint`, `_burn`, `_transfer`, `_approve`. Depends on `Initializable` and `Identity`. | `witnesses/FungibleTokenWitnesses.ts` (no-op; witness is top-level) | `test/FungibleToken.test.ts` | Intermediate |
| NonFungibleToken | `modules/token/NonFungibleToken.compact` | ERC-721-inspired NFT module using the **secure witness-derived identity pattern**. Ownership/approval/balance ledgers are keyed by a `UserPublicKey` derived from a private `getUserSecret()` witness (domain-separated `persistentHash`) — never `ownPublicKey()`. Identity-bearing circuits (`approve`, `setApprovalForAll`, `transferFrom`, internal `_update`/`_approve` auth) take the caller's DERIVED identity as a parameter, supplied by the top-level contract that holds the witness. The `Either`-era contract-recipient "unsafe transfer" split was dropped. Key circuits: `initialize`, `name`, `symbol`, `balanceOf`, `ownerOf`, `tokenURI`, `approve`, `getApproved`, `setApprovalForAll`, `isApprovedForAll`, `transferFrom`, `_mint`, `_burn`, `_setTokenURI`. Depends on `Initializable` and `Identity`. | `witnesses/NonFungibleTokenWitnesses.ts` (no-op; witness is top-level) | `test/NonFungibleToken.test.ts` | Intermediate |
| MultiToken | `modules/token/MultiToken.compact` | ERC-1155-inspired multi-token module using the **secure witness-derived identity pattern**. `_balances` and `_operatorApprovals` are keyed by a `UserPublicKey` derived from a private `getUserSecret()` witness (domain-separated `persistentHash`) — never `ownPublicKey()`. Identity-bearing circuits (`transferFrom`, `setApprovalForAll`) take the caller's DERIVED identity as a parameter, supplied by the top-level contract that holds the witness. `Uint<128>` token IDs/amounts. The `Utils` import was dropped (flat keys make the contract-address distinction moot). Key circuits: `initialize`, `uri`, `balanceOf`, `setApprovalForAll`, `isApprovedForAll`, `transferFrom`, `_mint`, `_burn`. No batch operations (Compact lacks dynamic arrays). Depends on `Initializable` and `Identity`. | `witnesses/MultiTokenWitnesses.ts` | `test/MultiToken.test.ts` | Intermediate |
| Nft | `modules/token/Nft.compact` | NFT module using the **secure witness-derived identity pattern**. Owners are `UserPublicKey` structs — 32-byte values derived from a private witness secret via domain-separated `persistentHash`, never raw prover-supplied keys. Exports identity types (`UserSecretKey`, `UserPublicKey`, `AdminPublicKey`) and pure derivations (`deriveUserPublicKey`, `deriveAdminPublicKey`). Identity-sensitive circuits (`approve`, `setApprovalForAll`, `transferFrom`) take the caller's DERIVED identity as an explicit parameter, so the top-level contract — which holds the witness — controls who the caller is. Ledgers: `tokenOwner`, `tokenApprovals`, `ownedTokensCount` (keyed by `UserPublicKey`), `operatorApprovals` (keyed by a domain-separated hash). Key circuits: `balanceOf`, `ownerOf`, `tokenExists`, `approve`, `getApproved`, `setApprovalForAll`, `isApprovedForAll`, `transferFrom`, `mint`, `burn`. No `Initializable` dependency. The wrapping `tokens/nft.compact` supplies the `getUserSecret` witness. | `tokens/witnesses/nft-witnesses.ts` | — | Intermediate |
| NftZk | `modules/token/NftZk.compact` | Privacy-preserving NFT module using the **secure witness-derived identity pattern**. Two concerns are kept separate: (1) **Authorization** — caller identity is a `UserPublicKey`/`AdminPublicKey` derived from a private witness secret via domain-separated `persistentHash` (`deriveUserPublicKey`/`deriveAdminPublicKey`), never `ownPublicKey()`. Identity-sensitive circuits (`approve`, `setApprovalForAll`, `transfer`, `transferFrom`, `mint`) take the caller's DERIVED identity as an explicit parameter, so the top-level contract (which holds the `getUserSecret` witness) controls who the caller is. (2) **Privacy** — on-chain ownership is still stored as a hashed `Field`, not a raw key: the derived `UserPublicKey` is combined with `getLocalSecret()` (self) or `getSharedSecret()` (peer) via `generateHashKey` to produce the ledger key. Ledgers: `tokenOwner`, `tokenApprovals` (`Map<Uint<64>, Field>`), `ownedTokensCount`, `operatorApprovals` (keyed by `Field` hash). Key circuits: `balanceOf`, `ownerOf`, `tokenExists`, `approve`, `getApproved`, `setApprovalForAll`, `isApprovedForAll`, `transfer`, `transferFrom`, `mint`, `burn`, plus the pure `generateHashKey`. The wrapping `tokens/nft-zk.compact` supplies the `getUserSecret` witness and pins the admin at deploy. | `tokens/witnesses/nft-zk-witnesses.ts` | — | Advanced |

**Test mocks**: `test/mocks/MockFungibleToken.compact`, `test/mocks/MockNonFungibleToken.compact`, `test/mocks/MockMultiToken.compact`

**Test simulators**: `test/simulators/FungibleTokenSimulator.ts`, `test/simulators/NonFungibleTokenSimulator.ts`, `test/simulators/MultiTokenSimulator.ts`

---

## Math

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| Uint64 | `modules/math/Uint64.compact` | Arithmetic for `Uint<64>` values. Operations: `add` (returns `Uint<128>`), `addChecked`, `sub`, `mul` (returns `Uint<128>`), `mulChecked`, `div`, `rem`, `divRem`, `sqrt`, `isMultiple`, `min`, `max`, `toBytes`, `toUnpackedBytes`. Constants: `MAX_UINT8/16/32/64`. Division and sqrt use witnesses for off-chain computation with on-chain verification. Depends on `Bytes8`. | `witnesses/wit_divUint64.ts`, `witnesses/wit_sqrtUint64.ts`, `witnesses/wit_uint64ToUnpackedBytes.ts` | `test/Uint64.test.ts` | Intermediate |
| Uint128 | `modules/math/Uint128.compact` | Arithmetic for `Uint<128>` values. Same operation set as `Uint64` but for 128-bit values. Overflow results in `U256` (from `Types`). Depends on `Bytes32`, `Types`. | `witnesses/wit_divUint128.ts`, `witnesses/wit_sqrtU128.ts` | `test/Uint128.test.ts` | Intermediate |
| Uint256 | `modules/math/Uint256.compact` | Arithmetic for 256-bit unsigned integers represented as `U256` struct (`high: Uint<128>`, `low: Uint<128>`). Operations include comparison (`lt`, `lte`, `gt`, `gte`, `eq`), arithmetic, and conversion. Depends on `Types`, `Uint128`. | `witnesses/wit_divU128.ts` | `test/Uint256.test.ts` | Advanced |
| Bytes8 | `modules/math/Bytes8.compact` | Byte-level operations for `Bytes<8>`. Converts between `Bytes<8>`, `Uint<64>`, and `Vector<8, Uint<8>>`. Circuits: `pack`, `unpack`, `toUint64`. Instantiates `Pack<8>`. Depends on `Pack`. | `witnesses/wit_unpackBytes.ts` | `test/Bytes8.test.ts` | Beginner |
| Bytes32 | `modules/math/Bytes32.compact` | Byte-level operations for `Bytes<32>`. Converts between `Bytes<32>`, `U256`, and `Vector<32, Uint<8>>`. Provides `lt` comparison via `U256`. Circuits: `pack`, `unpack`, `toU256`, `lt`. Depends on `Pack`, `Types`, `Uint256`. | `witnesses/wit_unpackBytes.ts` | `test/Bytes32.test.ts` | Intermediate |
| Field255 | `modules/math/Field255.compact` | Comparison and conversion utilities for BLS12-381 scalar `Field` elements. Conversion chain: `Field → Bytes<32> → U256`. Circuits: `MAX_FIELD`, `toBytes`, `toU256`, `eq`, `lt`, `lte`, `gt`, `gte`, `isZero`. Arithmetic not yet implemented. Depends on `Bytes32`, `Types`. | — | `test/Field255.test.ts` | Intermediate |
| Pack | `modules/math/Pack.compact` | Generic parameterized module `Pack<#N>` for packing/unpacking between `Vector<N, Uint<8>>` and `Bytes<N>`. Circuits: `pack(vec)` (pure, no witness), `unpack(bytes)` (uses `wit_unpackBytes` witness then verifies). No external dependencies. Used by `Bytes8`, `Bytes32`, and indirectly all math modules. | `witnesses/wit_unpackBytes.ts` | `test/Pack.test.ts` | Beginner |
| Types | `modules/math/Types.compact` | Shared type definitions. Exports `U128` struct (`low: Uint<64>`, `high: Uint<64>`) and `U256` struct (`low: U128`, `high: U128`). No circuits, no witnesses. Base dependency for all math modules. | — | — | Beginner |

**Test mocks**: `test/mocks/Uint64.mock.compact`, `test/mocks/Uint128.mock.compact`, `test/mocks/Uint256.mock.compact`, `test/mocks/Bytes8.mock.compact`, `test/mocks/Bytes32.mock.compact`, `test/mocks/Field255.mock.compact`, `test/mocks/Pack.mock.compact`

---

## Crypto

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| schnorr | `modules/crypto/schnorr.compact` | Schnorr signature verification over the Jubjub curve (polyfill until `jubjubSchnorrVerify` is available in CompactStandardLibrary). Exports `SchnorrSignature` struct (`announcement: JubjubPoint`, `response: Field`). Key circuits: `schnorrVerify<#n>(msg, signature, pk: JubjubPoint)` — verifies using `jubjubPointX`/`jubjubPointY` accessors, `ecMulGenerator`, `ecAdd`, `ecMul`, coordinate-wise equality; `schnorrChallenge(...)` — computes the hash challenge. Uses `getSchnorrReduction` witness to truncate the 255-bit challenge hash to 248 bits (Jubjub scalar field constraint). Pragma capped at `<= 0.23` (polyfill pinned to current language version). | `getSchnorrReduction` witness (inline declaration) | — | Advanced |
| crypto | `modules/crypto/crypto.compact` | Generic elliptic curve crypto primitives over the Jubjub curve (uses `JubjubPoint`). Exports structs: `Challenge`, `Nonce<T>`, `Signature`, `SignedCredential<T>`. Pure circuits: `derive_pk(sk)`, `computeChallenge<T>(r, pk, credential)`, `sign<T>(credential, sk)`, `deterministicK<T>(nonce)`, `verify<T>(credential, challenge)`. Used by `PassportIdentity` and `midnight-rwa` application. | — | — | Advanced |

---

## Data Structures

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| Queue | `modules/data-structures/Queue.compact` | Generic FIFO queue `Queue<T>` using `Map<Uint<64>, T>` storage with `head` and `tail` counters. Compact's lack of variable-index `Vector` access and loop iteration required this Map-based design. Keys grow indefinitely (sparse) as head/tail increment — no shifting. Circuits: `enqueue(item)`, `dequeue()` (returns `Maybe<T>`), `isEmpty()`. O(1) enqueue and dequeue. | `witnesses/Queue.ts` | `test/queueContract.test.ts` | Intermediate |

**Test mock**: `test/mocks/Queue.mock.compact`

**Test simulator**: `test/simulators/QueueSimulator.ts`

---

## Identity

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| passportidentity | `modules/identity/passportidentity.compact` | Passport data structures and challenge computation for ZK identity proofs. Exports `PassportData` struct (all ICAO MRZ fields as `Field`). Pure circuits: `computeChallengeForCredential(r, pk, credential)`, `generateDeterministicK(sk, credential)`. Wraps the generic `Crypto` module for passport-specific usage. Used by `midnight-rwa` application. | — | — | Advanced |

---

## Utils

| Name | Path | Description | Witnesses | Tests | Complexity |
|---|---|---|---|---|---|
| Utils | `modules/utils/Utils.compact` | Common utilities for `Either<ZswapCoinPublicKey, ContractAddress>` type operations. Pure circuits: `isKeyOrAddressZero`, `isKeyZero`, `isKeyOrAddressEqual`, `isContractAddress`, `emptyString`. (After the witness-derived-identity rework, the token/access modules no longer depend on this — they use `modules/utils/Identity` instead.) | `witnesses/UtilsWitnesses.ts` | `test/utils.test.ts` | Beginner |
| Identity | `modules/utils/Identity.compact` | Shared identity primitives for the **secure witness-derived identity pattern**. Structs `UserSecretKey`, `UserPublicKey`, `AdminPublicKey` (each `{ bytes: Bytes<32> }`) and pure derivations `deriveUserPublicKey` / `deriveAdminPublicKey` (domain-separated `persistentHash`, `"id:user:pk:v1"` / `"id:admin:pk:v1"`), plus `isUserKeyZero`. Imported family-wide by `FungibleToken`, `Ownable`, `AccessControl` and their composing contracts; Compact's structural typing makes the shared structs type-compatible across modules. | — | — | Beginner |
| ShieldedUtils | `modules/utils/ShieldedUtils.compact` | Extended utilities for shielded token contexts. Circuits: `isKeyOrAddressZero`, `zeroBytes`, `zeroZPK`, `callerZPK`, `thisAddress`, `eitherCaller`, `eitherZeroZPK`, `eitherZeroContractAddress`, `eitherZPK`, `eitherThisAddress`. Used by `ShieldedERC20` / `ShieldedFungibleToken`. | — | — | Beginner |

**Test mock**: `test/mocks/MockUtils.compact`

**Test simulator**: `test/simulators/UtilsSimulator.ts`

---

## Cross-references

- For composed token contracts that import these modules, see [tokens.md](tokens.md).
- For full applications showing how multiple modules compose at scale, see [applications.md](applications.md).
- For privacy patterns using `ZOwnablePK`, `NftZk`, `schnorr`, `crypto`, and `passportidentity`, see [privacy-and-cryptography.md](privacy-and-cryptography.md).
