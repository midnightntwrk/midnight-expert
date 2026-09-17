# Token Architecture

How tokens, resources, and value transfer work on Midnight -- from the dual NIGHT/DUST model through the Zswap protocol to the four token quadrants.

## Midnight's Dual Token Model

Midnight separates economic incentive (NIGHT) from network resource consumption (DUST). Understanding this distinction is fundamental to building on the platform.

### NIGHT: Native Utility Token

NIGHT is Midnight's native utility token. It exists as UTXOs directly on the ledger and serves multiple roles:

| Role | Description |
|------|-------------|
| Staking/delegation | Validators participate via stake delegation, securing the network |
| DUST generation | Holding NIGHT generates DUST, which pays for transactions |
| Cross-chain bridging | NIGHT bridges to Cardano as "cNIGHT" via the native bridge |
| Value transfer | Standard UTXO-based transfers between users |

NIGHT uses the UTXO model: each token is a discrete, indivisible unit with a specific value and owner. Spending consumes entire UTXOs and creates new ones (payment + change), exactly like physical cash.

The atomic unit of NIGHT is the **Star**, with 1 NIGHT = 10^6 Stars.

### Cross-Chain: cNIGHT on Cardano

NIGHT tokens exist on Cardano as "cNIGHT" (Cardano NIGHT). The native bridge allows transfer between chains. Importantly, cNIGHT held on Cardano can also generate DUST on Midnight -- a registered Cardano wallet address maps to a Midnight DUST address, and all cNIGHT received by that wallet produces DUST on the Midnight side.

### DUST: Shielded Network Resource

DUST is **not a token** -- it is a shielded network resource used exclusively to pay transaction fees. It has unique properties that distinguish it from every other asset on the network:

| Property | Detail |
|----------|--------|
| Non-transferable | Can only be spent on fees, never sent to another user |
| Generated from NIGHT | Value grows over time proportional to backing NIGHT UTXO |
| Decays after NIGHT spent | Once the backing NIGHT UTXO is consumed, DUST decays to zero |
| Capped per NIGHT | Maximum ~5 DUST per 1 NIGHT (initial parameters) |
| Shielded | DUST spends use ZK proofs; fee amounts are private |
| Non-persistent | The protocol reserves the right to modify DUST allocation rules |

The atomic unit of DUST is the **Speck**, with 1 DUST = 10^15 Specks. The higher resolution allows fine-grained fee payments.

### DUST Generation Flow

The lifecycle of DUST follows a predictable pattern:

1. **Hold NIGHT** -- Acquire NIGHT tokens (or cNIGHT on Cardano)
2. **Register UTXOs** -- Call `wallet.registerNightUtxosForDustGeneration()` to link NIGHT UTXOs to a DUST address
3. **DUST generates** -- Value grows linearly toward the cap (~1 week to reach maximum)
4. **Pay for transactions** -- Spend DUST as fees when submitting transactions
5. **NIGHT spent** -- When the backing NIGHT UTXO is consumed, DUST immediately begins decaying to zero

If only a portion of NIGHT is spent, the change UTXO backs a new DUST UTXO that begins generating, while the old DUST UTXO decays. The net effect is a linear decrease in total DUST.

### Testnet Flow

On the Midnight testnet (Preprod):

1. Request **tNIGHT** from the faucet (1000 tNIGHT per request)
2. **Register** tNIGHT UTXOs via your wallet to generate **tDUST**
3. Wait for tDUST to accrue (typically 1-2 minutes for initial generation)
4. Deploy and interact with contracts using tDUST for fees

## The Four Token Quadrants

Midnight tokens exist at the intersection of two axes: **where they live** (ledger vs. contract) and **their privacy** (shielded vs. unshielded). This creates four distinct quadrants:

### Comparison Matrix

