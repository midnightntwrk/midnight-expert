# Commitment Patterns

Patterns for hiding values on-chain and revealing them later with proof.

## Commit-Reveal

**Purpose:** Hide a value on-chain, then prove it later without tampering.
**Complexity:** Intermediate
**Key Primitives:** `persistentCommit`, `persistentHash`, witness storage

### When to Use

- Sealed-bid mechanisms where bids must be hidden until reveal
- Games where players must commit moves simultaneously
- Any protocol where premature disclosure creates unfair advantages

### Implementation

Single-participant commit-reveal:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger commitment: Bytes<32>;
export ledger revealedValue: Field;
export ledger isRevealed: Boolean;

witness local_secret_key(): Bytes<32>;
witness storeSecretValue(v: Field): [];
witness getSecretValue(): Field;

// Compute commitment using persistentHash with salt
circuit computeCommitment(value: Field, salt: Bytes<32>): Bytes<32> {
  const valueBytes = value as Bytes<32>;
  return persistentHash<Vector<2, Bytes<32>>>([valueBytes, salt]);
}

// Phase 1: Commit — store hash on-chain, value off-chain
export circuit commit(value: Field): [] {
  const salt = local_secret_key();
  storeSecretValue(value);
  commitment = disclose(computeCommitment(value, salt));
  isRevealed = false;
}

// Phase 2: Reveal — prove stored value matches commitment
export circuit reveal(): Field {
  const salt = local_secret_key();
  const value = getSecretValue();
  const expected = computeCommitment(value, salt);
  assert(disclose(expected == commitment), "Value does not match commitment");
  assert(disclose(!isRevealed), "Already revealed");
  revealedValue = disclose(value);
  isRevealed = true;
  return disclose(value);
}
```

### Multi-Participant Variant

When multiple users commit and reveal:

```compact
export enum Phase { commit, reveal, finalized }
export ledger phase: Phase;
export ledger commitments: Map<Bytes<32>, Bytes<32>>;
export ledger reveals: Map<Bytes<32>, Field>;

witness local_secret_key(): Bytes<32>;
witness get_randomness(): Bytes<32>;
witness storeOpening(id: Bytes<32>, salt: Bytes<32>, value: Field): [];
witness getOpening(): [Bytes<32>, Field];

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

// Each participant submits a commitment
export circuit submitCommitment(value: Field): [] {
  assert(phase == Phase.commit, "Not in commit phase");
  const sk = local_secret_key();
  const pk = get_public_key(sk);
  const salt = get_randomness();
  const valueBytes = value as Bytes<32>;
  const c = persistentHash<Vector<2, Bytes<32>>>([valueBytes, salt]);
  storeOpening(pk, salt, value);
  commitments.insert(disclose(pk), disclose(c));
}

