# Full Applications

Complete multi-file DApps demonstrating how Compact modules compose into production-style contracts. Each application has its own subdirectory under `examples/applications/`.

---

## Applications

### CryptoKitties (`applications/kitties/`)

| Attribute | Detail |
|---|---|
| Path | `applications/kitties/` |
| Description | CryptoKitties-inspired NFT game on Midnight. Cats have gender, genetic traits, and can breed. NFT ownership and transfer mechanics delegate to the `Nft` module; kitty-specific logic (breeding, gender assignment, genetic hashing) is implemented on top. Caller identity is derived in-circuit from a witness secret — `ownPublicKey()` is never used for authorization. |
| Files | `kitties.compact`, `Nft.compact`, `witnesses.ts` |
| Witnesses | `witnesses.ts` — implements `getUserSecret(): UserSecretKey` (the per-prover 32-byte secret) and `createRandomNumber(): Bytes<32>` (DNA/breeding seed) |
| Complexity | Intermediate |

**`kitties.compact`** imports the local `./Nft` module and adds:
- `Gender` enum (`Male`, `Female`)
- Identity structs: `UserSecretKey`, `UserPublicKey`, `AdminPublicKey` (all wrapping `Bytes<32>`), re-exported from the `Nft` module
- Kitty-specific ledger state. The `Kitty.owner` and `Offer.buyer` fields are the holder's **derived** `UserPublicKey`, and the owner/buyer map keys are derived keys (not `ZswapCoinPublicKey`)
- `createKitty`, `breedKitty`, `setPrice`, `createBuyOffer`, `approveOffer`, `transferKitty`/`transferKittyFrom` — each computes `const caller = disclose(deriveUserPublicKey(getUserSecret()))` and gates ownership against `ownerOf(kittyId) == caller`
- Safe approval wrappers `approveKitty` / `setApprovalForAllKitties` that compute the caller from the witness and forward it to the module
- Selectively exports the read-only NFT views (`balanceOf`, `ownerOf`, `getApproved`, `isApprovedForAll`, `tokenExists`) **without** re-exporting the module's identity-parameterized mutating circuits (`approve`/`setApprovalForAll`/`transferFrom`/`mint`/`burn`), which would let a caller pass an arbitrary `caller` identity

**Witness-derived identity (no `ownPublicKey()`):** all caller identity derives inside the circuit from a single 32-byte `userSecretKey` private-state field via the domain-separated pure circuits `deriveUserPublicKey(sk)` (`"kitties:user:pk:v1"`) and `deriveAdminPublicKey(sk)` (`"kitties:admin:pk:v1"`). `ownPublicKey()` is deliberately never used: it returns a prover-claimed value with no cryptographic binding to the transaction signer, so any ownership assertion that depends on it (e.g. `assert(ownPublicKey() == ownerOf(kittyId))`) is bypassable — an attacker just reads the owner's public key off-chain and supplies it. With derived identity, an attacker cannot reproduce the owner's derivation, so `setPrice`/`approveOffer` on a kitty they do not own fail the in-circuit assertion.

**`Nft.compact`** is a local copy of the `modules/token/Nft` module (not imported from the modules directory). Its identity-sensitive circuits (`approve`, `setApprovalForAll`, `transferFrom`) take the caller's **derived** `UserPublicKey` as an explicit first parameter; the top-level contract computes it from the witness and never lets a caller supply it directly.

---

### Consent Registry (`applications/consent-registry/`)

| Attribute | Detail |
|---|---|
| Path | `applications/consent-registry/` |
| Description | Purpose-specific consent records for data-protection law (LGPD, GDPR). Data subjects are keyed by a hash salted per subject and domain-separated, so no identifier reaches the ledger; the controller role is derived in-circuit from a witness secret. Revocation keeps the record so the withdrawal itself stays auditable. |
| Files | `consent-registry.compact`, `witnesses.ts` |
| Witnesses | `witnesses.ts` — implements `controllerSecret(): Bytes<32>` |
| Complexity | Beginner |