| Quadrant | Location | Privacy | Model | Key Characteristics | Example Use Cases |
|----------|----------|---------|-------|--------------------|--------------------|
| Shielded Ledger | Blockchain ledger | Private | UTXO | Native privacy, maximum efficiency | Private payments, confidential transfers |
| Unshielded Ledger | Blockchain ledger | Transparent | UTXO | Full transparency, high performance | NIGHT tokens, public treasuries, exchange listings |
| Shielded Contract | Smart contract | Private | Account | Private balances via ZK, but no post-issuance spend enforcement (archived by OpenZeppelin) | Not recommended — use unshielded contract or shielded ledger tokens |
| Unshielded Contract | Smart contract | Transparent | Account | ERC-20-like, rich logic | DeFi, governance, gaming currencies |

### Shielded Ledger Tokens

Shielded ledger tokens are UTXO-based and processed by the Zswap protocol. The sender, recipient, value, and token type are all hidden from observers. Only the existence of a transaction is visible on-chain, plus whether it involves a specific contract.

These tokens provide the strongest privacy guarantees and the highest throughput, since they are handled by Midnight's optimized UTXO engine without requiring smart contract execution.

### Unshielded Ledger Tokens

Unshielded ledger tokens are also UTXO-based but fully transparent. Transaction details (sender, recipient, value, type) are publicly visible. NIGHT itself is the primary example. Use these when auditability is a requirement or when interacting with external systems that need to verify balances.

### Shielded Contract Tokens

Shielded contract tokens use account-model state inside smart contracts but leverage Midnight's private state for confidentiality. The contract maintains balances and logic privately using Compact's witness and ZK proof mechanisms.

> **Warning**: Shielded contract tokens have a fundamental limitation: once a user receives shielded coins, the contract cannot enforce any rules on how they are spent. The contract cannot freeze, pause, or claw back tokens post-issuance. Additionally, total supply tracking is unreliable because users can burn tokens directly via `shieldedBurnAddress()` without the contract's knowledge. OpenZeppelin has archived their ShieldedERC20 module and recommends using unshielded tokens until the Midnight network offers solutions. Their current confidential-token successor is the ElGamal-based `ConfidentialFungibleToken` (bundled as `examples/ConfidentialFungibleToken.compact`), which keeps balances private via encryption rather than the Zswap shielded-coin model. See the Known Limitations table in `token-patterns.md` for the full list.

### Unshielded Contract Tokens

Unshielded contract tokens work like ERC-20 tokens on Ethereum. A Compact smart contract maintains a `Map<Bytes<32>, Uint<64>>` (or similar) mapping addresses to balances. Transfers update balances in place. These are ideal for DeFi protocols, governance systems, and gaming mechanics where complex logic is needed.

### Choosing the Right Quadrant

| Need | Best Choice | Why |
|------|-------------|-----|
| High-volume private payments | Shielded Ledger | UTXO parallelism + native ZK privacy |
| Public treasury / exchange listing | Unshielded Ledger | Full auditability, high performance |
| Complex DeFi with public state | Unshielded Contract | Rich state management, familiar patterns |
| Private programmable assets | Shielded Contract | Account-model flexibility + privacy |
| Cross-chain bridging | Unshielded Ledger | Atomic operations, clear ownership |
| Compliance-friendly assets | Hybrid approach | Transparent base with optional privacy |

You are not locked into one quadrant. A single application can use UTXO-based ledger tokens for value transfer and account-based contract tokens for governance or DeFi logic.

## Zswap Protocol

Zswap is Midnight's shielded token protocol, derived from Zerocash and extended with native multi-asset support and atomic swaps. It powers all shielded token operations on the ledger.

### Core Concept: Commitment/Nullifier Paradigm

Zswap tracks coins via two sets rather than maintaining a list of unspent outputs:

- **Commitment set** -- A hash of each coin's info + owner public key, added when a coin is created
- **Nullifier set** -- A hash of each coin's info + owner secret key, added when a coin is spent

The set of unspent coins is conceptually "commitments minus nullifiers," but this difference **cannot be directly computed** -- an observer cannot link a nullifier to its corresponding commitment. This unlinkability is the foundation of Zswap's privacy.

### CoinInfo Structure

Every Zswap coin is described by:

