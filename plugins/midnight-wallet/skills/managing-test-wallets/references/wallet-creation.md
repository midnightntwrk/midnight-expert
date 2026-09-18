# Wallet creation

A wallet is built from a seed → derived keys → three sub-wallets → unified facade.

## Three seed sources

| Source | API |
|--------|-----|
| Random | `generateRandomSeed()` from `@midnightntwrk/wallet-sdk-hd` returns a `Uint8Array` |
| BIP-39 mnemonic | `generateMnemonicWords()` + `validateMnemonic(phrase)` from `@midnightntwrk/wallet-sdk-hd`, then `mnemonicToSeedSync(phrase)` from `@scure/bip39` to produce the seed `Buffer` |
| Hex string | `Buffer.from(hexString, 'hex')` (e.g. for the local-devnet genesis seed) |

## HD derivation

```typescript
import { HDWallet, Roles } from '@midnightntwrk/wallet-sdk-hd';

const hd = HDWallet.fromSeed(seedBuffer);
if (hd.type !== 'seedOk') throw new Error('Invalid seed');

const derived = hd.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
  .deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error('Failed to derive keys');

hd.hdWallet.clear(); // memory hygiene — call as soon as keys are derived
```

## Key conversion

```typescript
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { createKeystore, PublicKey } from '@midnightntwrk/wallet-sdk-unshielded-wallet';

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], networkId);
```

## Construction

```typescript
import { WalletFacade, WalletEntrySchema } from '@midnightntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnightntwrk/wallet-sdk-shielded';
import { UnshieldedWallet } from '@midnightntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnightntwrk/wallet-sdk-abstractions';

const wallet = await WalletFacade.init({
  configuration,  // see network-config.md
  shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (cfg) => DustWallet(cfg).startWithSecretKey(
    dustSecretKey,
    ledger.LedgerParameters.initialParameters().dust,
  ),
});
await wallet.start(shieldedSecretKeys, dustSecretKey);
const state = await wallet.waitForSyncedState();
```

## Memory hygiene

- Call `hdWallet.clear()` as soon as derived keys are extracted.
- Don't log seeds or derived key bytes — treat them as secrets.
- Random seeds (`generateRandomSeed`) cannot be recovered. Use the mnemonic path if you need backup capability.

## Runnable example

`examples/create-wallet.ts` — three modes: random seed (default), `--seed <hex>`, `--mnemonic "<phrase>"`.

## See also

- `wallet-sdk:references/wallet-construction.md` — exhaustive API reference
- `wallet-sdk:references/key-derivation.md` — HD derivation deep dive
