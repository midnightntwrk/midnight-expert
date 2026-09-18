# Key Derivation

How the Midnight Wallet SDK derives cryptographic keys from seeds and mnemonics using BIP-32 hierarchical deterministic (HD) derivation.

**Package:** `@midnightntwrk/wallet-sdk-hd`

---

## Seed Generation

There are two ways to produce a seed for HD key derivation.

### Random Seed (No Mnemonic Backup)

```typescript
import { generateRandomSeed } from '@midnightntwrk/wallet-sdk-hd';

// Returns Uint8Array of ceil(strength/8) bytes (default: 32 bytes for strength=256)
const seed: Uint8Array = generateRandomSeed();        // 256-bit default
const seed128: Uint8Array = generateRandomSeed(128);   // 128-bit
```

**Signature:** `generateRandomSeed(strength?: number): Uint8Array`

Uses `crypto.getRandomValues` internally. This seed cannot be recovered from a mnemonic phrase -- if lost, all derived keys are lost.

### Mnemonic-Based Seed (Recoverable)

```typescript
import {
  generateMnemonicWords,
  validateMnemonic,
  joinMnemonicWords,
  mnemonicToWords,
} from '@midnightntwrk/wallet-sdk-hd';
import { mnemonicToSeedSync } from '@scure/bip39';

// Step 1: Generate 24 mnemonic words (strength=256 default)
const words: string[] = generateMnemonicWords();       // 24 words
const words12: string[] = generateMnemonicWords(128);  // 12 words

// Step 2: Validate a mnemonic string
const isValid: boolean = validateMnemonic('abandon abandon ... zoo');

// Step 3: Convert between formats
const phrase: string = joinMnemonicWords(words);        // words -> space-separated string
const split: string[] = mnemonicToWords(phrase);        // space-separated string -> words

// Step 4: Derive seed from mnemonic (uses @scure/bip39 directly)
const seed: Uint8Array = mnemonicToSeedSync(phrase);
```

### Function Signatures

| Function | Signature | Source |
|---|---|---|
| `generateMnemonicWords` | `(strength?: number) => string[]` | Wraps `bip39.generateMnemonic(english, strength)`, then splits on spaces. Default strength: 256 (24 words) |
| `validateMnemonic` | `(mnemonic: string) => boolean` | Wraps `bip39.validateMnemonic(mnemonic, english)`. Input is a space-separated string |
| `joinMnemonicWords` | `(mnemonic: string[]) => string` | Joins array with spaces (`mnemonic.join(' ')`) |
| `mnemonicToWords` | `(mnemonic: string) => string[]` | Splits on spaces (`mnemonic.split(' ')`) |
| `generateRandomSeed` | `(strength?: number) => Uint8Array` | Uses `crypto.getRandomValues`. Default strength: 256 |

> **Note on genesis seeds:** For local devnet development, genesis wallets use known seeds. See [wallet-construction.md](wallet-construction.md) for how seeds feed into `WalletFacade.init()`.

---

## Derivation Flow

The full derivation pipeline follows a builder pattern: seed -> wallet -> account -> roles -> keys.

```typescript
import { HDWallet, Roles } from '@midnightntwrk/wallet-sdk-hd';
import { mnemonicToSeedSync } from '@scure/bip39';

// 1. Create seed from mnemonic
const seed = mnemonicToSeedSync('your twenty four word mnemonic phrase ...');

// 2. Create HD wallet from seed (returns discriminated union)
const walletResult = HDWallet.fromSeed(seed);
if (walletResult.type === 'seedError') {
  throw new Error(`Invalid seed: ${walletResult.error}`);
}
const hdWallet = walletResult.hdWallet;

// 3. Select account (0-based, hardened in derivation path)
const account = hdWallet.selectAccount(0);

// 4a. Derive a single role at a single index
const nightExternalKey = account.selectRole(Roles.NightExternal);
const keyResult = nightExternalKey.deriveKeyAt(0);
if (keyResult.type === 'keyDerived') {
  console.log('Key bytes:', keyResult.key); // Uint8Array
}

// 4b. Derive multiple roles at once (recommended for wallet construction)
const roles = account.selectRoles([
  Roles.Zswap,
  Roles.NightExternal,
  Roles.Dust,
] as const);

const keysResult = roles.deriveKeysAt(0);
if (keysResult.type === 'keysDerived') {
  const zswap: Uint8Array = keysResult.keys[Roles.Zswap];           // → ShieldedWallet
  const nightExternal: Uint8Array = keysResult.keys[Roles.NightExternal]; // → UnshieldedWallet
  const dust: Uint8Array = keysResult.keys[Roles.Dust];             // → DustWallet
}

// 5. Clean up -- wipe private key material from memory
hdWallet.clear();
```