```
CoinInfo {
    value: u128,         // Amount of the token
    type_: RawTokenType, // Token color (256-bit hash or zero for native)
    nonce: [u8; 32],     // Unique randomness preventing duplicate commitments
}

CoinCommitment = Hash(CoinInfo, ZswapCoinPublicKey)
CoinNullifier  = Hash(CoinInfo, ZswapCoinSecretKey)
```

The commitment uses the **public** key (anyone can verify it exists) while the nullifier uses the **secret** key (only the owner can spend it). Both are one-way hashes, making them unlinkable.

### Commitment Storage

Commitments are stored in three representations:

| Representation | Purpose |
|----------------|---------|
| Plain set | Prevents creation of duplicate coins |
| Merkle tree | Proves inclusion in the coin set (for spending) |
| Root history | Validates old Merkle proofs (time-limited) |

```
ZswapState {
    commitment_tree: MerkleTree<CoinCommitment>,
    commitment_set: Set<CoinCommitment>,
    nullifiers: Set<CoinNullifier>,
    commitment_tree_history: TimeFilterMap<MerkleTreeRoot>,
}
```

### Offers

An offer is the top-level Zswap transaction structure with four components:

| Component | Purpose |
|-----------|---------|
| Inputs (spends) | Consume existing coins by adding nullifiers |
| Outputs | Create new coins by adding commitments |
| Transients | Coins created and spent within the same transaction |
| Balance vector (deltas) | Net value per token type; must be non-negative after adjustments |

Transient coins allow contracts to receive and immediately re-spend coins within a single transaction, without waiting for block confirmation.

### Output Structure

Each output places a commitment in the global Merkle tree:

- The coin commitment itself
- A multi-base **Pedersen commitment** to the type/value vector (homomorphic, enables balance checking)
- An optional **contract address** (if sent to a contract)
- An optional **ciphertext** (encrypted coin info for the recipient)
- A **zero-knowledge proof** that all of the above are consistent

### Input Structure

Each input spends a coin by producing its nullifier:

- The nullifier (unlinkable to the original commitment)
- A multi-base **Pedersen commitment** to the type/value vector
- An optional **contract address** (if owned by a contract)
- A **Merkle tree root** proving the commitment exists in the tree
- A **zero-knowledge proof** that all of the above are consistent

Inputs are valid only if the proof verifies **and** the Merkle root is in the set of recent past roots.

### Balance Validation

Offers must be **balanced**: the sum of input values minus output values must match the declared deltas, and all deltas must be non-negative (after accounting for mints and fee deductions). The Pedersen commitments are homomorphic, so validators can verify balance without knowing individual values.

## Token Colors

Every token on Midnight has a **color** (also called token type) -- a 256-bit value that uniquely identifies it.

### How Colors Are Derived

```
tokenType = hash(domainSeparator, contractAddress)
```

The color is a collision-resistant hash of two inputs:

| Input | Description |
|-------|-------------|
| `domainSeparator` | A 32-byte value chosen by the contract developer |
| `contractAddress` | The deploying contract's on-chain address (`kernel.self()`) |

Because the contract address is unique per deployment and the hash is collision-resistant, no two contracts can accidentally (or intentionally) mint the same token type.

### Native Token

The native token (NIGHT) uses the pre-defined **zero value** as its token type. It is not derived from any contract.

### Domain Separator Conventions

Domain separators are arbitrary `Bytes<32>` values. By convention, use a human-readable prefix padded to 32 bytes:

```compact
// Derive a token color for this contract
const color = tokenType(pad(32, "mytoken:"), kernel.self());
```

Multiple token types can be issued from a single contract by using different domain separators:

```compact
const goldColor   = tokenType(pad(32, "game:gold:"), kernel.self());
const silverColor = tokenType(pad(32, "game:silver:"), kernel.self());
```

### Compact Standard Library Functions

```compact
// Compute token color from domain separator + contract address
tokenType(domainSep: Bytes<32>, contract: ContractAddress): Bytes<32>

// Get the native token color (zero value)
nativeToken(): Bytes<32>
```

## Account Model vs UTXO Model

