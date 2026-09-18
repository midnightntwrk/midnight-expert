# Midnight Node Error Codes

> **Last verified:** the `LedgerApiError` → `u8` mapping was re-verified **2026-09-18** against `midnightntwrk/midnight-node@main` at `ledger/src/ledger_9/types.rs` — the **active** version (`ledger/src/lib.rs` aliases `ledger_9` as `latest`/`active_version`); `ledger_8/types.rs` is the currently value-identical legacy mirror kept for the 8→9 migration. Codes 117/138 and `RETIRED_U8_ERROR_CODES` = `[168, 182, 186, 187, 188, 193, 205]` all confirmed unchanged. **The source path moved** from the old `ledger/src/versions/common/types.rs` to versioned `ledger_8/`,`ledger_9/` modules since the prior stamp. Pallet-dispatch / partner-chains anchors (`runtime/src/lib.rs`; `partner-chains/toolkit/{committee-selection,bridge}/pallet/src/lib.rs`, v1.8.0 vendored) last verified 2026-05-04.

## Source

These are `LedgerApiError` codes mapped to `u8` (0–255), defined in `midnight-node/ledger/src/ledger_9/types.rs` (the active version; `ledger_8/types.rs` is the currently value-identical legacy mirror kept for the 8→9 migration). They surface via Substrate's `InvalidTransaction::Custom(u8)` when the node rejects a transaction at the ledger level.

You encounter them when:
- A submitted transaction is rejected by the node with `Custom(N)` in the Substrate dispatch error
- A pallet-level `DispatchError::Module` surfaces with index 5 (`pallet_midnight`) or 6 (`pallet_midnight_system`) and you need to decode the inner error

---

## Substrate JSON-RPC Envelope (1000-base)

Before a Midnight ledger u8 reaches a developer, it is wrapped in an upstream Substrate JSON-RPC error envelope. These envelopes are inherited from `paritytech/polkadot-sdk` (`substrate/client/rpc-api/src/author/error.rs`) and are **not Midnight-specific** — they predate the project and are common to all Substrate-based chains.

The base codes:

| Base    | Constant   | Range    | Surface |
|---------|------------|----------|---------|
| 1000    | `AUTHOR`   | 1001–1040 | `author_submitExtrinsic`, `author_submitAndWatchExtrinsic` |
| 2000    | `SYSTEM`   | 2000-block | `system_*` RPC methods |
| 3000    | `CHAIN`    | 3000-block | `chain_*` RPC methods |
| 4000    | `STATE`    | 4000-block | `state_*` RPC methods |
| 5000    | `OFFCHAIN` | 5000-block | `offchain_*` RPC methods |
| 6000    | `DEV`      | 6000-block | `dev_*` RPC methods |
| 7000    | `STATEMENT`| 7000-block | `statement_*` RPC methods |
| 8000    | `MIXNET`   | 8000-block | `mixnet_*` RPC methods |

The AUTHOR family (transaction submission) is the most common surface for Midnight DApp developers:

| Code | Constant | Description |
|------|----------|-------------|
| 1001 | `BAD_FORMAT` | Extrinsic SCALE decode failed at the RPC layer |
| 1002 | `VERIFICATION_ERROR` | Signature/structure verification failed at the RPC author endpoint |
| 1010 | `POOL_INVALID_TX` | **Pool rejected as invalid; carries `Custom(u8)` for the ledger-level cause** |
| 1011 | `POOL_UNKNOWN_VALIDITY` | Validity could not be determined |
| 1012 | `POOL_TEMPORARILY_BANNED` | Hash is in the banlist after prior invalid submissions |
| 1013 | `POOL_ALREADY_IMPORTED` | Already in the pool (no-op) |
| 1014 | `POOL_TOO_LOW_PRIORITY` | Priority too low to replace an existing tx |
| 1015 | `POOL_CYCLE_DETECTED` | Cyclic dependency between pool transactions |
| 1016 | `POOL_IMMEDIATELY_DROPPED` | Pool full; entry dropped |
| 1018 | `POOL_UNACTIONABLE` | Non-propagable on a non-authoring node |
| 1019 | `POOL_NO_TAGS` | Validation produced no tags |
| 1020 | `POOL_INVALID_BLOCK_ID` | Block ID provided is invalid |
| 1021 | `POOL_FUTURE_TX` | Future transactions not accepted |
| 1040 | `OTHER_ERR` | Catch-all (KeystoreUnavailable, InvalidSessionKeys, MissingSessionKeysApi, etc.) |

### Decoding `1010: Custom(u8)`

The wire-level shape of the most common failure:

```json
{
  "code": 1010,
  "message": "Invalid Transaction",
  "data": "Custom error: N"
}
```

Where `N` is the inner `LedgerApiError` u8 (0–255). To diagnose:

1. Strip the substrate envelope — the cause is `N`, not `1010`.
2. Look up `N` in the tables below.
3. If `N` is in `RETIRED_U8_ERROR_CODES` (currently: 168, 182, 186, 187, 188, 193, 205) the code is no longer emitted by the current ledger and the entry exists for historical decoding only — see the cross-references on each retired entry for the active replacement.

> **Note on protocol versions.** The 1010 envelope is stable upstream substrate. The inner u8 mapping is Midnight-specific and **changes across ledger versions**: codes get added, retired, and (rarely) renumbered. Treat the tables below as the mapping for the current ledger only; archived chains/explorers may show u8 values from earlier mappings.

### Idle-devnet DUST-fee pitfalls: 117 (NotNormalized) and 138 (BalanceCheckOverspend)

These two are the most common early stumbling blocks on a freshly-started **local devnet**, where the per-block fee rate is effectively zero. Both come down to **how much DUST a transaction spends on fees** — all fees are denominated in **DUST**, never NIGHT.

**117 — the fee computed to zero, so the DUST spend set was empty.** The wallet computes a transaction's fee as roughly `feesWithMargin(ledgerParams, feeBlocksMargin) + (additionalFeeOverhead ?? 0n)` (`calculateFee`, midnight-wallet `packages/dust-wallet/src/v1/Transacting.ts`). On an idle devnet `feesWithMargin` evaluates to `0`, so with no `additionalFeeOverhead` the fee is `0`. A zero fee gives the balancer no imbalance to cover, so it adds no DUST inputs and the transaction is built with an **empty `DustActions`**. `DustActions::well_formed` (midnight-ledger `ledger/src/dust.rs:773`) rejects empty dust actions, which the node maps to `NotNormalized` = **117** (midnight-node `ledger/src/ledger_9/types.rs:438`; `ledger_8/types.rs:436`). On submission it surfaces as `1010: Invalid Transaction: Custom error: 117`.

