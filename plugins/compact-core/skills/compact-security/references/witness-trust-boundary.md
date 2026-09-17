# The Witness Trust Boundary

Witness functions run **on the prover's machine, outside the zero-knowledge circuit**, and are **not cryptographically verified**. A witness returns whatever the prover wants. Everything a contract trusts about a witness value must be *re-established inside the circuit* — by hashing it, comparing it against pinned on-chain state, or verifying a signature over it.

## `ownPublicKey()` is a witness, not the caller

`ownPublicKey()` returns the prover-supplied **Zswap coin public key** (`coinPublicKey`, passed into the circuit context by `@midnight-ntwrk/compact-runtime`). It is **not** bound to the wallet that signs the transaction. A caller can supply any 32-byte value. Therefore:

> **Any authorization or identity check built on `ownPublicKey()` is bypassable.** An attacker reads the public target value (e.g. the stored admin/owner) off-chain and supplies it as their own `coinPublicKey`.

### The ONLY safe use of `ownPublicKey()`

Routing shielded tokens **to** the caller, where lying only misroutes the prover's *own* coins:

```compact
// SAFE — recipient of a mint/send; a dishonest prover only hurts themselves
left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey())
```

### Insecure: `ownPublicKey()` for authorization (DO NOT COPY)

Adapted from `modules/access/ZOwnablePK.compact` (`assertOnlyOwner`), which carries a SECURITY WARNING banner:

```compact
// ❌ INSECURE — caller identity built from ownPublicKey() and used for an owner gate.
//    A prover can supply the owner's coinPublicKey and pass this check.
const callerAsEither =
  Either<ZswapCoinPublicKey, ContractAddress> { is_left: true,
                                                left: ownPublicKey(),
                                                right: ContractAddress { bytes: pad(32, "") } };
const id = _computeOwnerId(callerAsEither, nonce);
assert(_ownerCommitment == _computeOwnerCommitment(id, _counter),
       "caller is not the owner");   // bypassable
```

## The secure witness-secret pattern

Identity is derived **inside the circuit** from a single witness-held secret via domain-separated `persistentHash`, and the authority is **pinned at deploy**. Verbatim from the proven reference `applications/zkloan/zkloan-credit-scorer.compact` (compiles with compiler `0.31.1`; pragma `language_version 0.23`):

```compact
export struct UserSecretKey { bytes: Bytes<32>; }
export struct AdminPublicKey { bytes: Bytes<32>; }

// One secret per browser/CLI instance, held in private state.
witness getUserSecret(): UserSecretKey;

// Domain-separated derivation. Deterministic => reproducible across transactions.
export pure circuit deriveAdminPublicKey(sk: UserSecretKey): AdminPublicKey {
  return AdminPublicKey {
    bytes: persistentHash<Vector<2, Bytes<32>>>([
      pad(32, "zkloan:admin:pk:v1"),
      sk.bytes
    ])
  };
}

// Pin the deployer's derived admin identity at construction.
constructor() {
  contractAdmin = disclose(deriveAdminPublicKey(getUserSecret()));
}
export ledger contractAdmin: AdminPublicKey;

// Authorization: re-derive from the caller's secret and compare to pinned state.
export circuit registerProvider(providerId: Uint<16>, providerPk: JubjubPoint): [] {
  assert(contractAdmin == deriveAdminPublicKey(getUserSecret()),
         "Only admin can register providers");
  providers.insert(disclose(providerId), disclose(providerPk));
}
```

Why this is sound: only the holder of the secret whose `deriveAdminPublicKey(secret)` was pinned into `contractAdmin` can reproduce the equality inside the proof. A forged secret produces a different hash and fails the assertion. The secret never leaves the prover.

The TypeScript witness simply returns the stored secret (from `applications/zkloan/witnesses.ts`):

```typescript
getUserSecret: ({ privateState }: WitnessContext<Ledger, ZKLoanCreditScorerPrivateState>):
  [ZKLoanCreditScorerPrivateState, { bytes: Uint8Array }] => {
    if (!privateState.userSecretKey || privateState.userSecretKey.length !== 32) {
      throw new Error("getUserSecret: userSecretKey is missing or wrong length");
    }
    return [privateState, { bytes: privateState.userSecretKey }];
  },
```

### Per-user vs admin identity

Add a binding parameter (e.g. a PIN) for per-user identity so users get distinct, rotatable keys; keep admin un-PIN'd so the role is stable:

```compact
export pure circuit deriveUserPublicKey(sk: UserSecretKey, pin: Uint<16>): UserPublicKey {
  const pinBytes = persistentHash<Uint<16>>(pin);
  return UserPublicKey {
    bytes: persistentHash<Vector<3, Bytes<32>>>([
      pad(32, "zkloan:user:pk:v1"), pinBytes, sk.bytes
    ])
  };
}
```

## The module pattern (witness lives in the top-level contract)

Reusable modules must not embed the witness or export identity-parameterized circuits directly — otherwise a caller could pass a forged identity. Instead:

- The `witness getUserSecret()` lives in the **top-level contract**.
- **Module** circuits take the already-derived caller identity as a parameter (e.g. `circuit onlyAdmin(caller: AdminPublicKey)`), and never call the witness or `ownPublicKey()` themselves.
- Only **top-level wrappers** that compute `deriveUserPublicKey(getUserSecret(), …)` / `deriveAdminPublicKey(getUserSecret())` are `export`ed. The identity-parameterized module circuits are **not** exported.

This keeps the trust boundary (witness → derived identity) inside code the deployer controls.

## Detection checklist (what a reviewer greps for)

- `ownPublicKey()` appearing **anywhere other than** a `left<ZswapCoinPublicKey, ContractAddress>(...)` send/mint recipient → likely a Critical auth bypass. Confirm via a Verification Request.
- A `witness` value flowing into an `assert(...)` (or a state-gating `if`) **without** first being hashed/compared against pinned ledger state.
- An identity-parameterized module circuit (`caller: …PublicKey`) that is `export`ed (lets callers forge identity).
- Authority stored from a caller-supplied value at runtime instead of pinned at `constructor`/initialize time.
