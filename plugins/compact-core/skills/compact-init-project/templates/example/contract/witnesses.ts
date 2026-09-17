// This file is part of example-__name__.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// TypeScript implementations of the contract's witnesses — the off-chain logic
// Compact cannot express. Each witness receives a WitnessContext and returns a
// tuple [nextPrivateState, returnValue].
import { type Ledger } from './managed/__name__/contract/index.js';
import { type WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

// The private state carried between witness calls. If your contract keeps no
// private state, leave this as the empty record.
export type __Name__PrivateState = Record<string, never>;

export const create__Name__PrivateState = (): __Name__PrivateState => ({});

// TODO: implement each witness declared in __name__.compact. The property
// names, argument types, and return-tuple shape MUST match the generated
// `Witnesses` type in contract/managed/__name__/contract/index.d.ts (produced by
// `yarn compile`). Compact type mappings: Field/Uint -> bigint, Bytes ->
// Uint8Array, a Compact tuple -> a TS array. Example:
//
//   myWitness: (
//     { privateState }: WitnessContext<Ledger, __Name__PrivateState>,
//     arg: bigint,
//   ): [__Name__PrivateState, bigint] => {
//     return [privateState, arg];
//   },
export const witnesses = {
};

// `Ledger` and `WitnessContext` are imported for the types you will use when
// implementing witnesses above; remove them if your witnesses need neither.
export type { Ledger, WitnessContext };