**`consent-registry.compact`** defines:
- Ledgers: `controller` (sealed, derived key), `consentStatus`, `consentPurposes`, `consentPolicyVersion` (all `Map<Bytes<32>, Uint<8>>`), `totalGrants` / `totalRevocations` counters
- Pure circuits `deriveControllerKey(sk)` (`"consent:controller:v1"`) and `subjectKey(identifierHash, salt)` (`"consent:subject:v1"`), usable off-chain to derive the same keys
- `grantConsent`, `updatePurposes`, `revokeConsent`: controller-only; purposes are a 5-bit mask (values above 31 rejected), policy version cannot go back, `grantConsent` refuses an already active record (use `updatePurposes`), a revoked record can only be reactivated through `grantConsent`, and revoking twice is rejected
- Guarded reads `getStatus`, `getPurposes`, `getPolicyVersion` (`member` before `lookup`)

**Privacy model:** the consent history of a `subject_id` is public and permanent; each subject's own salt is what links it to a person, so deleting that salt unlinks only that subject, which is as close to erasure as a public registry gets. Calling a `get*` circuit in a transaction discloses the subject being queried; read the ledger through the indexer when the lookup itself is sensitive.

---

### ZK Loan (`applications/zkloan/`)

| Attribute | Detail |
|---|---|
| Path | `applications/zkloan/` |
| Description | Privacy-preserving lending protocol. Applicants request loans without revealing their credit score, income, or tenure on-chain. Off-chain credit bureaus (providers) attest scores via Schnorr signatures. The contract verifies attestations in-circuit and makes loan decisions based on policy thresholds. |
| Files | `zkloan-credit-scorer.compact`, `schnorr.compact`, `witnesses.ts` |
| Witnesses | `witnesses.ts` — implements `getAttestedScoringWitness(): [Applicant, SchnorrSignature, providerId]`, `getSchnorrReduction(hash): [Field, Uint<248>]`, and `getUserSecret(): UserSecretKey` |
| Complexity | Advanced |

**`zkloan-credit-scorer.compact`** defines:
- `LoanStatus` enum (`Approved`, `Rejected`, `Proposed`, `NotAccepted`)
- `LoanApplication` struct (`authorizedAmount: Uint<16>`, `status: LoanStatus`)
- Identity structs: `UserSecretKey`, `UserPublicKey`, `AdminPublicKey` (all wrapping `Bytes<32>`)
- Ledgers: `blacklist: Set<UserPublicKey>`, `loans: Map<Bytes<32>, Map<Uint<16>, LoanApplication>>`, `providers: Map<Uint<16>, JubjubPoint>`, `contractAdmin: AdminPublicKey`
- Circuits: `requestLoan(amountRequested, secretPin)`, provider management, blacklist management, `rotateAdmin(newAdmin)`

**Witness-derived identity (no `ownPublicKey()`):** all caller identity — both the per-user loan key and the admin role — is derived inside the circuit from a single 32-byte `userSecretKey` private-state field via the domain-separated pure circuits `deriveUserPublicKey(sk, pin)` and `deriveAdminPublicKey(sk)`. `ownPublicKey()` is deliberately never used: it returns a prover-claimed value that is not cryptographically bound to the transaction signer, so any authorization assertion that depends on it (e.g. `assert(ownPublicKey() == admin)` or `blacklist.member(ownPublicKey())`) is bypassable. The admin role is frozen at construction by pinning `deriveAdminPublicKey(getUserSecret())` into `contractAdmin`.

**`schnorr.compact`** is a local copy of the `modules/crypto/schnorr` module.

---

### Real-World Assets (`applications/midnight-rwa/`)

| Attribute | Detail |
|---|---|
| Path | `applications/midnight-rwa/` |
| Description | Privacy-gated real-world asset contract. Users must prove passport identity, issuer authorization (via Merkle tree), user authorization (via second Merkle tree), legal age, and nationality — all in zero-knowledge. On success, the user receives shielded tBTC and tHF tokens as reward. **Authorization uses the secure witness-derived identity pattern**: the user's authorization key is a `UserPublicKey` derived in-circuit from a single private witness secret (`getUserSecret`), never `ownPublicKey()` (which is retained only as the safe recipient of token sends). |
| Files | `midnight-rwa.compact`, `Crypto.compact`, `PassportIdentity.compact`, `witnesses.ts` |
| Witnesses | `witnesses.ts` — implements `localSecretKey()`, `getUserSecret()`, `findIssuerPath(pk)`, `findAuthorizationPath(pk: UserPublicKey)`, `reduceChallenge(r)` |
| Complexity | Advanced |

