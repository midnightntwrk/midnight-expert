# Governance Patterns

Patterns for multi-party decision-making and authorization.

## Multi-Party Authorization (Multi-Sig)

**Purpose:** Require M-of-N approvals before executing an action.
**Complexity:** Advanced
**Key Primitives:** `Map<Bytes<32>, Boolean>`, `Counter`, threshold checking

### When to Use

- Treasury withdrawals requiring multiple signers
- Contract upgrades needing board approval
- Any critical action that should not depend on a single person

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger signers: Set<Bytes<32>>;
export ledger approvals: Map<Bytes<32>, Boolean>;
export ledger approvalCount: Counter;
export sealed ledger threshold: Uint<64>;
export ledger proposalActive: Boolean;
export ledger proposalData: Bytes<32>;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:multisig:pk:"), sk
  ]);
}

constructor(requiredApprovals: Uint<64>) {
  // Deployer is the first signer
  const pk = get_public_key(local_secret_key());
  signers.insert(disclose(pk));
  threshold = disclose(requiredApprovals);
  proposalActive = false;
}

circuit requireSigner(): Bytes<32> {
  const sk = local_secret_key();
  const pk = disclose(get_public_key(sk));
  assert(signers.member(pk), "Not an authorized signer");
  return pk;
}

// Any signer can add another signer (in a real system, this would
// itself require multi-sig approval)
export circuit addSigner(newSigner: Bytes<32>): [] {
  requireSigner();
  signers.insert(disclose(newSigner));
}

// Create a new proposal
export circuit propose(data: Bytes<32>): [] {
  requireSigner();
  assert(!proposalActive, "Proposal already active");
  proposalData = disclose(data);
  approvals.resetToDefault();
  approvalCount.resetToDefault();
  proposalActive = true;
}

// Approve the current proposal
export circuit approve(): [] {
  const pk = requireSigner();
  assert(proposalActive, "No active proposal");
  assert(!approvals.member(pk), "Already approved");
  approvals.insert(pk, true);
  approvalCount.increment(1);
}