### Step-by-Step Explanation

1. **`HDWallet.fromSeed(seed)`** -- Creates the root HD key from a seed using `HDKey.fromMasterSeed` from `@scure/bip32`. Returns a discriminated union (see Result Types below). If the seed is malformed, returns `seedError` instead of throwing.

2. **`selectAccount(account)`** -- Returns an `AccountKey` that binds the account index. This sets the `{account}'` segment of the derivation path `m/44'/2400'/{account}'/{role}/{index}`.

3. **`selectRole(role)` / `selectRoles(roles)`** -- Returns a `RoleKey` (single) or `CompositeRoleKey<T>` (multiple). The roles use the `Roles` constant values (0-4).

4. **`deriveKeyAt(index)` / `deriveKeysAt(index)`** -- Performs the actual BIP-32 derivation at the given index. Returns discriminated unions with the derived key bytes or an out-of-bounds error.

5. **`clear()`** -- Calls `rootKey.wipePrivateData()` on the underlying `HDKey`. Call this as soon as all needed keys are derived.

---

## Result Types

All derivation operations return discriminated unions. Always check the `type` field before accessing data.

### HDWallet.fromSeed

```typescript
type HDWalletResult =
  | { readonly type: 'seedOk'; readonly hdWallet: HDWallet }
  | { readonly type: 'seedError'; readonly error: unknown };
```

| Variant | When | Access |
|---|---|---|
| `seedOk` | Valid seed produced a root key | `result.hdWallet` |
| `seedError` | `HDKey.fromMasterSeed` threw | `result.error` |

### RoleKey.deriveKeyAt (singular)

```typescript
type DerivationResult =
  | { readonly type: 'keyDerived'; readonly key: Uint8Array }
  | { readonly type: 'keyOutOfBounds' };
```

| Variant | When | Access |
|---|---|---|
| `keyDerived` | Derivation succeeded, private key exists | `result.key` (Uint8Array) |
| `keyOutOfBounds` | Derived key has no private key component | No data |

### CompositeRoleKey.deriveKeysAt (plural)

```typescript
type CompositeDerivationResult<T extends readonly Role[]> =
  | { readonly type: 'keysDerived'; readonly keys: Record<T[number], Uint8Array> }
  | { readonly type: 'keyOutOfBounds'; readonly roles: readonly Role[] };
```

| Variant | When | Access |
|---|---|---|
| `keysDerived` | All roles derived successfully | `result.keys[Roles.NightExternal]` etc. (Record keyed by role value) |
| `keyOutOfBounds` | One or more roles failed | `result.roles` (array of failed Role values) |

> **Important:** `deriveKeysAt` fails entirely if any role fails. The `roles` array on the error variant tells you which roles were out of bounds.

---

## Security Notes

### Memory Hygiene

- Call `hdWallet.clear()` as soon as all keys are derived. This calls `wipePrivateData()` on the underlying `@scure/bip32` `HDKey`, zeroing out the private key material.
- Do not hold references to the `HDWallet` instance longer than necessary.

### Never Log Seeds

- Never log, print, or persist raw seeds or mnemonic phrases in plaintext.
- Derived key bytes (`Uint8Array`) are also sensitive -- treat them as secrets.

### Deterministic Recovery

- The same mnemonic phrase always produces the same seed, which produces the same key tree. This means a mnemonic backup is sufficient to recover all keys.
- Random seeds from `generateRandomSeed()` cannot be recovered. If you need backup capability, always use the mnemonic path.

### Mnemonic Validation

- Always call `validateMnemonic()` before accepting user-provided mnemonics. Invalid mnemonics will still produce seeds via `mnemonicToSeedSync`, but those seeds will not match the expected key tree.

> **See also:** [wallet-construction.md](wallet-construction.md) for how derived keys feed into wallet construction. [examples/basic-wallet-setup.ts](../examples/basic-wallet-setup.ts) for a runnable example.