Midnight uses **both** models, each for the layer where it excels.

### UTXO for Ledger Tokens

Ledger tokens (both shielded and unshielded) use the UTXO model:

| Advantage | Why It Matters |
|-----------|---------------|
| Parallel processing | Independent UTXOs can be spent in concurrent transactions |
| Individual shielding | Each coin can be independently private or public |
| Atomic operations | All inputs consumed and outputs created together, or nothing happens |
| No persistent accounts | No ever-growing account state; spent coins are nullified |
| Deterministic outcomes | Transaction validity is order-independent |

### Account Model for Contract State

Smart contract state uses the account model via Compact's ledger declarations:

```compact
export ledger balances: Map<Bytes<32>, Uint<64>>;
export ledger totalSupply: Counter;
export ledger owner: Bytes<32>;
```

This provides `Map`, `Set`, `Counter`, `List`, and other ADTs for rich programmable logic -- exactly what token contracts need for balances, allowances, and governance.

### Why Both?

| Layer | Model | Optimized For |
|-------|-------|---------------|
| Value transfer (ledger) | UTXO | Privacy, parallelism, atomic swaps |
| Programmable logic (contracts) | Account | Complex state, familiar patterns, rich data structures |

The UTXO model is optimal for transferring value privately because each coin is independent and can be individually shielded. The account model is optimal for programmable state because Maps and rich data structures are natural for tracking balances, permissions, and application logic.

### Ledger State Structure

At the protocol level, Midnight's ledger state combines both models:

| Component | Purpose |
|-----------|---------|
| Commitment Merkle tree | All coin commitments (for Zswap inclusion proofs) |
| Nullifier set | All spent coin nullifiers (prevents double-spending) |
| Past Merkle roots | Recent tree roots (validates older proofs within TTL) |
| Contract state map | Per-contract key-value state (account model) |
| DUST subsystem | Separate commitment tree, nullifier set, and generation state |

## Shielded vs Unshielded: Deep Comparison

The choice between shielded and unshielded is a **design-time decision** that affects the entire lifecycle of a token. These are not interchangeable at runtime.

### Property Comparison

| Property | Shielded | Unshielded |
|----------|----------|------------|
| Sender visible | No | Yes |
| Recipient visible | No | Yes |
| Value visible | No | Yes |
| Token type visible | No | Yes |
| Transaction existence visible | Yes | Yes |
| Contract involvement visible | Yes (if sent to/from contract) | Yes |
| Mechanism | ZK proofs + commitments/nullifiers | Standard UTXO with public data |
| Compliance | Viewing keys (selective disclosure) | Inherently auditable |
| Performance | Requires proof generation | Faster (no ZK overhead) |
| Storage cost | Commitments + nullifiers + proofs | Transaction data directly |

### When to Use Shielded

- Private payments where sender, recipient, and amount must be hidden
- Confidential asset transfers (e.g., salary payments, private auctions)
- Applications where metadata leakage is a regulatory or business concern
- Any scenario where "rational privacy" provides user protection

### When to Use Unshielded

- Public treasuries and DAO funds requiring transparency
- Exchange listings where balances must be externally verifiable
- Regulatory contexts requiring full auditability without viewing key complexity
- High-throughput scenarios where proof generation overhead is unacceptable

### Compliance: Viewing Keys

Shielded tokens support **viewing keys** -- special keys that a user can create to grant read-only access to their shielded transactions. This enables:

- Regulatory reporting without exposing data to the public chain
- Auditor access to specific transactions or time ranges
- Selective disclosure: reveal only what is necessary, nothing more

Unshielded tokens are inherently auditable since all data is on-chain. No viewing keys are needed, but there is also no option for privacy.

### Design-Time Choice

Choose shielded or unshielded **before** building your token. The underlying mechanisms (ZK proofs vs. public data, commitments vs. plain UTXOs) are fundamentally different. Mixing is possible at the application level -- for example, using shielded ledger tokens for value transfer while maintaining unshielded contract state for governance -- but individual token operations commit to one mode.
