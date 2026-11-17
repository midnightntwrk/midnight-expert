# Wallet creation

A wallet is built from a master seed → three per-wallet seeds → three sub-wallets → unified facade.

## Three seed sources

| Source | API |
|--------|-----|
| Random | `generateRandomSeed()` from `@midnightntwrk/wallet-sdk-hd` returns a `Uint8Array` |
| BIP-39 mnemonic | `generateMnemonicWords()` + `validateMnemonic(phrase)` from `@midnightntwrk/wallet-sdk-hd`, then `mnemonicToSeedSync(phrase)` from `@scure/bip39` to produce the seed `Buffer` |
| Hex string | `Buffer.from(hexString, 'hex')` (e.g. for the local-devnet genesis seed) |

## Seed derivation

```typescript
import { WalletSeeds } from '@midnightntwrk/wallet-sdk-hd';

// Throws SeedDerivationError on a seed BIP32 rejects.
const seeds = WalletSeeds.fromMasterSeed(seedBuffer);
// seeds.shielded, seeds.unshielded, seeds.dust — plain Uint8Arrays
```

`WalletSeeds.fromMasterSeed` walks the same HD path the wallet SDK 1.x
`HDWallet` code did (account 0, roles `Zswap` / `NightExternal` / `Dust`,
index 0), so a master seed from 1.x restores the same wallet and the same
addresses. It wipes the BIP32 tree before returning. `HDWallet` and
`Roles` still exist for callers that want a different account, index or
role.

## Unshielded keystore

```typescript
import { createKeystore } from '@midnightntwrk/wallet-sdk-unshielded-wallet';

const unshieldedKeystore = createKeystore(
  { kind: 'schnorr', secret: seeds.unshielded },
  networkId,
);
```

`schnorr` is the scheme that works on both sides of the ledger 9
boundary. The shielded and DUST wallets take their seeds directly; there
is no separate key-conversion step.

## Construction

```typescript
import {
  WalletFacade,
  WalletEntrySchema,
  mergeWalletEntries,
  type FacadeState,
} from '@midnightntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnightntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, PublicKey } from '@midnightntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet';
import { firstValueFrom, filter } from 'rxjs';

// configuration: see network-config.md (includes txHistoryStorage)
const wallet = await WalletFacade.init({
  configuration,
  shielded: (cfg) => ShieldedWallet(cfg).startWithSeed(seeds.shielded),
  unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (cfg) => DustWallet(cfg).startWithSeed(seeds.dust),
});
await wallet.start(seeds);

// Synced, and all three sub-wallets on the same protocol version.
const waitForSettled = (w: WalletFacade): Promise<FacadeState> =>
  firstValueFrom(w.state().pipe(filter((s) => s.isSynced && s.protocol._tag === 'Settled')));
const state = await waitForSettled(wallet);
```

`wallet.start()` takes the seeds, not key objects: a seed is the only key
material that crosses the ledger 8 / ledger 9 boundary.

Wait for `protocol._tag === 'Settled'`, not just `isSynced`, before
building a transaction. While a sub-wallet is still behind the protocol
boundary the facade reports `Crossing`, and a transaction built then can
fail with `ProtocolVersionMismatchError`. `wallet.waitForSyncedState()`
still exists but resolves on `isSynced` alone.

## Memory hygiene

- Don't keep the master seed around once `WalletSeeds.fromMasterSeed` has run; `wallet.start(seeds)` is all the wallet needs.
- Don't log seeds or derived key bytes — treat them as secrets.
- Random seeds (`generateRandomSeed`) cannot be recovered. Use the mnemonic path if you need backup capability.

## Runnable example

`examples/create-wallet.ts` — three modes: random seed (default), `--seed <hex>`, `--mnemonic "<phrase>"`.

## See also

- `wallet-sdk:references/wallet-construction.md` — exhaustive API reference
- `wallet-sdk:references/key-derivation.md` — seed derivation deep dive
