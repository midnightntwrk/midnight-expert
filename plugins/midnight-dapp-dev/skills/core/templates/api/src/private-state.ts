import type {
  ContractPrivateStates,
  PrivateStateProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  ContractAddress,
  SigningKey,
} from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";

// Midnight.js 5 scopes private state by contract address: the framework calls
// forContract(address) and reads and writes through what it returns.
/**
 * Session-scoped, in-memory implementation of the full PrivateStateProvider
 * interface: private state (per contract address) and signing keys live in
 * plain Maps for the lifetime of the page.
 *
 * The export/import methods are not meaningful for an ephemeral in-memory
 * store, so they reject. For private state that survives a reload (a secret key
 * that is the user's on-chain identity, say), use midnight-js's own
 * levelPrivateStateProvider, which runs on IndexedDB in the browser
 * (`cryptoBackend: "webcrypto"`) and encrypts under a passphrase.
 */
export function inMemoryPrivateStateProvider<
  PSI extends string,
  PS,
>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  const unsupported = (method: string) => async (): Promise<never> => {
    throw new Error(
      `inMemoryPrivateStateProvider does not support ${method}; ` +
        "use a persistent encrypting provider for exports and imports.",
    );
  };

  const forContract = (address: ContractAddress): ContractPrivateStates<PSI, PS> => {
    // The same checks the persistent store makes: 32 bytes of hex, compared
    // in lower case.
    assertIsContractAddress(address);
    const contractAddress = address.toLowerCase();
    const scoped = (): Map<PSI, PS> => {
      let m = states.get(contractAddress);
      if (m === undefined) states.set(contractAddress, (m = new Map()));
      return m;
    };
    return {
      contractAddress,
      set: async (id: PSI, state: PS) => {
        scoped().set(id, state);
      },
      get: async (id: PSI) => states.get(contractAddress)?.get(id) ?? null,
      remove: async (id: PSI) => {
        states.get(contractAddress)?.delete(id);
      },
      clear: async () => {
        states.delete(contractAddress);
      },
      exportPrivateStates: unsupported("exportPrivateStates"),
      importPrivateStates: unsupported("importPrivateStates"),
    };
  };

  return {
    forContract,
    // Private states only; signing keys have clearSigningKeys.
    clearAll: async () => {
      states.clear();
    },
    setSigningKey: async (address: ContractAddress, signingKey: SigningKey) => {
      signingKeys.set(address, signingKey);
    },
    getSigningKey: async (address: ContractAddress) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address: ContractAddress) => {
      signingKeys.delete(address);
    },
    clearSigningKeys: async () => {
      signingKeys.clear();
    },
    exportSigningKeys: unsupported("exportSigningKeys"),
    importSigningKeys: unsupported("importSigningKeys"),
  };
}
