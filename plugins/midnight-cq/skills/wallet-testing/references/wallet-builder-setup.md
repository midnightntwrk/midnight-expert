# WalletBuilder Test Setup Patterns

How to wire WalletBuilder, construct initial state, provide test doubles,
and manage branded type fixtures in Vitest tests.

## Constructing Branded Types

The wallet SDK uses branded types for compile-time safety. Always use the
SDK's constructors — never cast raw values.

```typescript
import { ProtocolVersion, NetworkId } from '@midnightntwrk/wallet-sdk-abstractions';

// Protocol version (branded bigint)
const v8 = ProtocolVersion(8n);

// Network ID
const networkId: NetworkId = 'undeployed'; // string literal for test networks
```

For `WalletSeed`, use the HD wallet utilities:

```typescript
import { generateMnemonicWords, mnemonicToSeed } from '@midnightntwrk/wallet-sdk-hd';

const mnemonic = generateMnemonicWords();
const seed = mnemonicToSeed(mnemonic);
```

## WalletBuilder Composition

Set up a wallet with a test variant:

```typescript
import { WalletBuilder } from '@midnightntwrk/wallet-sdk-runtime';
import { ProtocolVersion } from '@midnightntwrk/wallet-sdk-abstractions';

const TestWallet = WalletBuilder
  .init()
  .withVariant(ProtocolVersion(8n), myVariantBuilder)
  .build();
```

## Test Lifecycle

Create a fresh wallet per test, clean up after:

```typescript
let wallet: InstanceType<typeof TestWallet>;

beforeEach(async () => {
  wallet = await TestWallet.startFirst(TestWallet, initialState);
});

afterEach(async () => {
  await wallet.close();
});
```

Never share wallet instances across tests — state bleeds cause
order-dependent failures.

## Test Doubles for Capabilities

Capabilities are pure functions returning Either. Provide a complete
implementation:

```typescript
import { Either } from 'effect';

const testBalancer = {
  balance: (state, tx) => Either.right([
    { inputs: [mockInput], outputs: [mockOutput] },
    updatedState,
  ]),
};
```

Every method in the interface must be implemented. A partial implementation
passes TypeScript but crashes at runtime when the missing method is called.

## Test Doubles for Services

Services are async (Effect-based). Provide a complete implementation:

```typescript
import { Effect } from 'effect';

const testSubmissionService = {
  submitTransaction: (tx) => Effect.succeed({
    _tag: 'Submitted',
    tx,
    txHash: 'mock-hash',
  }),
};

const testProvingService = {
  proveTransaction: (tx) => Effect.succeed(mockProvenTx),
};

const testSyncService = {
  updates: (state) => Stream.make(mockUpdate1, mockUpdate2),
};
```

## Initial State Construction

Each wallet type needs different initial state:

```typescript
// Shielded wallet — needs ZswapLocalState
const shieldedInitialState = {
  state: initialZswapLocalState,
  publicKeys: { coinPublicKey, encryptionPublicKey },
  protocolVersion: ProtocolVersion(8n),
  progress: SyncProgress.empty(),
  networkId: 'undeployed',
  coinHashes: new Map(),
};

// Unshielded wallet — needs UnshieldedState
const unshieldedInitialState = {
  state: { availableUtxos: HashMap.empty(), pendingUtxos: HashMap.empty() },
  publicKey: { publicKey: verifyingKey, addressHex: '0x...' },
  protocolVersion: ProtocolVersion(8n),
  progress: { appliedId: 0n, highestTransactionId: 0n },
  networkId: 'undeployed',
};

// Dust wallet — needs DustLocalState
const dustInitialState = {
  state: initialDustLocalState,
  publicKey: { publicKey: dustPublicKey },
  protocolVersion: ProtocolVersion(8n),
  progress: SyncProgress.empty(),
  networkId: 'undeployed',
  pendingDust: [],
};
```

Consult the wallet SDK source for the exact shape of each state type. These
examples show the general structure — field names and types come from the SDK.
