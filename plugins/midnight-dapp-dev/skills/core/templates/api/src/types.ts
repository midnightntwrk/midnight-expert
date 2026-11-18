import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";

/**
 * Replace these placeholder types with your contract's actual types.
 *
 * ContractState — the shape of your contract's public ledger state,
 *   parsed from the indexer with your contract's generated ledger() function
 *   (see contractStateData in index.ts).
 *
 * PrivateState — the shape of your off-chain state stored locally,
 *   typically containing secret keys or user-specific data.
 *
 * DerivedState — the combined view your UI components consume,
 *   computed from ContractState + PrivateState.
 */

// TODO: Replace with your contract's impure circuit key union
// e.g., "increment" | "transfer" | "mint"
export type ImpureCircuitKeys = string;

// TODO: Replace with your contract's private state identifier
export const PRIVATE_STATE_ID = "privateState" as const;

// TODO: Replace with your contract's public ledger state shape
export interface ContractState {
  // e.g., round: bigint;
}

// TODO: Replace with your contract's private state shape
export interface PrivateState {
  // e.g., secretKey: Uint8Array;
}

// Combined state for UI consumption
export interface DerivedState {
  contractState: ContractState | null;
  privateState: PrivateState | null;
}

export type AppProviders = MidnightProviders<
  ImpureCircuitKeys,
  typeof PRIVATE_STATE_ID,
  PrivateState
>;
