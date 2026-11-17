import {
  Ledger,
  MerkleTreePath,
  UserPublicKey,
  UserSecretKey,
} from "./managed/midnight-rwa/contract/index.js";
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { toHex } from "./test/utils.js";

// SECURE PATTERN — witness-derived identity.
//
// Every browser/CLI instance carries a single 32-byte `secretKey` in private
// state. The caller's AUTHORIZATION identity is derived from that secret INSIDE
// the ZK circuit via `deriveUserPublicKey` (a domain-separated persistentHash),
// so it is cryptographically bound to the prover and cannot be forged.
//
// `ownPublicKey()` is never used for authorization — it returns a value the
// prover claims, with no binding to the transaction signer. It is retained in
// the contract ONLY as the recipient of shielded sends (the documented safe
// use: worst case the caller misroutes their own coins).
export type RwaPrivateState = {
  readonly secretKey: Uint8Array;
};

export const witnesses = {
  findIssuerPath(
    context: WitnessContext<Ledger, RwaPrivateState>,
    pk_0: Uint8Array,
  ): [RwaPrivateState, MerkleTreePath<Uint8Array>] {
    const path = context.ledger.issuerAuthorizations.findPathForLeaf(pk_0);
    if (!path) {
      throw new Error(`Issuer not found in the ledger for pk=` + toHex(pk_0));
    }
    return [context.privateState, path!!];
  },

  // Locate the Merkle proof for the caller's DERIVED authorization identity.
  // The leaf is a `UserPublicKey` (derived in-circuit from `getUserSecret`),
  // not a prover-supplied coin key.
  findAuthorizationPath(
    context: WitnessContext<Ledger, RwaPrivateState>,
    pk_0: UserPublicKey,
  ): [RwaPrivateState, MerkleTreePath<UserPublicKey>] {
    const path = context.ledger.authorizations.findPathForLeaf(pk_0);
    if (!path) {
      throw new Error(
        `Authorization not found in the ledger for pk=` + toHex(pk_0.bytes),
      );
    }
    return [context.privateState, path!!];
  },

  // The single private secret from which the caller's authorization identity
  // is derived inside the circuit. This is the security boundary: whoever holds
  // this secret controls the corresponding `UserPublicKey` in `authorizations`.
  getUserSecret(
    context: WitnessContext<Ledger, RwaPrivateState>,
  ): [RwaPrivateState, UserSecretKey] {
    if (
      !context.privateState.secretKey ||
      context.privateState.secretKey.length !== 32
    ) {
      throw new Error("getUserSecret: secretKey is missing or not 32 bytes");
    }
    return [context.privateState, { bytes: context.privateState.secretKey }];
  },

  localSecretKey(
    context: WitnessContext<Ledger, RwaPrivateState>,
  ): [RwaPrivateState, Uint8Array] {
    return [context.privateState, context.privateState.secretKey];
  },
};