**`midnight-rwa.compact`** defines:
- Identity structs `UserSecretKey`/`UserPublicKey` and `deriveUserPublicKey()`, a domain-separated (`"rwa:user:pk:v1"`) `persistentHash` derivation used as the authorization identity
- Ledgers: `counter`, `nonce`, `quizHash`, `issuerAuthorizations: HistoricMerkleTree<32, Bytes<32>>`, `authorizations: HistoricMerkleTree<32, UserPublicKey>`, `tbtcCoinColor`, `identityProviderPublicKey`, `EIGHTEEN_YEARS_IN_SECONDS`, `ALLOWED_COUNTRY_CODE1/2`, `tHF`, `tBTC`
- `QuizResult` struct
- Multi-step identity proof circuit using `PassportData` + `SignedCredential`, Merkle path verification, age check, and nationality check
- Shielded token rewards via `mintShieldedToken`

**`Crypto.compact`** and **`PassportIdentity.compact`** are local copies of their respective `modules/` counterparts. (Their filenames are capitalized to match the `module Crypto` / `module PassportIdentity` declarations they contain — Compact resolves `import Crypto;` to `Crypto.compact` case-sensitively, so a lowercase filename only resolves on case-insensitive filesystems.)

---

### tBTC Token (`applications/tbtc/`)

| Attribute | Detail |
|---|---|
| Path | `applications/tbtc/` |
| Description | Minimal standalone shielded tBTC minting contract. Each call to `mint()` increments a counter, evolves the nonce with `evolveNonce(counter, nonce)`, and mints 1000 units of the `"brick-towers:coin:tbtc"` shielded coin to the caller. No access control. |
| Files | `tbtc.compact` |
| Witnesses | None |
| Complexity | Beginner |

**`tbtc.compact`** demonstrates the simplest use of `mintShieldedToken` with nonce evolution. This is the standalone version; the same contract is embedded inside `midnight-rwa` for the reward mechanism.

---

## Architectural Patterns

These applications illustrate several important composition patterns:

1. **Module import + selective re-export** — `kitties.compact` imports `Nft` and re-exports only the read-only views, hiding the identity-parameterized mutating circuits (`approve`/`setApprovalForAll`/`transferFrom`/`mint`/`burn`) from external callers. Exposing those would let a caller pass an arbitrary `caller` identity and bypass ownership checks; instead the top-level contract derives the caller from the witness secret and forwards it.

2. **Local module copies** — Applications like `kitties` and `zkloan` keep local copies of modules (e.g., `Nft.compact`, `schnorr.compact`) rather than importing from `modules/`. This makes them self-contained.

3. **Witness-driven privacy** — `midnight-rwa` uses several witnesses to provide off-chain data (issuer secret key, the user authorization secret, two Merkle paths, challenge reduction), all verified in-circuit.

4. **Merkle tree authorization with witness-derived identity** — `midnight-rwa` uses `HistoricMerkleTree` for two independent authorization registries, each with a separate Merkle proof witness. The user registry (`authorizations`) keys on a `UserPublicKey` **derived in-circuit from a private witness secret**, never `ownPublicKey()`. The gate binds the membership proof to the caller (`assert(authPath.leaf == caller)`) so a prover cannot pass another onboarded member's valid path for an identity they do not control.

5. **Multi-module DApp** — `midnight-rwa` combines three `.compact` files (`midnight-rwa.compact`, `Crypto.compact`, `PassportIdentity.compact`) in a single deployment.

---

## Cross-references

- For the standalone module versions used in these applications, see [modules.md](modules.md).
- For the privacy and ZK techniques used in `zkloan` and `midnight-rwa`, see [privacy-and-cryptography.md](privacy-and-cryptography.md).
- For the standalone shielded token contracts, see [tokens.md](tokens.md).