In practice a `ContractDeploy` is accepted but the **first contract call fails** with 117. This deploy/call asymmetry is empirical — there is **no special minimum-cost floor on `ContractDeploy`** in the source, so don't assume one.

**Fix:** give the wallet a small positive `additionalFeeOverhead` so a real DUST fee is spent:

```ts
costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000_000n }
```

Any positive amount the wallet can cover in DUST works (the basic-start tutorial and the compact-cli-dev template use `300_000_000_000_000n`). The fix is verified end-to-end on a local devnet: with overhead `0n` the first contract call is rejected with 117; with `1_000_000n` both the deploy and the call succeed.

**138 — a token balance went negative after fees.** `BalanceCheckOverspend` = **138** (midnight-node `ledger/src/ledger_9/types.rs:465`; `ledger_8/types.rs:463`) fires from `balancing_check` (midnight-ledger `ledger/src/verify.rs:1297`) when a transaction (or one of its segments) spends more of a token than it has available once fees are applied. Because fees are paid in **DUST**, a DUST-side 138 means the transaction's DUST fee exceeded the wallet's available DUST — raising NIGHT does **not** fix it. **DUST registration does not trigger this**, despite running at a `0` DUST balance: registration is self-funding — its fee is paid by the DUST the registered NIGHT UTXOs generate (`generatedNow`), not from the wallet's existing DUST balance. A wallet funded with as little as 5 NIGHT registers successfully (verified on a local devnet at 5, 100, and 10,000 NIGHT — all succeeded; setting `additionalFeeOverhead` during registration was also verified not to change this). See also 173 (`InsufficientDustForRegistrationFee`).

---

## Error Tables by Code Range

### Deserialization Errors (0–11)

Group: "Data that couldn't be deserialized from the wire format."

| Code | Name | Description | Fixes |
|------|------|-------------|-------|
| 0 | NetworkId | Failed to deserialize the network ID | Check SDK version compatibility, verify network ID encoding |
| 1 | Transaction | Failed to deserialize transaction payload | Verify transaction was built with a compatible SDK version |
| 2 | LedgerState | Failed to deserialize ledger state | Internal node error — may indicate corrupted state |
| 3 | ContractAddress | Failed to deserialize contract address | Verify the contract address format |
| 4 | PublicKey | Failed to deserialize public key | Check key format and encoding |
| 5 | VersionedArenaKey | Failed to deserialize versioned arena key | Internal — may indicate version mismatch |
| 6 | UserAddress | Failed to deserialize user address | Verify address format |
| 7 | TypedArenaKey | Failed to deserialize typed arena key | Internal — may indicate version mismatch |
| 8 | SystemTransaction | Failed to deserialize system transaction | Governance/bridge transaction format error |
| 9 | DustPublicKey | Failed to deserialize DUST public key | Check DUST key format |
| 10 | CNightGeneratesDustActionType | Failed to deserialize cNIGHT-generates-DUST action type | Internal bridge/observation error |
| 11 | CNightGeneratesDustEvent | Failed to deserialize cNIGHT-generates-DUST event | Internal bridge/observation error |

### Serialization Errors (50–63)

Group: "Data that couldn't be serialized for storage or transmission."

| Code | Name | Description | Fixes |
|------|------|-------------|-------|
| 50 | TransactionIdentifier | Failed to serialize transaction identifier | Internal — report as bug |
| 51 | LedgerState | Failed to serialize ledger state | Internal node error |
| 52 | LedgerParameters | Failed to serialize ledger parameters | Internal node error |
| 53 | ContractAddress | Failed to serialize contract address | Internal — should not normally occur |
| 54 | ContractState | Failed to serialize contract state | Contract state may be corrupted |
| 55 | ContractStateToJson | Failed to serialize contract state to JSON | Contract state format incompatible with JSON serialization |
| 56 | ZswapState | Failed to serialize Zswap state | Internal Zswap error |
| 57 | UnknownType | Failed to serialize an unknown type | Internal — type not recognized |
| 58 | MerkleTreeDigest | Failed to serialize Merkle tree digest | Internal Merkle tree error |
| 59 | VersionedArenaKey | Failed to serialize versioned arena key | Internal |
| 60 | TypedArenaKey | Failed to serialize typed arena key | Internal |
| 61 | CNightGeneratesDustEvent | Failed to serialize cNIGHT-generates-DUST event | Internal bridge error |
| 62 | SystemTransaction | Failed to serialize system transaction | Internal governance error |
| 63 | ArenaHash | Failed to serialize arena hash | Internal |

### Transaction Invalid (100–109, 194–200, 239–244, 248–250)

Group: "Transaction was applied to ledger state but rejected by ledger validation rules. The transaction structure is valid, but the state transition it proposes violates a ledger invariant."