// Each participant reveals their value
export circuit revealValue(): Field {
  assert(phase == Phase.reveal, "Not in reveal phase");
  const sk = local_secret_key();
  const pk = get_public_key(sk);
  assert(disclose(commitments.member(pk)), "No commitment found");
  const opening = getOpening();
  const salt = opening[0];
  const value = opening[1];
  const valueBytes = value as Bytes<32>;
  const expected = persistentHash<Vector<2, Bytes<32>>>([valueBytes, salt]);
  assert(disclose(expected == commitments.lookup(pk)), "Commitment mismatch");
  reveals.insert(disclose(pk), disclose(value));
  return disclose(value);
}
```

### Privacy Considerations

- During the commit phase, only the hash is on-chain. The actual value is hidden.
- During the reveal phase, the actual value becomes public via `disclose()`.
- The commitment hash itself may leak information if the value space is small
  (e.g., only 10 possible values). In that case, use `persistentCommit` with
  random blinding instead of `persistentHash`.
- Each participant's public key is visible in the `commitments` Map.

### Test Considerations

- Verify commit stores the correct hash
- Verify reveal with wrong value fails
- Verify reveal with wrong salt fails
- Verify double-reveal fails
- Verify reveal before commit fails
- For multi-participant: verify one user cannot reveal another's commitment
- Test with identical values from different users (should have different commitments due to different salts)

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `persistentHash(value)` without salt | `persistentHash([value, salt])` | Without salt, identical values produce identical hashes (leaks information) |
| Reusing salt across commitments | Fresh salt per commitment via witness | Same salt + same value = identical commitment = broken hiding |
| Revealing without verifying commitment exists | Check `commitments.member(pk)` first | Prevent reveals for non-existent commitments |

---

## Sealed-Bid Auction

**Purpose:** Private bidding where bids are hidden until simultaneous reveal.
**Complexity:** Advanced
**Key Primitives:** Commit-reveal + escrow + time-lock + state machine

### When to Use

- Auctions where bid privacy matters
- Procurement where competitive bids should not be visible
- Any scenario requiring fair, simultaneous bid revelation

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export enum AuctionPhase { bidding, revealing, finalized }
export ledger auctionPhase: AuctionPhase;
export sealed ledger bidDeadline: Uint<64>;
export sealed ledger revealDeadline: Uint<64>;
export sealed ledger organizer: Bytes<32>;

// Bid commitments: bidder_pk -> commitment_hash
export ledger bidCommitments: Map<Bytes<32>, Bytes<32>>;
// Revealed bids: bidder_pk -> bid_amount
export ledger revealedBids: Map<Bytes<32>, Uint<64>>;
// Track highest bid
export ledger highestBid: Uint<64>;
export ledger highestBidder: Bytes<32>;

witness local_secret_key(): Bytes<32>;
witness get_randomness(): Bytes<32>;
witness storeBidOpening(salt: Bytes<32>, amount: Uint<64>): [];
witness getBidOpening(): [Bytes<32>, Uint<64>];

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:auction:pk:"), sk
  ]);
}

constructor(bidEnd: Uint<64>, revealEnd: Uint<64>) {
  auctionPhase = AuctionPhase.bidding;
  bidDeadline = disclose(bidEnd);
  revealDeadline = disclose(revealEnd);
  organizer = disclose(get_public_key(local_secret_key()));
  highestBid = 0;
}

// Submit a sealed bid (commitment only)
export circuit submitBid(bidAmount: Uint<64>): [] {
  assert(auctionPhase == AuctionPhase.bidding, "Bidding closed");
  assert(blockTimeLt(bidDeadline), "Bid deadline passed");
  const sk = local_secret_key();
  const pk = disclose(get_public_key(sk));
  assert(!bidCommitments.member(pk), "Already submitted a bid");
  const salt = get_randomness();
  // Do NOT disclose bidAmount here — the hash hides it
  const amountBytes = (bidAmount as Field) as Bytes<32>;
  const commitment = persistentHash<Vector<2, Bytes<32>>>([amountBytes, salt]);
  storeBidOpening(salt, bidAmount);
  bidCommitments.insert(pk, disclose(commitment));
}

// Advance to reveal phase (anyone can call after deadline)
export circuit advanceToReveal(): [] {
  assert(auctionPhase == AuctionPhase.bidding, "Not in bidding phase");
  assert(blockTimeGte(bidDeadline), "Bidding still open");
  auctionPhase = AuctionPhase.revealing;
}

// Reveal a previously committed bid
export circuit revealBid(): [] {
  assert(auctionPhase == AuctionPhase.revealing, "Not in reveal phase");
  assert(blockTimeLt(revealDeadline), "Reveal deadline passed");
  const sk = local_secret_key();
  const pk = disclose(get_public_key(sk));
  assert(bidCommitments.member(pk), "No bid commitment found");
  assert(!revealedBids.member(pk), "Already revealed");
  const opening = getBidOpening();
  const salt = opening[0];
  const amount = opening[1];
  const amountBytes = (disclose(amount) as Field) as Bytes<32>;
  const expected = persistentHash<Vector<2, Bytes<32>>>([amountBytes, salt]);
  assert(disclose(expected == bidCommitments.lookup(pk)), "Bid commitment mismatch");
  revealedBids.insert(pk, disclose(amount));
  // Track highest bid
  if (disclose(amount) > highestBid) {
    highestBid = disclose(amount);
    highestBidder = disclose(pk);
  }
}

// Finalize auction after reveal deadline
export circuit finalizeAuction(): [] {
  assert(auctionPhase == AuctionPhase.revealing, "Not in reveal phase");
  assert(blockTimeGte(revealDeadline), "Reveal phase not over");
  auctionPhase = AuctionPhase.finalized;
  // Winner is highestBidder with highestBid
}
```

### Privacy Considerations

- During bidding, only commitment hashes are visible. Bid amounts are hidden
  in the hash. Note: `bidAmount` is a circuit parameter, so it arrives in the
  transaction call. In a production system, derive the bid from a witness
  instead to ensure it never appears in the public transaction data.
- The commitment hash itself hides the bid value (due to the random salt).
- After reveal, all bid amounts and bidder identities become public.
- The number of bidders is visible from the `bidCommitments` Map size.
- Bidders who do not reveal forfeit (their bids remain hidden but they cannot win).
- For anonymous bidding, combine with Merkle Auth pattern — bidders prove
  membership in an authorized set without revealing their identity.

### Test Considerations

- Verify bids cannot be submitted after deadline
- Verify reveals match original commitments
- Verify reveals with wrong salt fail
- Verify reveals with wrong amount fail
- Verify highest bidder tracking is correct
- Test with equal bid amounts
- Verify phase transitions respect deadlines
- Test: what happens if no one reveals?
- Test: what happens if only one person reveals?

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Allowing bid updates during bidding phase | Check `!bidCommitments.member(pk)` | Bid updates leak information about strategy |
| No deadline on reveal phase | Enforce `revealDeadline` | Without deadline, auction never finalizes |
| Using `persistentCommit` for bids | Use `persistentHash` with salt for bids | Both work, but `persistentHash` with explicit salt gives more control over the opening proof |