// Execute the proposal if enough approvals
export circuit execute(): [] {
  requireSigner();
  assert(proposalActive, "No active proposal");
  assert(!approvalCount.lessThan(threshold), "Not enough approvals");
  proposalActive = false;
  // ... execute the approved action using proposalData
}
```

### Privacy Considerations

- All signer identities (public key hashes) are public in the `signers` Set.
- All approvals are public — who approved and when is visible on-chain.
- The proposal data is public. For private proposals, store a commitment instead
  and reveal during execution.
- The threshold is `sealed` and visible at deployment.

### Test Considerations

- Verify proposal creation works
- Verify each signer can approve once
- Verify double-approval fails
- Verify execution fails below threshold
- Verify execution succeeds at exactly threshold
- Verify non-signer cannot approve
- Test with threshold = 1 (single-sig equivalent)
- Test with threshold = total signers (unanimity)
- Verify new proposal resets approvals

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Not resetting approvals on new proposal | `approvals.resetToDefault()` in `propose()` | Old approvals carry over to new proposal |
| Using `approvalCount.lessThan(threshold)` alone | `!approvalCount.lessThan(threshold)` means count >= threshold | `lessThan` returns true if count < threshold, so negate it |

---

## Voting / Governance

**Purpose:** Democratic decision-making with optional privacy.
**Complexity:** Advanced
**Key Primitives:** Commit-reveal + nullifiers + MerkleTree + state machine

### When to Use

- DAO governance votes
- Community proposals with anonymous or transparent voting
- Any decision requiring collective input with privacy guarantees

### Implementation

This pattern combines state machine, commit-reveal, and nullifiers for a complete
anonymous voting system:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export enum VotePhase { setup, commit, reveal, finalized }
export ledger phase: VotePhase;
export sealed ledger organizer: Bytes<32>;
export ledger topic: Bytes<32>;

// Voter registry and vote tracking
export ledger eligibleVoters: HistoricMerkleTree<10, Bytes<32>>;
export ledger committedVotes: HistoricMerkleTree<10, Bytes<32>>;
export ledger commitNullifiers: Set<Bytes<32>>;
export ledger revealNullifiers: Set<Bytes<32>>;
export ledger yesVotes: Counter;
export ledger noVotes: Counter;

witness local_secret_key(): Bytes<32>;
witness local_vote_cast(): Maybe<Boolean>;
witness local_record_vote(vote: Boolean): [];
witness local_advance_state(): [];
witness get_voter_path(pk: Bytes<32>): Maybe<MerkleTreePath<10, Bytes<32>>>;
witness get_vote_path(cm: Bytes<32>): Maybe<MerkleTreePath<10, Bytes<32>>>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:vote:pk:"), sk
  ]);
}

circuit commitment_nullifier(sk: Bytes<32>): Bytes<32> {
  return disclose(persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:vote:cm-nul:"), sk
  ]));
}

circuit reveal_nullifier(sk: Bytes<32>): Bytes<32> {
  return disclose(persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:vote:rv-nul:"), sk
  ]));
}

circuit commit_with_sk(ballot: Bytes<32>, sk: Bytes<32>): Bytes<32> {
  return disclose(persistentHash<Vector<2, Bytes<32>>>([ballot, sk]));
}

constructor() {
  phase = VotePhase.setup;
  organizer = disclose(get_public_key(local_secret_key()));
}

circuit requireOrganizer(): [] {
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == organizer), "Not organizer");
}

// Setup: add eligible voters
export circuit addVoter(voterPk: Bytes<32>): [] {
  requireOrganizer();
  assert(phase == VotePhase.setup, "Setup phase closed");
  eligibleVoters.insert(disclose(voterPk));
}

// Setup: set topic and advance to commit phase
export circuit startVoting(voteTopic: Bytes<32>): [] {
  requireOrganizer();
  assert(phase == VotePhase.setup, "Not in setup phase");
  topic = disclose(voteTopic);
  phase = VotePhase.commit;
}

// Commit: voter commits to a vote anonymously
export circuit voteCommit(ballot: Boolean): [] {
  assert(phase == VotePhase.commit, "Not in commit phase");
  const sk = local_secret_key();
  const pk = get_public_key(sk);
  const comNul = commitment_nullifier(sk);
  assert(!commitNullifiers.member(comNul), "Already committed");

  // Prove voter eligibility via Merkle proof
  const path = get_voter_path(pk);
  assert(disclose(path.is_some) &&
    eligibleVoters.checkRoot(
      disclose(merkleTreePathRoot<10, Bytes<32>>(path.value))) &&
    pk == path.value.leaf,
    "Not an eligible voter");

  // Commit the vote
  local_record_vote(ballot);
  const cm = commit_with_sk(
    ballot ? pad(32, "yes") : pad(32, "no"), sk);
  committedVotes.insert(cm);
  commitNullifiers.insert(comNul);
  local_advance_state();
}

// Organizer advances to reveal phase
export circuit advanceToReveal(): [] {
  requireOrganizer();
  assert(phase == VotePhase.commit, "Not in commit phase");
  phase = VotePhase.reveal;
}

// Reveal: voter reveals their committed vote
export circuit voteReveal(): [] {
  assert(phase == VotePhase.reveal, "Not in reveal phase");
  const sk = local_secret_key();
  const revNul = reveal_nullifier(sk);
  assert(!revealNullifiers.member(revNul), "Already revealed");

  const vote = local_vote_cast();
  assert(disclose(vote.is_some), "No vote recorded");

  // Verify the revealed vote matches the commitment
  const cm = commit_with_sk(
    vote.value ? pad(32, "yes") : pad(32, "no"), sk);
  const path = get_vote_path(cm);
  assert(disclose(path.is_some) &&
    committedVotes.checkRoot(
      disclose(merkleTreePathRoot<10, Bytes<32>>(path.value))) &&
    cm == path.value.leaf,
    "Vote commitment not found");

  // Tally the vote
  if (disclose(vote.value)) {
    yesVotes.increment(1);
  } else {
    noVotes.increment(1);
  }
  revealNullifiers.insert(revNul);
  local_advance_state();
}

// Finalize the vote
export circuit finalizeVote(): [] {
  requireOrganizer();
  assert(phase == VotePhase.reveal, "Not in reveal phase");
  phase = VotePhase.finalized;
}
```

### Privacy Considerations

- **Voter anonymity:** During commit, the voter proves membership in the eligible
  voter tree via a Merkle proof without revealing which voter they are. The
  observer sees a valid proof and a new nullifier but cannot link them to a
  specific voter.
- **Vote privacy during commit:** The vote is hidden behind a hash commitment.
- **Vote privacy during reveal:** The actual vote (yes/no) becomes public.
  However, it cannot be linked to a specific voter because the commitment and
  reveal nullifiers are derived with different domain separators.
- **Tally privacy:** The running tally (yesVotes, noVotes) is public on-chain.
  Each reveal increments a counter, so the vote direction is visible at reveal time.

### Test Considerations

- Verify only eligible voters can commit
- Verify the same voter cannot commit twice (nullifier check)
- Verify the same voter cannot reveal twice
- Verify reveal with wrong vote fails (commitment mismatch)
- Verify non-eligible voter is rejected
- Verify phase transitions are enforced
- Verify final tally matches individual reveals
- Test with a single voter
- Test with the maximum number of voters (2^10 = 1024 for depth 10)

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Same domain separator for commit and reveal nullifiers | `"myapp:vote:cm-nul:"` vs `"myapp:vote:rv-nul:"` | Same domain enables linking commit to reveal |
| Using `Set` for voter eligibility | Use `MerkleTree` + ZK path proof | Set reveals which element is being checked; MerkleTree preserves anonymity |
| Not storing vote off-chain | Use `local_record_vote()` witness to store | Vote must be retrievable during reveal phase |