| Code | Name | Description | Fixes |
|------|------|-------------|-------|
| 100 | EffectsMismatch | Declared transaction effects don't match the computed effects | Rebuild the transaction — the effects declaration is stale or was computed incorrectly |
| 101 | ContractAlreadyDeployed | A contract already exists at the target address | Use a different contract address or find the existing deployment |
| 102 | ContractNotPresent | Called a contract that doesn't exist at the given address | Verify the contract address; deploy the contract first |
| 103 | Zswap (umbrella) | Generic Zswap-invalid error. Specific subcases now split out to 239 (NullifierAlreadyPresent), 240 (CommitmentAlreadyPresent), 241 (UnknownMerkleRoot), 250 (MerkleTreeError) | See the specific subcase that fired |
| 104 | Transcript | On-chain transcript execution was rejected | Check contract logic; the circuit's on-chain transcript failed |
| 105 | InsufficientClaimable | Not enough NIGHT tokens to claim | Ensure sufficient NIGHT balance for the operation |
| 106 | VerifierKeyNotFound | Verifier key missing for the circuit operation | Deploy the verifier key before calling the circuit |
| 107 | VerifierKeyAlreadyPresent | Verifier key already exists for this operation | The key is already deployed; no action needed |
| 108 | ReplayCounterMismatch | Signed counter doesn't match (replay attack prevention) | Rebuild the transaction with the current replay counter |
| 109 | UnknownError | Unclassified transaction invalid error | Check node logs for details |
| ~~193~~ | ~~ReplayProtectionViolation~~ | **[RETIRED]** Replaced by structured Invalid-side codes 242 (IntentTtlExpired), 243 (IntentTtlTooFarInFuture), 244 (IntentAlreadyExists). 193 is in `RETIRED_U8_ERROR_CODES`. | See 242/243/244 |
| 194 | BalanceCheckOutOfBounds | Token balance would overflow or underflow | Verify token amounts don't exceed representable range |
| 195 | InputNotInUtxos | Input references a UTXO that doesn't exist in the set | The coin may already be spent; resync wallet state |
| 196 | DustDoubleSpend | Attempt to spend the same DUST twice | DUST UTXO already consumed; resync dust wallet |
| 197 | DustDeregistrationNotRegistered | Attempting to deregister a DUST address that isn't registered | Verify the DUST address is currently registered |
| 198 | GenerationInfoAlreadyPresent | DUST generation info already exists | Duplicate generation info submission |
| 199 | InvariantViolation | Protocol-level invariant violated (e.g., NIGHT supply exceeded) | Transaction would break fundamental protocol rules |
| 200 | RewardTooSmall | Claimed reward is below the minimum payout threshold | Accumulate more rewards before claiming |
| 239 | Zswap.NullifierAlreadyPresent | Zswap double-spend: nullifier already exists in the chain (specific subcase of old 103) | Coin already spent; refresh wallet state and use a different coin |
| 240 | Zswap.CommitmentAlreadyPresent | Zswap commitment already in the tree (faerie-gold double-commit) | Generate a fresh nonce so the commitment differs |
| 241 | Zswap.UnknownMerkleRoot | Zswap input references a Merkle root the chain does not recognize | Resync the wallet against the current chain head |
| 242 | ReplayProtectionViolation.IntentTtlExpired | Intent TTL expired between submission and validation | Submit transactions promptly; increase TTL |
| 243 | ReplayProtectionViolation.IntentTtlTooFarInFuture | Intent TTL is too far ahead | Use a TTL within the protocol's allowed window |
| 244 | ReplayProtectionViolation.IntentAlreadyExists | Intent identifier already exists | Generate a fresh intent identifier |
| 248 | DivideByZero | Contract circuit attempted division by zero during ledger-side validation | Add a non-zero check before division in the witness |
| 249 | Invalid.MerkleTreeError | Merkle tree update failed during transaction validation | Internal protocol error; check node logs |
| 250 | Zswap.MerkleTreeError | Merkle tree update failed inside Zswap state application | Internal Zswap error; rebuild the transaction |

### Transaction Malformed (110–139, 166–181, 183–185, 189–192, 212–238)

Group: "Structural validity errors caught before applying the transaction to ledger state. These indicate the transaction itself is malformed — not that the ledger rejected it after application."

