# Token Contracts

Complete, deployable token contracts that compose the reusable modules from `modules/`. Each file is a top-level contract (not a module) — it has a `constructor`, exports circuits directly, and can be deployed as-is.

All use `pragma language_version 0.23`.

---

## Contracts

| Name | Path | Description | Witnesses | Complexity |
|---|---|---|---|---|
| AccessControlledToken | `tokens/AccessControlledToken.compact` | Fungible token with role-based minting/burning, using the **secure witness-derived identity pattern**. The constructor grants `DEFAULT_ADMIN_ROLE` to the deployer's DERIVED user key (from `getUserSecret()`, never `ownPublicKey()`); `mint`/`burn` are gated on `MINTER_ROLE`/`BURNER_ROLE` checked against the caller's derived identity. Exports safe wrappers (which compute the caller from the witness) + read-only views. Composes `AccessControl` + `FungibleToken` (+ `Identity`). | `witnesses/access-controlled-token-witnesses.ts` (`getUserSecret`) | Intermediate |
| FungibleTokenMintablePausableOwnable | `tokens/FungibleTokenMintablePausableOwnable.compact` | Fungible token with owner-controlled minting and pausing, using the **secure witness-derived identity pattern**. The owner is pinned at deploy to the deployer's DERIVED admin key (from `getUserSecret()`, never `ownPublicKey()`); owner-only `mint`/`pause`/`unpause` check the caller's derived identity against the stored owner. Exports safe wrappers + read-only views. Composes `Ownable` + `Pausable` + `FungibleToken` (+ `Identity`). | `witnesses/fungible-token-mpo-witnesses.ts` (`getUserSecret`) | Intermediate |
| SimpleNonFungibleToken | `tokens/SimpleNonFungibleToken.compact` | Basic NFT with URI storage, approvals, and transfers, using the **secure witness-derived identity pattern**. Holds the `getUserSecret()` witness, pins the admin at deploy, and mints the genesis token to the deployer's derived key. Exports safe wrappers (which derive the caller) + view wrappers; `mint`/`burn`/`setTokenURI` are admin-gated. Composes `NonFungibleToken` (+ `Identity`). | `witnesses/simple-nft-witnesses.ts` (`getUserSecret`) | Beginner |
| MultiTokenTwoTypes | `tokens/MultiTokenTwoTypes.compact` | Multi-token contract (one fungible token ID `123` + one NFT ID `987`) minted at construction, using the **secure witness-derived identity pattern**. Holds the `getUserSecret()` witness, pins `contractAdmin` at deploy, and exports safe wrappers (which derive the caller) + views. Composes `MultiToken` (+ `Identity`). | `witnesses/multitoken-witnesses.ts` (`getUserSecret`) | Intermediate |
| nft.compact | `tokens/nft.compact` | Top-level NFT contract wrapping the `Nft` module, using the **secure witness-derived identity pattern**. Every entry point derives the caller's identity inside the circuit from a private `getUserSecret()` witness via domain-separated `persistentHash` (`deriveUserPublicKey` / `deriveAdminPublicKey`) — `ownPublicKey()` is never used for authorization. Exports safe wrappers that compute the caller from the witness (`transfer`, `transferFromAuthorized`, `approve`, `setApprovalForAll`, admin-gated `mintAdmin`/`burnAdmin`) plus read-only views; the module's identity-parameterized circuits are deliberately **not** re-exported. Admin is pinned at deploy (`contractAdmin = deriveAdminPublicKey(getUserSecret())`). | `witnesses/nft-witnesses.ts` (`getUserSecret`) | Intermediate |
| nft-zk.compact | `tokens/nft-zk.compact` | Top-level privacy-preserving NFT wrapping the `NftZk` module, using the **secure witness-derived identity pattern**. Same selective-export pattern as `nft.compact`: every entry point derives the caller's identity inside the circuit from a private `getUserSecret()` witness via domain-separated `persistentHash` (`deriveUserPublicKey`/`deriveAdminPublicKey`) — `ownPublicKey()` is never used for authorization. Exports safe wrappers that compute the caller from the witness (`balanceOf`, `transfer`, `transferFromAuthorized`, `approve`, `setApprovalForAll`, admin-gated `mintAdmin`/`burnAdmin`) plus read-only views and the pure `generateHashKey`; the module's identity-parameterized circuits are deliberately **not** re-exported. Admin is pinned at deploy. **Privacy preserved**: on-chain ownership is stored as a `Field` hash — the derived `UserPublicKey` is combined with `getLocalSecret()` (self) or `getSharedSecret()` (peer) via `generateHashKey`, so raw keys are never stored. | `witnesses/nft-zk-witnesses.ts` (`getUserSecret`, `getLocalSecret`, `getSharedSecret`) | Advanced |
| ShieldedERC20 | `tokens/ShieldedERC20.compact` | Shielded token module (archived / not for production). Uses Midnight's native `mintShieldedToken` / `sendImmediateShielded` infrastructure. Circuits: `initialize`, `name`, `symbol`, `decimals`, `totalSupply`, `tokenType`, `mint`, `burn`. **Warning**: current network limitations mean total supply accounting can be broken by manual burns; no custom spend logic is enforceable. Marked `DO NOT USE IN PRODUCTION`. | None | Advanced |
| ShieldedFungibleToken | `tokens/ShieldedFungibleToken.compact` | Complete shielded fungible token contract wrapping `ShieldedERC20`. Constructor accepts `nonce_`, `name_`, `symbol_`, `domain_`; sets `decimals = 18`. Exports `name`, `symbol`, `decimals`, `totalSupply`, `tokenType`, `mint(recipient, amount)`, `burn(coin, amount)`. Inherits all ShieldedERC20 limitations. | None | Advanced |
| tbtc.compact | `tokens/tbtc.compact` | Minimal shielded tBTC token. Constructor sets initial `nonce`. `mint()` circuit increments counter, evolves nonce with `evolveNonce`, and calls `mintShieldedToken` with the `"brick-towers:coin:tbtc"` coin color, minting `1000` units per call to the caller. No access control on minting. | None | Intermediate |

---

## Witness Files

| Path | Used by |
|---|---|
| `tokens/witnesses/nft-witnesses.ts` | `tokens/nft.compact` |
| `tokens/witnesses/nft-zk-witnesses.ts` | `tokens/nft-zk.compact` |

---

## Module Dependencies

| Contract | Imported modules |
|---|---|
| `AccessControlledToken` | `modules/access/AccessControl`, `modules/token/FungibleToken` |
| `FungibleTokenMintablePausableOwnable` | `modules/access/Ownable`, `modules/security/Pausable`, `modules/token/FungibleToken` |
| `SimpleNonFungibleToken` | `modules/token/NonFungibleToken` |
| `MultiTokenTwoTypes` | `modules/token/MultiToken` |
| `nft.compact` | `modules/token/Nft` |
| `nft-zk.compact` | `modules/token/NftZk` |
| `ShieldedFungibleToken` | `tokens/ShieldedERC20` (local) |
| `ShieldedERC20` | `CompactStandardLibrary` (shielded coin primitives), `modules/utils/ShieldedUtils` |
| `tbtc.compact` | `CompactStandardLibrary` (shielded coin primitives) |

## Cross-references

- For the standalone module implementations used above, see [modules.md](modules.md).
- For the `tbtc` shielded token used inside a full DApp, see [applications.md](applications.md) (midnight-rwa and tbtc application directories).
- For privacy patterns in `ShieldedERC20`, `ShieldedFungibleToken`, and `nft-zk`, see [privacy-and-cryptography.md](privacy-and-cryptography.md).
