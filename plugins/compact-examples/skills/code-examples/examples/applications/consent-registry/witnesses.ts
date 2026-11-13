// This file is part of example-consent-registry.
// SPDX-License-Identifier: Apache-2.0

import { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { Ledger } from './managed/consent-registry/contract/index.js';

// The controller's 32-byte secret. It never leaves the controller's machine; the contract
// only stores deriveControllerKey(secret). Subject salts are kept off-chain alongside it.
export type ConsentPrivateState = {
  readonly controllerSecret: Uint8Array;
};

export const createConsentPrivateState = (controllerSecret: Uint8Array): ConsentPrivateState => ({
  controllerSecret,
});

export const witnesses = {
  controllerSecret: ({
    privateState,
  }: WitnessContext<Ledger, ConsentPrivateState>): [ConsentPrivateState, Uint8Array] => [
    privateState,
    privateState.controllerSecret,
  ],
};