| Code | Name | Description | Fixes |
|------|------|-------------|-------|
| 110 | VerifierKeyNotSet | Contract deployed without required verifier key | Include verifier keys when deploying the contract |
| 111 | TransactionTooLarge | Transaction exceeds maximum allowed size | Reduce transaction payload; split into multiple transactions |
| 112 | VerifierKeyTooLarge | Verifier key exceeds deserialization limit | Use a smaller circuit or contact Midnight support |
| 113 | VerifierKeyNotPresent | Referenced verifier key not found | Deploy the verifier key before calling the circuit |
| 114 | ContractNotPresent | Transaction references a non-existent contract | Verify contract address; deploy the contract first |
| 115 | InvalidProof | Zero-knowledge proof verification failed | Regenerate the proof; ensure proof server is compatible |
| 116 | BindingCommitmentOpeningInvalid | Binding commitment was incorrectly opened | Internal Zswap error — rebuild the transaction |
| 117 | NotNormalized | Transaction is not in normal form — most often an idle-devnet zero fee that produced an empty DUST spend set | Set a small positive `additionalFeeOverhead` (e.g. `1_000_000n`) at wallet construction; see the idle-devnet DUST-fee deep dive above |
| 118 | FallibleWithoutCheckpoint | Fallible transcript missing initial checkpoint | Add kernel.checkpoint() at the start of fallible sections |
| 119 | ClaimReceiveFailed | Failed to claim a coin commitment receive | Coin commitment format error; rebuild the transaction |
| 120 | ClaimSpendFailed | Failed to claim a coin commitment spend | Coin commitment format error; rebuild the transaction |
| 121 | ClaimNullifierFailed | Failed to claim a nullifier | Nullifier format error; rebuild the transaction |
| 122 | ClaimCallFailed | Failed to claim a contract call | Contract call format error; rebuild the transaction |
| 123 | InvalidSchnorrProof | Fiat-Shamir Schnorr proof verification failed | Signing error — regenerate the transaction signature |
| 124 | UnclaimedCoinCom | Contract-owned output left unclaimed | All contract outputs must be claimed in the transaction |
| 125 | UnclaimedNullifier | Contract-owned coin input left unauthorized | All contract inputs must be authorized |
| 126 | Unbalanced | Negative balance in a token type | Transaction doesn't balance — check token amounts |
| 127 | Zswap (umbrella) | Generic Zswap-malformed error. Specific subcases now split out to 235 (InvalidProof), 236 (ContractSentCiphertext), 237 (NonDisjointCoinMerge), 238 (NotNormalized) | See the specific subcase that fired |
| 128 | BuiltinDecode | FAB (field-aligned binary) decode error | Internal encoding error; verify data formats |
| 129 | GuaranteedLimit | Exceeded guaranteed section limits | Reduce the guaranteed section size |
| 130 | MergingContracts | Error merging contract intents | Contracts can't be merged in this configuration |
| 131 | CantMergeTypes | Attempted to merge incompatible transaction types | Transaction types must be compatible for merging |
| 132 | ClaimOverflow | Claimed coin value overflows deltas | Token amounts exceed representable range |
| 133 | ClaimCoinMismatch | ClaimRewards coin doesn't match the real coin | Rebuild the claim with correct coin data |
| 134 | KeyNotInCommittee | Signing key is not a committee member | Only committee members can sign this operation |
| 135 | InvalidCommitteeSignature | Committee signature verification failed | Verify the signing key and signature |
| 136 | ThresholdMissed | Committee approval threshold not met | Gather more committee signatures |
| 137 | TooManyZswapEntries | Too many Zswap entries (>=2^16) | Reduce the number of shielded operations |
| 138 | BalanceCheckOverspend | A token balance went negative after fees — the tx (or a segment) spends more than it has once fees are applied; fees are paid in DUST, not NIGHT | Reduce outputs or add inputs; for a DUST-side 138 ensure enough DUST (raising NIGHT won't help). DUST registration is self-funding and does not cause this. See the idle-devnet DUST-fee deep dive above |
| 139 | UnknownError | Unclassified malformed transaction error | Check node logs for details |
| 166 | InvalidNetworkId | Transaction's network ID doesn't match the node's network | Verify networkId matches the target (e.g., 'undeployed' for devnet); check setNetworkId() |
| 167 | IllegallyDeclaredGuaranteed | Guaranteed segment (0) used where forbidden | Don't use segment_id 0 for intents |
| ~~168~~ | ~~FeeCalculation~~ | **[RETIRED]** Renamed/relocated to top-level `FeeCalculationError` at u8 155, with sub-cases 231/232. 168 is in `RETIRED_U8_ERROR_CODES`. | See 155, 231, 232 |
| 169 | InvalidDustRegistrationSignature | DUST registration signature verification failed | Regenerate DUST registration with correct keys |
| 170 | InvalidDustSpendProof | DUST spend proof verification failed | Regenerate DUST spend proof |
| 171 | OutOfDustValidityWindow | DUST outside its validity time window | DUST creation time is outside the allowed window; use fresher DUST |
| 172 | MultipleDustRegistrationsForKey | Multiple DUST registrations for same key in one intent | Only one DUST registration per key per intent |
| 173 | InsufficientDustForRegistrationFee | Not enough DUST to pay registration fee | Acquire more DUST before registering |
| 174 | MalformedContractDeploy (umbrella) | Generic deploy-malformed error. Specific subcases now split out to 233 (NonZeroBalance), 234 (IncorrectChargedState) | Check for non-zero balance or incorrect charged state in deploy |
| 175 | IntentSignatureVerificationFailure | Intent signature verification failed | Regenerate intent signatures |
| 176 | IntentSignatureKeyMismatch | Signing key doesn't match verifying key | Use the correct signing key for the intent |
| 177 | IntentSegmentIdCollision | Duplicate segment_id in intent merge | Each intent must have a unique segment_id |
| 178 | IntentAtGuaranteedSegmentId | Intent placed at segment_id 0 (reserved for guaranteed) | Use segment_id >= 1 for intents |
| 179 | UnsupportedProofVersion | Proof version not supported | Update SDK/proof server to a compatible version |
| 180 | GuaranteedTranscriptVersion | Guaranteed transcript version not supported | Update to a compatible ledger/SDK version |
| 181 | FallibleTranscriptVersion | Fallible transcript version not supported | Update to a compatible ledger/SDK version |
| ~~182~~ | ~~TransactionApplicationError~~ | **[RETIRED]** Replaced by structured Malformed-side codes 228 (IntentTtlExpired), 229 (IntentTtlTooFarInFuture), 230 (IntentAlreadyExists). 182 is in `RETIRED_U8_ERROR_CODES`. | See 228/229/230 |
| 183 | BalanceCheckOutOfBounds | Balance overflow/underflow in a segment | Token amounts in a segment exceed representable range |
| 184 | BalanceCheckConversionFailure | Failed to convert balance to i128 | Token amount too large for internal representation |
| 185 | PedersenCheckFailure | Binding commitment mismatch | Internal cryptographic error — rebuild the transaction |
| ~~186~~ | ~~EffectsCheckFailure~~ | **[RETIRED]** Replaced by structured EffectsCheck codes 212–218. 186 is in `RETIRED_U8_ERROR_CODES`. | See 212–218 |
| ~~187~~ | ~~DisjointCheckFailure~~ | **[RETIRED]** Replaced by structured DisjointCheck codes 225–227. 187 is in `RETIRED_U8_ERROR_CODES`. | See 225/226/227 |
| ~~188~~ | ~~SequencingCheckFailure~~ | **[RETIRED]** Replaced by structured SequencingCheck codes 219–224. 188 is in `RETIRED_U8_ERROR_CODES`. | See 219–224 |
| 189 | InputsNotSorted | Unshielded inputs are not sorted | Sort unshielded inputs before submission |
| 190 | OutputsNotSorted | Unshielded outputs are not sorted | Sort unshielded outputs before submission |
| 191 | DuplicateInputs | Duplicate unshielded inputs | Remove duplicate inputs from the transaction |
| 192 | InputsSignaturesLengthMismatch | Input count doesn't match signature count | Ensure each input has a corresponding signature |
| 212 | EffectsCheck.RealCallsSubsetCheckFailure | EffectsCheck failed: actual real calls are not a subset of declared real calls | Rebuild so declared effects exactly match real call set |
| 213 | EffectsCheck.AllCommitmentsSubsetCheckFailure | EffectsCheck failed: actual commitment set is not a subset of declared commitments | Verify all coin commitments are declared in effects |
| 214 | EffectsCheck.RealUnshieldedSpendsSubsetCheckFailure | EffectsCheck failed: real unshielded spends are not a subset of declared | Ensure declared unshielded spends cover actual spends |
| 215 | EffectsCheck.ClaimedUnshieldedSpendsUniquenessFailure | EffectsCheck failed: claimed unshielded spends are not unique | Deduplicate claimed unshielded spend entries |
| 216 | EffectsCheck.ClaimedCallsUniquenessFailure | EffectsCheck failed: claimed contract calls are not unique | Deduplicate claimed call entries |
| 217 | EffectsCheck.NullifiersNeqClaimedNullifiers | EffectsCheck failed: actual nullifier set differs from claimed | Ensure claimed nullifiers exactly match produced nullifiers |
| 218 | EffectsCheck.CommitmentsNeqClaimedShieldedReceives | EffectsCheck failed: actual commitments differ from claimed shielded receives | Ensure claimed shielded receives match emitted commitments |
| 219 | SequencingCheck.CallSequencingViolation | Sequencing failed: contract call ordering violates the call graph | Reorder dependent calls after their prerequisites |
| 220 | SequencingCheck.SequencingCorrelationViolation | Sequencing failed: cross-call correlation invariant violated | Ensure correlated calls reference each other consistently |
| 221 | SequencingCheck.GuaranteedInFallibleContextViolation | Sequencing failed: guaranteed call in fallible context | Move the guaranteed segment out of the fallible block |
| 222 | SequencingCheck.FallibleInGuaranteedContextViolation | Sequencing failed: fallible call in guaranteed context | Move fallible operations after kernel.checkpoint() |
| 223 | SequencingCheck.CausalityConstraintViolation | Sequencing failed: causality constraint between calls violated | Ensure earlier calls' outputs precede later calls' uses |
| 224 | SequencingCheck.CallHasEmptyTranscripts | Sequencing failed: a contract call has empty transcripts | Remove empty calls or add at least one transcript entry |
| 225 | DisjointCheck.ShieldedInputsDisjointFailure | DisjointCheck failed: shielded inputs are not disjoint across segments | Each shielded input must appear in exactly one segment |
| 226 | DisjointCheck.ShieldedOutputsDisjointFailure | DisjointCheck failed: shielded outputs overlap across segments | Each shielded output must appear in exactly one segment |
| 227 | DisjointCheck.UnshieldedInputsDisjointFailure | DisjointCheck failed: unshielded inputs are not disjoint | Each unshielded input must appear in exactly one segment |
| 228 | TransactionApplication.IntentTtlExpired | Malformed-side: intent TTL expired (replaces opaque 182) | Set the intent TTL further in the future before signing |
| 229 | TransactionApplication.IntentTtlTooFarInFuture | Malformed-side: intent TTL too far in the future | Reduce the intent TTL to within the allowed window |
| 230 | TransactionApplication.IntentAlreadyExists | Malformed-side: intent identifier already exists | Generate a fresh intent identifier |
| 231 | FeeCalculation.OutsideTimeToDismiss | Fee-calculation failed: time-to-dismiss outside allowed window for tx size | Adjust time-to-dismiss into the size-dependent allowed range |
| 232 | FeeCalculation.BlockLimitExceeded | Fee-calculation failed: would exceed block resource limit | Reduce tx size or wait for a less congested block |
| 233 | MalformedContractDeploy.NonZeroBalance | Contract deploy carries non-zero balance entries (forbidden) | Remove balance entries from the deploy intent |
| 234 | MalformedContractDeploy.IncorrectChargedState | Contract deploy carries an incorrectly computed charged-state map | Rebuild deploy via SDK so charged-state matches the schema |
| 235 | Zswap.Malformed.InvalidProof | Zswap-malformed: inner proof verification failed | Regenerate the Zswap offer's proof |
| 236 | Zswap.Malformed.ContractSentCiphertext | Zswap-malformed: contract emitted ciphertext to itself (forbidden) | Restructure contract logic to avoid self-ciphertext |
| 237 | Zswap.Malformed.NonDisjointCoinMerge | Zswap-malformed: offers being merged operate on overlapping coin sets | Ensure merged offers operate on disjoint coin sets |
| 238 | Zswap.Malformed.NotNormalized | Zswap-malformed: the offer is not in normal form | Re-normalize the offer with the SDK |

### Infrastructure Errors (150–157, 165)

Group: "Node infrastructure errors not directly related to transaction content. Top-level `LedgerApiError` variants live here alongside the cache/state/cost/fee/context codes."

| Code | Name | Description | Fixes |
|------|------|-------------|-------|
| 150 | LedgerCacheError | Ledger cache mutex/lock poisoned | Restart the node; this is an internal concurrency error |
| 151 | NoLedgerState | No ledger state present in the node | Node may not be fully synced; wait for sync to complete |
| 152 | LedgerStateScaleDecodingError | SCALE decoding of ledger state failed | Node state may be corrupted; try resyncing |
| 153 | ContractCallCostError | Failed to calculate contract call cost | Internal cost model error |
| 154 | BlockLimitExceededError | Transaction exceeds block limits | Reduce transaction size or wait for a less congested block |
| 155 | FeeCalculationError | Fee calculation failed (top-level wrapper). Specific subcases at 231/232 | Internal fee model error |
| 156 | ContractNotPresent (top-level) | Top-level `LedgerApiError::ContractNotPresent` — contract lookup outside transaction validation found nothing | Verify the contract address; deploy first |
| 157 | BeneficiaryNotFound | Reward beneficiary not found | Confirm the beneficiary address is registered |
| 165 | GetTransactionContextError | Failed to retrieve transaction context | Internal node error |

### System Transaction Errors (201–204, 206–211, 245–247)

Group: "Errors from governance and bridge system transactions. These are special transactions submitted by the network's governance mechanisms."

| Code | Name | Description | Fixes |
|------|------|-------------|-------|
| 201 | IllegalPayout | Payout exceeds remaining supply or bridge pool | Payout amount is too large for available funds |
| 202 | InsufficientTreasuryFunds | Treasury doesn't have enough funds | Requested amount exceeds treasury balance |
| 203 | CommitmentAlreadyPresent | Faerie-gold double-commitment attempt | Commitment already exists in the tree |
| 204 | UnknownError | Unclassified system transaction error | Check node logs |
| ~~205~~ | ~~ReplayProtectionFailure~~ | **[RETIRED]** Replaced by structured codes 245 (IntentTtlExpired), 246 (IntentTtlTooFarInFuture), 247 (IntentAlreadyExists). 205 is in `RETIRED_U8_ERROR_CODES`. | See 245/246/247 |
| 206 | IllegalReserveDistribution | Reserve distribution exceeds supply | Distribution amount exceeds available reserves |
| 207 | GenerationInfoAlreadyPresent | DUST generation info already inserted | Duplicate generation info |
| 208 | InvalidBasisPoints | Bridge fee basis points >= 10,000 | Basis points must be between 0 and 9,999 |
| 209 | InvariantViolation | Protocol-level invariant violated | Transaction would break fundamental protocol rules |
| 210 | TreasuryDisabled | Attempted to access disabled treasury | Treasury feature is not enabled |
| 211 | MerkleTreeError | Merkle tree update failed during system transaction processing | Internal protocol error; check node logs |
| 245 | ReplayProtectionFailure.IntentTtlExpired | System-tx replay-protection: intent TTL expired (replaces opaque 205) | Operators must resubmit the system transaction with a fresh TTL |
| 246 | ReplayProtectionFailure.IntentTtlTooFarInFuture | System-tx replay-protection: intent TTL too far in the future | Adjust TTL into the allowed window |
| 247 | ReplayProtectionFailure.IntentAlreadyExists | System-tx replay-protection: intent identifier already exists | Use a fresh intent identifier for the system transaction |

### Host API Error (255)

| Code | Name | Description | Fixes |
|------|------|-------------|-------|
| 255 | HostApiError | Error in host API processing | Internal runtime error; check node logs |

### Reserved Ranges

The following code ranges are currently unassigned and reserved for future use (verified against `RETIRED_U8_ERROR_CODES` and the full `From<LedgerApiError> for u8` mapping):

- 12–49 (between deserialization and serialization)
- 64–99 (between serialization and transaction errors)
- 140–149 (gap in malformed transaction range)
- 158–164 (between top-level/infrastructure and the start of the old malformed range)
- 251–254 (just below the host API code at 255)

The retired set (currently `[168, 182, 186, 187, 188, 193, 205]`) is preserved in `RETIRED_U8_ERROR_CODES` to prevent reuse — those numbers are not available for new variants.

---

## Pallet Dispatch Errors

When a transaction fails inside a Substrate pallet, the error surfaces as `DispatchError::Module { index, error }`. The `index` identifies the pallet and `error` is the SCALE-encoded variant index within that pallet's error enum.

### Pallet Index Map

The runtime now uses the `#[frame_support::runtime]` macro (replacing `construct_runtime!`). Pallets carrying `#[pallet::error]` and surfacing `DispatchError::Module { index, error }`:

| Index | Pallet | Description |
|-------|--------|-------------|
| 5 | pallet_midnight | Core Midnight ledger pallet |
| 6 | pallet_midnight_system | System transaction pallet |
| 8 | pallet_session_validator_management | Partner-chains committee selection inherent (upstream `input-output-hk/partner-chains`) |
| 13 | pallet_cnight_observation | cNIGHT bridge observation |
| 32 | pallet_partner_chains_bridge | Partner-chains main-chain bridge inherent (upstream `input-output-hk/partner-chains`) |
| 33 | pallet_c2m_bridge | Cardano-to-Midnight bridge — **no `#[pallet::error]`**; failures surface via system tx |
| 44 | pallet_federated_authority | Governance authority |
| 45 | pallet_federated_authority_observation | Authority observation |
| 50 | pallet_system_parameters | System parameters |
| 51 | pallet_throttle | Transaction throttling — no error variants; failures surface as `InvalidTransaction::ExhaustsResources` from the `CheckThrottle` transaction extension |

> Indices 8 (`pallet_session_validator_management`) and 32 (`pallet_partner_chains_bridge`) are upstream `input-output-hk/partner-chains` pallets vendored into the Midnight runtime; their error variants are documented below alongside the Midnight-authored pallets.
>
> Indices 4 (`pallet_sidechain`) and 30 (`pallet_partner_chains_session`) are also partner-chains pallets but do **not** define a `#[pallet::error]` enum, so they cannot produce `DispatchError::Module { index, error }`. Their failure modes surface as inherent errors at block production, not as decodable Module errors.
>
> Other indices in the runtime composition (NodeVersion @ 11, Preimage @ 15, MultiBlockMigrations @ 16, PalletSession @ 17, Scheduler @ 18, TxPause @ 19, Beefy @ 21, Mmr @ 22, BeefyMmrLeaf @ 23, Council @ 40, CouncilMembership @ 41, TechnicalCommittee @ 42, TechnicalCommitteeMembership @ 43) belong to upstream Substrate pallets and are not enumerated here. A user receiving `DispatchError::Module { index, error }` from one of those indices should consult the relevant upstream pallet's `Error` enum.

### pallet_midnight (index 5)

`Error<T>` enum (with `#[codec(index = N)]`):

| Codec idx | Name | Description |
|-----------|------|-------------|
| 0 | NewStateOutOfBounds | New ledger state is out of acceptable bounds |
| 1 | Deserialization | Wraps `DeserializationError` (u8 codes 0–11) |
| 2 | Serialization | Wraps `SerializationError` (u8 codes 50–63) |
| 3 | Transaction | Wraps `TransactionError` (u8 codes 100–210, 212–250) |
| 4 | LedgerCacheError | Ledger cache poisoned (u8 150) |
| 5 | NoLedgerState | No ledger state (u8 151) |
| 6 | LedgerStateScaleDecodingError | SCALE decode failure (u8 152) |
| 7 | ContractCallCostError | Cost calculation failure (u8 153) |
| 8 | BlockLimitExceededError | Block limit exceeded (u8 154) |
| 9 | FeeCalculationError | Fee calculation failure (u8 155) |
| 10 | HostApiError | Host API error (u8 255) |
| 11 | NetworkIdNotString | Network ID not a valid string |
| 12 | GetTransactionContextError | Transaction context retrieval error (u8 165) |
| 13 | ContractNotPresent | Top-level contract-not-present (u8 156) |
| 14 | BeneficiaryNotFound | Reward beneficiary not found (u8 157) |

### pallet_midnight_system (index 6)

`Error<T>` enum (`#[codec(index = ...)]` explicit; **note: index 0 is intentionally not used**). Source flattens `LedgerApiError` into the pallet error rather than wrapping the parent enum:

| Codec idx | Name | Description |
|-----------|------|-------------|
| 1 | SystemTransactionNotAllowedForGovernance | Governance-disallowed system transaction |
| 2 | Deserialization | Wraps `DeserializationError` |
| 3 | Serialization | Wraps `SerializationError` |
| 4 | Transaction | Wraps `TransactionError` |
| 5 | LedgerCacheError | Ledger cache poisoned |
| 6 | NoLedgerState | No ledger state present |
| 7 | LedgerStateScaleDecodingError | SCALE decode failure |
| 8 | ContractCallCostError | Cost calculation failure |
| 9 | BlockLimitExceededError | Block limit exceeded |
| 10 | FeeCalculationError | Fee calculation failure |
| 11 | HostApiError | Host API error |
| 12 | GetTransactionContextError | Transaction context retrieval error |
| 13 | ContractNotPresent | Top-level contract-not-present |
| 14 | BeneficiaryNotFound | Reward beneficiary not found |

### pallet_session_validator_management (index 8)

Upstream partner-chains pallet. `Error<T>` enum (no `#[codec(index)]` attributes — SCALE assigns sequential indices in declaration order):

| Codec idx | Name | Description |
|-----------|------|-------------|
| 0 | InvalidEpoch | `Pallet::set` called with an epoch number that is not `current_epoch + 1` |
| 1 | NextCommitteeAlreadySet | `Pallet::set` called twice for the same next epoch |

Source: `partner-chains/toolkit/committee-selection/pallet/src/lib.rs` (vendored from `input-output-hk/partner-chains` v1.8.0). These errors are emitted by the committee selection inherent and surface block-production-side, not from user-submitted extrinsics.

### pallet_federated_authority (index 44)

| Variant | Name | Description |
|---------|------|-------------|
| 0 | MotionAlreadyApproved | Authority already approved this motion |
| 1 | MotionApprovalMissing | Approver not in the approval list |
| 2 | MotionApprovalExceedsBounds | Exceeds maximum authority bodies |
| 3 | MotionNotFound | Motion does not exist |
| 4 | MotionNotEnded | Motion voting not yet complete |
| 5 | MotionHasEnded | Motion ended; no more changes allowed |
| 6 | MotionTooEarlyToClose | Approval period hasn't ended yet |
| 7 | MotionAlreadyExists | Motion already exists |
| 8 | MotionExpired | Motion expired without enough approvals |
| 9 | MotionWeightBoundTooLow | Weight bound too low for the call |

### pallet_cnight_observation (index 13)

`Error<T>` enum (no `#[codec(index)]` attributes — SCALE assigns sequential indices in declaration order). The pallet has its own observation-specific variants (indices 0–4) followed by **flattened** `LedgerApiError` variants (indices 5–17):

| Codec idx | Name | Description |
|-----------|------|-------------|
| 0 | MaxCardanoAddrLengthExceeded | Cardano wallet address too long |
| 1 | MaxRegistrationsExceeded | Too many registrations |
| 2 | InherentAlreadyExecuted | Only one inherent call per block |
| 3 | CardanoPositionRegression | Next Cardano position doesn't advance |
| 4 | TooManyUtxos | UTXO count exceeds capacity |
| 5 | Deserialization | Wraps `DeserializationError` |
| 6 | Serialization | Wraps `SerializationError` |
| 7 | Transaction | Wraps `TransactionError` |
| 8 | LedgerCacheError | Ledger cache poisoned |
| 9 | NoLedgerState | No ledger state present |
| 10 | LedgerStateScaleDecodingError | SCALE decode failure |
| 11 | ContractCallCostError | Cost calculation failure |
| 12 | BlockLimitExceededError | Block limit exceeded |
| 13 | FeeCalculationError | Fee calculation failure |
| 14 | HostApiError | Host API error |
| 15 | GetTransactionContextError | Transaction context retrieval error |
| 16 | ContractNotPresent | Top-level contract-not-present |
| 17 | BeneficiaryNotFound | Reward beneficiary not found |

### pallet_federated_authority_observation (index 45)

| Variant | Name | Description |
|---------|------|-------------|
| 0 | EmptyMembers | Membership set is empty |
| 1 | DuplicatedMembers | Duplicate members in the set |
| 2 | InherentAlreadyExecuted | Only one inherent call per block |

### pallet_system_parameters (index 50)

| Variant | Name | Description |
|---------|------|-------------|
| 0 | UrlTooLong | URL exceeds maximum allowed length |

### pallet_partner_chains_bridge (index 32)

Upstream partner-chains pallet. `Error<T>` enum (no `#[codec(index)]` attributes — SCALE assigns sequential indices in declaration order):

| Codec idx | Name | Description |
|-----------|------|-------------|
| 0 | InherentAlreadyExecuted | The bridge inherent (`handle_transfers`) was called more than once in a single block |

Source: `partner-chains/toolkit/bridge/pallet/src/lib.rs` (vendored from `input-output-hk/partner-chains` v1.8.0). This error is emitted by the bridge inherent and is not reachable from user-submitted extrinsics.

---

## JSON-RPC Error Codes

The Midnight node uses standard JSON-RPC 2.0 error codes from the `jsonrpsee` crate. The full upstream Substrate envelope (AUTHOR/SYSTEM/CHAIN/STATE/etc. 1xxx–8xxx codes) is documented in [Phase 2 below](#substrate-jsonrpc-envelope-1000base) and surfaces alongside these JSON-RPC standard codes.

| Code | Name | Used In | Description |
|------|------|---------|-------------|
| -32602 | INVALID_PARAMS | State RPC, Block RPC, Events, Peer Info | Bad contract address, account address, block hash, peer ID, or other invalid parameter |
| -32603 | INTERNAL_ERROR | Peer Info RPC, System Parameters RPC | Failed to send/receive internal requests, runtime API failures |
| -32000 | Custom server error | `node/src/rpc.rs` | "Finality subscription limit reached" — emitted when the per-connection finality subscription cap is hit |
| -1 | Application error (partner-chains) | `sidechain_*`, `committeeSelection_*`, `blockProducerFees_*`, `blockProducerMetadata_*` RPCs | Generic catch-all formatted as `"{err:?}"` from partner-chains toolkit RPCs |

---

## Upstream Substrate Reference

The Midnight node inherits its RPC envelope, transaction-validity model, and dispatch-error structure from upstream Substrate (`paritytech/polkadot-sdk`). The codes and enums below are NOT Midnight-specific. They surface alongside the Midnight u8 codes documented above.

### Substrate JSON-RPC envelope (1000-base)

Each RPC family reserves a 1000-wide range. Most actually-used codes sit at `BASE+1..+10`; MIXNET uses sub-bands.

| Base | Constant | Range | Surface |
|------|----------|-------|---------|
| 1000 | AUTHOR | 1001–1040 | `author_submitExtrinsic`, `author_submitAndWatchExtrinsic` |
| 2000 | SYSTEM | 2001–2002 (Midnight-relevant) | `system_*` RPC methods |
| 3000 | CHAIN | 3001–3002 | `chain_*` RPC methods |
| 4000 | STATE | 4001–4003 | `state_*` RPC methods (most-used non-author surface for DApps) |
| 5000 | OFFCHAIN | 5001 | `offchain_*` (almost always behind `--rpc-methods=Unsafe` → -32601 in practice) |
| 6000 | DEV | 6001, 6003–6005 | `dev_*` (almost always unsafe-only) |
| 7000 | STATEMENT | 7001 | `statement_*` (Midnight does not expose) |
| 8000 | MIXNET | 8001–8201 sub-banded | `mixnet_*` (Midnight does not expose) |

The AUTHOR family for transaction submission was already enumerated in the [Substrate JSON-RPC Envelope (1000-base)](#substrate-jsonrpc-envelope-1000base) section near the top of this document. Additional families a Midnight DApp dev plausibly hits:

#### SYSTEM (2000-base)

| Code | Constant | Description |
|------|----------|-------------|
| 2001 | NOT_HEALTHY_ERROR | `system_health` says the node is not fully functional (peer count zero, syncing, or shouldHavePeers + isolated). Carries a `Health` payload in `data`. |
| 2002 | MALFORMATTED_PEER_ARG_ERROR | `system_addReservedPeer` / `system_removeReservedPeer` got a peer argument it could not parse. |

#### CHAIN (3000-base)

| Code | Constant | Description |
|------|----------|-------------|
| 3001 | Other | Generic chain RPC error (unstructured string). |
| 3002 | Client | Wrapped client error (storage/db lookup, header decode). A DApp polling `chain_getBlockHash` for a future block number gets 3002, not -32602. |

#### STATE (4000-base)

| Code | Constant | Description |
|------|----------|-------------|
| 4001 | InvalidBlockRange | `state_queryStorage` got a `from`/`to` block range that cannot be resolved. |
| 4002 | InvalidCount | Count parameter exceeds the configured maximum (e.g., `state_getKeysPaged` count > limit). |
| 4003 | Client | Fall-through for any wrapped client error from state RPCs. |

#### OFFCHAIN/DEV/STATEMENT/MIXNET — low priority

OFFCHAIN (5001 `UnavailableStorageKind`), DEV (6001 `BlockQueryError`, 6003 `BlockExecutionFailed`, 6004 `WitnessCompactionFailed`, 6005 `ProofExtractionFailed`), STATEMENT (7001 `StatementStore`), and MIXNET (8001–8201) families exist upstream but rarely surface to Midnight DApp devs. OFFCHAIN/DEV/STATEMENT are usually behind `--rpc-methods=Unsafe` so calls return `-32601 MethodNotFound` instead. MIXNET is not exposed by Midnight nodes.

### Standard `InvalidTransaction` variants

Defined in `substrate/primitives/runtime/src/transaction_validity.rs`. These appear when the transaction pool rejects an extrinsic at validate time and surface in the `data` field of a `1010 POOL_INVALID_TX` response.

| Variant | Description | When emitted in a Midnight context |
|---------|-------------|-------------------------------------|
| `Call` | "Transaction call is not expected" | Midnight uses `GovernanceAuthorityCallFilter` — non-whitelisted calls (anything not in Council, TechnicalCommittee, FederatedAuthority, or `System::apply_authorized_upgrade`) get this. |
| `Payment` | Inability to pay fees | DUST balance can't cover fees. |
| `Future` | Tx will be valid in the future | Nonce gap — earlier nonces missing. |
| `Stale` | Tx is outdated | Nonce already used. |
| `BadProof` | Bad signature | Signature doesn't verify against the signer/payload. |
| `AncientBirthBlock` | Ancient mortal era | Mortal era's block hash too old (TTL expired before submission). |
| `ExhaustsResources` | Block/throttle resources exhausted | `pallet_throttle` per-account window limits, OR block weight exhausted. |
| `Custom(u8)` | u8 custom error | Maps all `LedgerApiError` codes 0–255 — see tables above. |
| `BadMandatory` | Mandatory call errored | Mandatory inherent/extension call errored. Should not surface to a DApp dev. |
| `MandatoryValidation` | Mandatory dispatch reached validation | Mandatory inherent reached the validate path. Should not surface. |
| `BadSigner` | Invalid signing address | Signer is not valid for this extrinsic. |
| `IndeterminateImplicit` | "The implicit data was unable to be calculated" | A `TransactionExtension`'s implicit metadata (era, genesis hash, spec version, etc.) couldn't be computed for the tx. |
| `UnknownOrigin` | "The transaction extension did not authorize any origin" | None of the runtime's `TransactionExtension`s ended up authorizing an origin for the tx. |

### Standard `UnknownTransaction` variants

Same file. The validator could not determine validity:

| Variant | Description | When emitted |
|---------|-------------|--------------|
| `CannotLookup` | Could not lookup info required to validate | Validator couldn't fetch state needed (signer's account, parent block). |
| `NoUnsignedValidator` | No unsigned validator matched | Unsigned extrinsic submitted but no `ValidateUnsigned` impl matched. |
| `Custom(u8)` | u8 custom unknown-tx error | Pallet-level escape hatch with a u8. Midnight does not appear to use this — `Custom(u8)` in Midnight always means the `Invalid::Custom` path. |

### `DispatchError` envelope

Defined in `substrate/primitives/runtime/src/lib.rs`. This is the structured error returned in the `system.ExtrinsicFailed` event when an extrinsic fails after passing validation:

| Variant | Description | When emitted in a Midnight context |
|---------|-------------|------------------------------------|
| `Other(&'static str)` | Generic message | Pallet returned a string error not mapped to a structured variant |
| `CannotLookup` | Failed origin/account lookup | Account address can't be resolved |
| `BadOrigin` | Origin signature invalid | Caller doesn't have the required origin (e.g., signed-but-needs-Root) |
| `Module { index, error, message? }` | **Pallet-level error — most-hit variant for Midnight.** `index` selects pallet (5/6/13/44/45/50/51 — see Pallet Index Map); `error` is a `[u8; MAX_MODULE_ERROR_ENCODED_SIZE]` SCALE-encoded variant index. Decode the variant index against the per-pallet tables above. |
| `ConsumerRemaining` | Account has consumer references | Tried to delete an account still consumed elsewhere |
| `NoProviders` | Account has no providers | Tried to make an account exist without provider reference |
| `TooManyConsumers` | Consumer limit reached | Account hit the consumer reference limit |
| `Token(TokenError)` | Balance/asset error | See `TokenError` sub-table |
| `Arithmetic(ArithmeticError)` | Math error | See `ArithmeticError` sub-table |
| `Transactional(TransactionalError)` | Storage transaction error | Internal — too many nested storage transactions, or commit/rollback without an active layer |
| `Exhausted` | Resource exhaustion | Generic out-of-resources |
| `Corruption` | State corrupted | Internal data corruption |
| `Unavailable` | Resource unavailable | Generic |
| `RootNotAllowed` | Root origin blocked | Call explicitly forbids root |
| `Trie(TrieError)` | Trie-level error | Storage trie operation failed |

#### `TokenError` sub-variants

| Variant | Description |
|---------|-------------|
| `FundsUnavailable` | Funds are unavailable |
| `OnlyProvider` | Account that must exist would die |
| `BelowMinimum` | Account cannot exist with the funds that would be given |
| `CannotCreate` | Account cannot be created |
| `UnknownAsset` | The asset in question is unknown |
| `Frozen` | Funds exist but are frozen |
| `Unsupported` | Operation is not supported by the asset |
| `CannotCreateHold` | Account cannot be created for recording amount on hold |
| `NotExpendable` | Account that is desired to remain would die |
| `Blocked` | Account cannot receive the assets |

#### `ArithmeticError` sub-variants

Defined in `substrate/primitives/arithmetic/src/lib.rs`:

| Variant | Description |
|---------|-------------|
| `Underflow` | An underflow would occur |
| `Overflow` | An overflow would occur |
| `DivisionByZero` | Division by zero |

#### `TransactionalError` sub-variants

| Variant | Description |
|---------|-------------|
| `LimitReached` | Too many transactional layers have been spawned |
| `NoLayer` | A transactional layer was expected, but does not exist |
