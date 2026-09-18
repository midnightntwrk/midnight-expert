# Ledger Errors Reference

> **Last verified:** anchor re-confirmed **2026-09-18** against `midnightntwrk/midnight-ledger@ledger-8` (still the repo's default branch; anchor `ledger/src/error.rs` present, sibling crates `zswap`, `onchain-runtime`, `onchain-vm`, `transient-crypto`, `proof-server`). Error-variant inventory deep-verified 2026-05-04. Note: a divergent `ledger-9` dev branch has begun adding new error variants (e.g. `MalformedTransaction::ContractMetadataTooLarge`, `IrNotFound`, `IrAlreadyPresent`) — re-verify against `ledger-9` once it becomes the default branch.

## Source

These errors are defined in the **midnight-ledger** crate and represent the full taxonomy of transaction validation, execution, and state management errors. They are the Rust-level details behind the numeric `LedgerApiError` codes surfaced by the node (see `node-errors.md` for the u8 → variant mapping).

**Implementation notes:**

- **`thiserror` is used only in the `proof-server` crate.** The core ledger crates (`ledger`, `zswap`, `onchain-runtime`, `onchain-vm`, `transient-crypto`, `base-crypto`) hand-roll `impl Display` and `impl Error`.
- **`ProvingError` and `VerifyingError` are opaque type aliases** for `anyhow::Error` (defined in `transient-crypto/src/proofs.rs`). The wrapped causes are not directly inspectable through pattern matching.
- **`#[non_exhaustive]` coverage is partial.** The attribute is present on `MalformedTransaction<D>`, `TransactionInvalid<D>`, `MalformedContractDeploy`, `QueryFailed<D>`, `TransactionConstructionError`, `EventReplayError`, `DustLocalStateError`, `DustStateError`, and `merkle_tree::InvalidUpdate`. It is **NOT** present on `SystemTransactionError`, `FeeCalculationError`, `TransactionApplicationError`, `TransactionProvingError<D>`, `SequencingCheckError`, `DisjointCheckError<D>`, `EffectsCheckError`, `PartitionFailure<D>`, `OnchainProgramError<D>`, `TranscriptRejected<D>`, `zswap::TransactionInvalid`, `zswap::MalformedOffer`, or `zswap::OfferCreationFailed`. Treat the partial-non_exhaustive variants as additionally extensible too — Midnight's release cadence regularly adds variants regardless of the marker.

## Error Hierarchy

There are **two parallel chains**, not a single nested spine:

```
MalformedTransaction<D>  ──┬─> Zswap(MalformedOffer)
                           │       └─> InvalidProof(VerifyingError = anyhow::Error)
                           ├─> BuiltinDecode(InvalidBuiltinDecode)
                           ├─> InvalidProof(VerifyingError = anyhow::Error)
                           ├─> EffectsCheckFailure(EffectsCheckError)
                           ├─> SequencingCheckFailure(SequencingCheckError)
                           ├─> DisjointCheckFailure(DisjointCheckError<D>)
                           ├─> TransactionApplicationError(TransactionApplicationError)
                           ├─> FeeCalculation(FeeCalculationError)
                           ├─> MalformedContractDeploy(MalformedContractDeploy)
                           └─> ... (53 variants total)

TransactionInvalid<D>    ──┬─> Zswap(zswap::TransactionInvalid)
                           │       └─> MerkleTreeError(InvalidUpdate)
                           ├─> Transcript(TranscriptRejected<D>)
                           │       ├─> Execution(OnchainProgramError<D>)
                           │       │       ├─> Decode(InvalidBuiltinDecode)
                           │       │       └─> MerkleTreeError(InvalidUpdate)
                           │       └─> Decode(InvalidBuiltinDecode)
                           └─> MerkleTreeError(InvalidUpdate)
```

Key points:

- `MalformedTransaction` is checked **before** state application; rejection means the tx never touches ledger state.
- `TransactionInvalid` is the **post-application** failure path, reached via `TransactionInvalid::Transcript(TranscriptRejected) → Execution(OnchainProgramError)` for contract-execution failures.
- `InvalidBuiltinDecode` is a **leaf** type (in `base_crypto::fab`); it does not wrap `merkle_tree::InvalidUpdate`. Both can appear independently.

---

## Error Types

### 1. `MalformedTransaction<D>`

`#[non_exhaustive]` — **53 variants** in current source. Structural validity errors checked **before** any state application. If a transaction is malformed, it is rejected without touching the ledger state.

#### Proof and Cryptographic Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `InvalidNetworkId` | Transaction was built for a different network. | Rebuild targeting the correct network ID. |
| `InvalidProof(VerifyingError)` | A zero-knowledge proof failed verification (`VerifyingError` is `anyhow::Error`). | Re-prove; check that witness and public inputs match. |
| `BindingCommitmentOpeningInvalid` | The binding commitment opening does not match the committed value. | Indicates a tx-construction bug; recheck commitment generation. |
| `InvalidSchnorrProof` | A Schnorr signature proof failed verification. | Key mismatch or corrupted signing data; re-sign. |
| `PedersenCheckFailure` | A Pedersen commitment consistency check failed. | Balance/value-encoding error; recheck transaction values. |

#### Verifier Key Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `VerifierKeyNotSet { address, operation }` | Operation is being deployed without an attached verifier key. | Attach the verifier key in the deploy intent. |
| `VerifierKeyNotPresent { address, operation }` | Referenced verifier key is not present at the contract address. | Deploy the verifier key before calling the operation. |
| `VerifierKeyTooLarge` | A verifier key embedded in the transaction exceeds the size limit. | Use a smaller circuit, or contact Midnight support. |

#### Structural Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `NotNormalized` | Transaction fields are not in canonical order. | Sort/normalize per the ledger spec. |
| `FallibleWithoutCheckpoint` | A fallible transaction segment lacks a required checkpoint. | Add `kernel.checkpoint()` at the start of fallible sections. |
| `TransactionTooLarge` | Serialized transaction exceeds the maximum byte size. | Split into smaller transactions or reduce payload. |
| `TooManyZswapEntries` | More zswap entries than the protocol allows. | Split zswap operations across multiple transactions. |
| `IllegallyDeclaredGuaranteed` | Guaranteed segment declared in a context where only fallible segments are permitted. | Move the segment out of the guaranteed context. |
| `MergingContracts` | Error merging contract intents. | Contracts cannot be merged in this configuration. |
| `CantMergeTypes` | Attempted to merge transaction types that are not mergable. | Ensure tx types are compatible before merging. |
| `BuiltinDecode(InvalidBuiltinDecode)` | FAB (field-aligned binary) decode error during malformed-tx validation. | Internal encoding error; verify data formats. |
| `ContractNotPresent(ContractAddress)` | Transaction references a non-existent contract (Malformed-side; distinct from `TransactionInvalid::ContractNotPresent`). | Verify contract address; deploy first. |

#### Wrapper Variants

| Variant | Description |
|---------|-------------|
| `Zswap(zswap::MalformedOffer)` | Wraps `zswap::MalformedOffer` — see section 5. |
| `EffectsCheckFailure(EffectsCheckError)` | Wraps `EffectsCheckError` — see EffectsCheckError sub-table below. |
| `SequencingCheckFailure(SequencingCheckError)` | Wraps `SequencingCheckError` — see sub-table below. |
| `DisjointCheckFailure(DisjointCheckError<D>)` | Wraps `DisjointCheckError<D>` — see sub-table below. |
| `TransactionApplicationError(TransactionApplicationError)` | Wraps `TransactionApplicationError` — see sub-table below. |
| `FeeCalculation(FeeCalculationError)` | Wraps `FeeCalculationError` — see section 7. |
| `MalformedContractDeploy(MalformedContractDeploy)` | Wraps `MalformedContractDeploy` — see section 7. |

#### Claims Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `ClaimReceiveFailed` | A coin receive claim is invalid. | Check claim data matches the coin being received. |
| `ClaimSpendFailed` | A coin spend claim failed verification. | Verify the spend authorization and nullifier data. |
| `ClaimNullifierFailed` | A nullifier claim is invalid. | Regenerate the nullifier from the correct key/coin data. |
| `ClaimCallFailed` | A contract call claim is invalid. | Rebuild the claim with correct call data. |
| `UnclaimedCoinCom` | A coin commitment has no matching claim. | Ensure every commitment has a valid claim. |
| `UnclaimedNullifier` | A nullifier has no corresponding spend claim. | Ensure every nullifier has a matching spend claim. |
| `Unbalanced` | Inputs/outputs don't balance — value not conserved. | Recheck token amounts. |
| `ClaimOverflow` | Arithmetic overflow while summing claim values. | Reduce individual claim values. |
| `ClaimCoinMismatch` | Claim's coin reference doesn't match the expected coin. | Construct claims against the correct coin data. |

#### Committee Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `KeyNotInCommittee` | Signing key is not a member of the expected committee. | Use a registered committee member's key. |
| `InvalidCommitteeSignature` | A committee signature is malformed or invalid. | Re-collect signatures from valid members. |
| `ThresholdMissed { address, signatures, threshold }` | Required signature threshold not reached. | Gather more committee signatures. |

#### Intent Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `IntentSignatureVerificationFailure` | An intent signature failed verification. | Re-sign with the correct key. |
| `IntentSignatureKeyMismatch` | Signing key doesn't match the intent's declared key. | Sign with the key the intent references. |
| `IntentSegmentIdCollision` | Two intents share the same segment ID. | Assign unique segment IDs. |
| `IntentAtGuaranteedSegmentId` | An intent was placed at a guaranteed segment ID (forbidden). | Use segment_id ≥ 1. |

#### Balance Check Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `BalanceCheckOutOfBounds` | A balance value is outside the valid numeric range. | Verify token amounts are within bounds. |
| `BalanceCheckConversionFailure` | Type conversion failed during balance verification. | Indicates a value-encoding bug; check token-type consistency. |
| `BalanceCheckOverspend` | Tx attempts to spend more than is available. | Reduce spend amounts or add inputs. |

#### Dust Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `InvalidDustRegistrationSignature { registration }` | Dust registration signature is invalid. | Re-sign the dust registration. |
| `InvalidDustSpendProof { declared_time, dust_spend }` | Dust spend proof is invalid. | Regenerate with correct witness data. |
| `OutOfDustValidityWindow { dust_ctime, validity_start, validity_end }` | Dust outside its validity window. | Use fresher dust within the validity window. |
| `MultipleDustRegistrationsForKey { key }` | Same key in multiple dust registrations in one tx. | Use each dust key at most once per tx. |
| `InsufficientDustForRegistrationFee { registration, available_dust }` | Dust amount below the registration fee minimum. | Increase the dust amount. |

#### Version Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `UnsupportedProofVersion` | Proof uses an unsupported version. | Upgrade the SDK or re-prove with a supported version. |
| `GuaranteedTranscriptVersion` | Transcript version invalid for guaranteed segment. | Use the correct transcript version. |
| `FallibleTranscriptVersion` | Transcript version invalid for fallible segment. | Use the correct transcript version. |

#### Sorting and Deduplication Errors

| Variant | Description | Fix |
|---------|-------------|-----|
| `InputsNotSorted` | Inputs not in canonical sort order. | Sort canonically before building. |
| `OutputsNotSorted` | Outputs not in canonical sort order. | Sort canonically before building. |
| `DuplicateInputs` | The same input appears more than once. | Remove duplicates. |
| `InputsSignaturesLengthMismatch` | Number of signatures differs from number of inputs. | Provide one signature per input. |

---

### 2. `TransactionInvalid<D>`

`#[non_exhaustive]` — **19 variants**. State-application failures: a structurally valid transaction is rejected when applied to current ledger state.

| Variant | Description | Fix |
|---------|-------------|-----|
| `EffectsMismatch { declared, actual }` | Actual effects of applying the tx differ from declared. | Declared effects must exactly match what execution produces. |
| `ContractAlreadyDeployed` | Deploy targets an address that already has a contract. | Deploy to a different address. |
| `ContractNotPresent(ContractAddress)` | Tx calls a contract that doesn't exist (Invalid-side). | Verify address; deploy first. |
| `Zswap(zswap::TransactionInvalid)` | Wraps `zswap::TransactionInvalid`. | See section 5. |
| `Transcript(TranscriptRejected<D>)` | Contract transcript execution was rejected. | See `TranscriptRejected` in section 4. |
| `InsufficientClaimable` | Tx attempts to claim more than is available. | Reduce claim amount or wait for more claimable funds. |
| `VerifierKeyNotFound` | Referenced verifier key not registered on-chain. | Register the verifier key before referencing it. |
| `VerifierKeyAlreadyPresent` | Verifier key registration targets an already-registered key. | Skip re-registration. |
| `ReplayCounterMismatch` | Replay protection counter doesn't match expected value. | Fetch current counter from the node. |
| `ReplayProtectionViolation(TransactionApplicationError)` | Wraps `TransactionApplicationError` — TTL expired / too-far / already exists. | See sub-table below. |
| `BalanceCheckOutOfBounds` | Balance value out of range during state application. | Verify amounts after accounting for current state. |
| `InputNotInUtxos` | Input references a UTXO that doesn't exist. | UTXO may already be spent; resync. |
| `DustDoubleSpend` | Dust coin already spent. | Resync dust UTXO state. |
| `DustDeregistrationNotRegistered` | Deregister target isn't currently registered. | Verify registration before deregistering. |
| `GenerationInfoAlreadyPresent` | Generation info for this epoch/key already on-chain. | Generation info is once-per-epoch. |
| `InvariantViolation(InvariantViolation)` | A protocol-level invariant was violated (currently single-variant `NightBalance(u128)` for total-supply violations). | Tx would break a fundamental protocol rule; usually a bug. |
| `RewardTooSmall` | Reward amount below the minimum. | Increase the reward amount. |
| `DivideByZero` | Division by zero during transaction processing. | Indicates a value-computation bug. |
| `MerkleTreeError(InvalidUpdate)` | Merkle tree operation failed. | See `InvalidUpdate` in section 6. |

---

### 3. `OnchainProgramError<D>`

**18 variants** — the Impact VM (onchain execution engine) errors. Surfaced when contract transcript execution fails inside the VM.

| Variant | Description |
|---------|-------------|
| `RanOffStack` | VM stack exhausted; pop/read on empty stack. |
| `RanPastProgramEnd` | Program counter advanced past the bytecode end. |
| `ExpectedCell(StateValue<D>)` | Expected a cell at a stack position; payload is the actual `StateValue<D>`. Display formats by descriptor (null/cell/bounded Merkle tree/map/array). |
| `Decode(InvalidBuiltinDecode)` | Failed to decode a value (wraps `InvalidBuiltinDecode` from `base_crypto::fab`). |
| `ArithmeticOverflow` | Arithmetic operation overflowed. |
| `TooLongForEqual` | Equality comparison on values exceeding max comparable length. |
| `TypeError(String)` | Type mismatch during VM execution; string describes the mismatch. |
| `OutOfGas` | Tx ran out of gas during contract execution. |
| `BoundsExceeded` | Array/buffer access out of bounds. |
| `LogBoundExceeded` | Log size exceeded the maximum. |
| `InvalidArgs(String)` | Invalid argument to a primitive operation. Display: `"invalid argument to primitive operation: {msg}"`. |
| `MissingKey` | A required key was not found in contract state map. |
| `CacheMiss` | Cache lookup returned no result during execution. |
| `AttemptedArrayDelete` | Array element deletion is not supported. |
| `ReadMismatch { expected: AlignedValue, actual: AlignedValue }` | Read returned a value differing from the transcript's declared expected value. Display: `"mismatch between expected (...) and actual (...) read"`. |
| `CellBoundExceeded` | Cell value exceeded maximum size. |
| `StackOverflow` | VM call stack grew too deep. |
| `MerkleTreeError(merkle_tree::InvalidUpdate)` | Merkle tree built-in failed inside the VM. |

---

### 4. `TranscriptRejected<D>`

5 variants. Wraps `OnchainProgramError` and represents failures during onchain contract execution.

| Variant | Description |
|---------|-------------|
| `Execution(OnchainProgramError<D>)` | Contract execution failed; inner error contains the VM-level failure. |
| `Decode(InvalidBuiltinDecode)` | Failed to decode the transcript input before execution could begin. |
| `FinalStackWrongLength` | Final stack didn't have the expected element count. |
| `WeakStateReturned` | Contract returned a weakened/reduced state when a full state was required. |
| `EffectDecodeError` | Failed to decode the effects emitted by execution. |

---

### 5. Zswap Errors

#### `zswap::TransactionInvalid`

State-level zswap failures (4 variants):

| Variant | Description | Fix |
|---------|-------------|-----|
| `NullifierAlreadyPresent(Nullifier)` | Nullifier already spent — double-spend attempt. | Coin is spent; do not retry. |
| `CommitmentAlreadyPresent(Commitment)` | Commitment already exists in the tree. | Duplicate commitment; check for replay or construction error. |
| `UnknownMerkleRoot(MerkleTreeDigest)` | Merkle root referenced in proof not known to current state. | Fetch the current root and rebuild. |
| `MerkleTreeError(InvalidUpdate)` | Merkle tree update failed during zswap state application. | See `InvalidUpdate` in section 6. |

#### `zswap::MalformedOffer`

Structural zswap errors (4 variants):

| Variant | Description | Fix |
|---------|-------------|-----|
| `InvalidProof(VerifyingError)` | A zswap ZK proof failed verification. | Regenerate the proof. |
| `ContractSentCiphertext { address, ciphertext }` | Contract attempted to send ciphertext (not permitted). | Restructure contract to avoid emitting ciphertext. |
| `NonDisjointCoinMerge` | Coin merge combined non-disjoint sets. | Ensure merged sets are disjoint. |
| `NotNormalized` | Offer not in canonical normalized form. | Normalize before inclusion. |

#### `zswap::OfferCreationFailed`

Client-side errors during offer construction (5 variants):

| Variant | Description | Fix |
|---------|-------------|-----|
| `InvalidIndex(InvalidIndex)` | Invalid index used during offer construction. | Verify coin index is within Merkle tree range. |
| `Proving(ProvingError)` | Zero-knowledge proving step failed. | Check witnesses; re-run proving. |
| `NotContractOwned` | Offer references a coin not owned by the expected contract. | Construct offers only for correctly-owned coins. |
| `TreeNotRehashed` | Merkle tree has pending rehash. | Call rehash before constructing the offer. |
| `MerkleTreeError(InvalidUpdate)` | Merkle tree operation failed. | See `InvalidUpdate`. |

---

### 6. Merkle Tree Errors

#### `merkle_tree::InvalidIndex`

Tuple struct (not an enum):

```rust
pub struct InvalidIndex(pub u64);
```

The `u64` is the offending out-of-range index.

#### `merkle_tree::InvalidUpdate`

`#[non_exhaustive]` — **7 variants** representing structural failures when updating the Merkle tree:

| Variant | Description |
|---------|-------------|
| `CollapsedIndex` | Update attempted on a collapsed (pruned) subtree node. |
| `StubUpdate` | Update targeted a stub node that cannot be updated. |
| `EndBeforeStart` | End index of an update range is before the start index. |
| `EndOutOfTree` | End index extends past the tree boundary. |
| `WrongNumberOfSegments` | Update provides a different number of segments than expected. |
| `NotFullyRehashed` | Pending updates have not been rehashed; tree is inconsistent. |
| `BadUpdatePath` | Merkle path provided for the update is incorrect. |

---

### 7. Other Important Types

#### `FeeCalculationError`

Hand-rolled `Display` (not `thiserror`); 2 variants:

| Variant | Description |
|---------|-------------|
| `OutsideTimeToDismiss { time_to_dismiss, allowed_time_to_dismiss, size }` | Tx's time-to-dismiss is outside the size-dependent allowed window. |
| `BlockLimitExceeded` | Tx would exceed the block resource limit. |

#### `MalformedContractDeploy`

`#[non_exhaustive]` — 2 variants:

| Variant | Description |
|---------|-------------|
| `NonZeroBalance(BTreeMap<TokenType, u128>)` | Contract deploy carries non-zero balance entries (forbidden). Payload reports the offending balances. |
| `IncorrectChargedState` | Contract deploy carries an incorrectly computed charged-state map. |

#### `SystemTransactionError`

10 variants for governance/bridge system transactions:

| Variant | Description |
|---------|-------------|
| `IllegalPayout { claimed_amount, supply, bridged_amount, locked }` | Payout exceeds remaining supply or bridge pool. |
| `InsufficientTreasuryFunds { requested, actual, token_type }` | Treasury balance insufficient for the requested amount. |
| `CommitmentAlreadyPresent(Commitment)` | Faerie-gold double-commitment attempt. |
| `ReplayProtectionFailure(TransactionApplicationError)` | System-tx replay protection: TTL expired / too-far / already-exists. See sub-table. |
| `IllegalReserveDistribution { distributed_amount, reserve_supply }` | Reserve distribution exceeds available supply. |
| `GenerationInfoAlreadyPresent(DustGenerationInfo)` | DUST generation info already inserted. |
| `InvalidBasisPoints(u32)` | Bridge fee basis points ≥ 10,000 (max is 9,999). |
| `InvariantViolation(InvariantViolation)` | Protocol-level invariant violated. |
| `TreasuryDisabled` | Attempted to access a disabled treasury. |
| `MerkleTreeError(InvalidUpdate)` | Merkle tree update failed during system-tx processing. |

#### `TransactionApplicationError`

3 variants — used in both `MalformedTransaction::TransactionApplicationError` and `TransactionInvalid::ReplayProtectionViolation` and `SystemTransactionError::ReplayProtectionFailure`:

| Variant | Description |
|---------|-------------|
| `IntentTtlExpired(Timestamp, Timestamp)` | Intent TTL already expired. Payload: (current_time, intent_ttl). |
| `IntentTtlTooFarInFuture(Timestamp, Timestamp)` | Intent TTL set too far ahead. Payload: (current_time, intent_ttl). |
| `IntentAlreadyExists` | Intent identifier already exists in the replay-protection set. |

#### `EffectsCheckError`

7 variants — wrapped by `MalformedTransaction::EffectsCheckFailure` and surfaced as u8 codes 212–218:

| Variant | Description |
|---------|-------------|
| `RealCallsSubsetCheckFailure` | Actual real calls not a subset of declared. |
| `AllCommitmentsSubsetCheckFailure` | Actual commitments not a subset of declared. |
| `RealUnshieldedSpendsSubsetCheckFailure` | Real unshielded spends not a subset of declared. |
| `ClaimedUnshieldedSpendsUniquenessFailure` | Claimed unshielded spends not unique. |
| `ClaimedCallsUniquenessFailure` | Claimed calls not unique. |
| `NullifiersNeqClaimedNullifiers` | Actual nullifiers ≠ claimed nullifiers. |
| `CommitmentsNeqClaimedShieldedReceives` | Actual commitments ≠ claimed shielded receives. |

#### `SequencingCheckError`

6 variants — wrapped by `MalformedTransaction::SequencingCheckFailure` and surfaced as u8 codes 219–224:

| Variant | Description |
|---------|-------------|
| `CallSequencingViolation` | Contract call ordering violates the call graph. |
| `SequencingCorrelationViolation` | Cross-call correlation invariant violated. |
| `GuaranteedInFallibleContextViolation` | Guaranteed call appeared in a fallible context. |
| `FallibleInGuaranteedContextViolation` | Fallible call appeared in a guaranteed context. |
| `CausalityConstraintViolation` | Causality constraint between calls violated. |
| `CallHasEmptyTranscripts` | A contract call has empty transcripts. |

#### `DisjointCheckError<D>`

3 variants — wrapped by `MalformedTransaction::DisjointCheckFailure` and surfaced as u8 codes 225–227:

| Variant | Description |
|---------|-------------|
| `ShieldedInputsDisjointFailure` | Shielded inputs not disjoint across segments. |
| `ShieldedOutputsDisjointFailure` | Shielded outputs overlap across segments. |
| `UnshieldedInputsDisjointFailure` | Unshielded inputs not disjoint across segments. |

#### `InvariantViolation`

Currently a single-variant enum, used by `TransactionInvalid::InvariantViolation` and `SystemTransactionError::InvariantViolation`:

| Variant | Description |
|---------|-------------|
| `NightBalance(u128)` | Total NIGHT supply invariant violated. |

#### `BlockLimitExceeded`

Empty struct error returned from post-block update declaration.

#### `QueryFailed<D>`

`#[non_exhaustive]` — 5 variants. Used by ledger query operations:

| Variant | Description |
|---------|-------------|
| `MissingCall` | Required call not present. |
| `InvalidContract(ContractAddress)` | Contract address not found. |
| `InvalidInput { value, ty }` | Input doesn't match the expected type. |
| `Runtime(TranscriptRejected<D>)` | Wraps a transcript-execution failure. |
| `Zswap(OfferCreationFailed)` | Wraps a zswap offer-creation failure. |

#### `PartitionFailure<D>`

5 variants. Used during transaction partitioning:

| Variant | Description |
|---------|-------------|
| `Transcript(TranscriptRejected<D>)` | Wraps transcript execution failure. |
| `NonForest` | Transaction structure is not a valid forest. |
| `GuaranteedOnlyUnsatisfied` | Guaranteed-only constraint not satisfied. |
| `IllegalSegmentZero` | Segment 0 was used illegally. |
| `Merge(MalformedOffer)` | Merge produced a malformed offer. |

#### `TransactionResult`

Outcome type returned after transaction processing:

| Variant | Description |
|---------|-------------|
| `Success` | All segments executed; all effects applied. |
| `PartialSuccess` | Guaranteed segments succeeded; one or more fallible failed. Guaranteed effects applied, fallible discarded. |
| `Failure` | Transaction rejected entirely (`MalformedTransaction` or guaranteed-segment failure). No state changes. |

#### `TransactionConstructionError`

`#[non_exhaustive]` — 4 variants. Client-side errors while building a transaction:

| Variant | Description |
|---------|-------------|
| `TransactionEmpty` | Built transaction has no segments/intents. |
| `UnfinishedCall { address, operation }` | A call was started but not completed before constructing the tx. |
| `ProofFailed(ProvingError)` | Client-side proof generation failed (`ProvingError = anyhow::Error`). |
| `MissingVerifierKey { address, operation }` | Required verifier key not available locally. |

#### `TransactionProvingError<D>`

5 variants (with `#[allow(clippy::large_enum_variant)]`). Errors during the proving phase:

| Variant | Description |
|---------|-------------|
| `LeftoverEntries { address, entry_point, entries }` | Proving completed with unconsumed transcript entries. |
| `RanOutOfEntries { address, entry_point }` | Transcript ran out of entries before proving completed. |
| `MissingKeyset(KeyLocation)` | Required keyset not available to the prover. |
| `Proving(ProvingError)` | Wraps an opaque `anyhow::Error` from the proving backend. |
| `Tokio(std::io::Error)` | Async runtime I/O error. |

#### `EventReplayError`

`#[non_exhaustive]` — 4 variants. Errors during event log replay (used for syncing wallet state):

| Variant | Description |
|---------|-------------|
| `NonLinearInsertion { expected_next, received, tree_name }` | Events inserted out of order into a tree. |
| `DtimeUpdateForUntracked { updated, tracked_up_to_index }` | Dust-time update for an untracked index. |
| `EventForPastTime { synced, event }` | Event timestamp is older than already-synced state. |
| `MerkleTreeError(InvalidUpdate)` | Merkle tree update failed during replay. |

#### `DustLocalStateError`

`#[non_exhaustive]` — 6 variants. Errors in local dust state management (client-side):

| Variant | Description |
|---------|-------------|
| `GenerationIndexNotFound { generation_index }` | Generation index not in local state. |
| `NonLinearInsertion { expected_next, received, tree_name }` | Out-of-order insertion into a local tree. |
| `WrongGenerationInfo { generation_index }` | Generation info doesn't match the tracked index. |
| `CommitmentIndexNotFound { commitment_index }` | Commitment index not in local state. |
| `BackingNightNotFound { backing_night }` | Backing NIGHT coin not found locally. |
| `MerkleTreeError(InvalidUpdate)` | Merkle tree update failed in local state. |

#### `DustStateError`

`#[non_exhaustive]` — 2 variants. Distinct from `DustLocalStateError`:

| Variant | Description |
|---------|-------------|
| `GenerationInfoAlreadyPresent(DustGenerationInfo)` | Generation info already present in dust state. |
| `MerkleTreeError(InvalidUpdate)` | Merkle tree update failed in dust state. |

> **Note:** A previous version of this reference documented a `DustSpendError` enum with `NotRegistered`/`InvalidProof`/`OutOfWindow`/`AlreadySpent` variants. **No such enum exists in current source.** Dust-spend failures surface via `MalformedTransaction::InvalidDustSpendProof`, `OutOfDustValidityWindow`, `MultipleDustRegistrationsForKey`, `InsufficientDustForRegistrationFee`, or `InvalidDustRegistrationSignature` (see section 1, "Dust Errors").

---

## Cross-Reference: Rust Error to Node u8 Code

When debugging a node u8 error code (see `node-errors.md`), the underlying Rust variant maps as follows. The full mapping lives in `midnight-node/ledger/src/versions/common/types.rs` `impl From<LedgerApiError> for u8`.

- u8 0–11 → `LedgerApiError::Deserialization(DeserializationError::*)`
- u8 50–63 → `LedgerApiError::Serialization(SerializationError::*)`
- u8 100–109, 194–200, 239–244, 248–250 → `LedgerApiError::Transaction(Invalid(InvalidError::*))` — corresponds to `TransactionInvalid<D>` variants in section 2 above (and zswap subcodes)
- u8 110–139, 166–181, 183–185, 189–192, 212–238 → `LedgerApiError::Transaction(Malformed(MalformedError::*))` — corresponds to `MalformedTransaction<D>` variants in section 1, plus the structured `EffectsCheckError`/`SequencingCheckError`/`DisjointCheckError`/`TransactionApplicationError`/`FeeCalculationError`/`MalformedContractDeploy`/`MalformedZswapErrorCode` sub-enums
- u8 150–157, 165 → top-level `LedgerApiError::*` infrastructure variants
- u8 201–204, 206–211, 245–247 → `LedgerApiError::Transaction(SystemTransaction(SystemTransactionError::*))`
- u8 255 → `LedgerApiError::HostApiError`
- Retired: u8 168, 182, 186, 187, 188, 193, 205 (preserved in `RETIRED_U8_ERROR_CODES`)
