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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import pino from 'pino';

import { getConfig } from '../config.js';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from '../wallet.js';
import { buildProviders, type __Name__Providers } from '../providers.js';
__PRIVATE_STATE_IMPORT__
import {
  Compiled__Name__Contract,
  Contract,
  ledger,
  zkConfigPath,
} from '../../contract/index.js';

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error WebSocket global assignment for apollo
globalThis.WebSocket = WebSocket;

const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'Alice__Name__State';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

// Local uses the pre-funded devnet seed. For a remote network, supply a funded
// wallet seed via .env.<network> (e.g. MIDNIGHT_PREVIEW_SEED).
function resolveSecret(net: string): WalletSecret {
  if (net === 'local') return { kind: 'seed', value: ALICE_LOCAL_SEED };
  const seed = process.env[`MIDNIGHT_${net.toUpperCase()}_SEED`]?.trim();
  if (!seed) {
    throw new Error(
      `Set MIDNIGHT_${net.toUpperCase()}_SEED in .env.${net} to run against '${net}'.`,
    );
  }
  return { kind: 'seed', value: seed };
}

describe(`__Title__ Contract (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: __Name__Providers;
  let contractAddress: ContractAddress;

  const config = getConfig();
  const isRemote = network !== 'local';
  const syncTimeoutMs = Number(
    process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? (isRemote ? 60 * 60_000 : 10 * 60_000),
  );

  // Reads the contract's public ledger state. Adapt the returned fields to your
  // own `ledger` declaration.
  async function queryLedger() {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  beforeAll(async () => {
    setNetworkId(config.networkId);

    const envConfig: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };

    wallet = await MidnightWalletProvider.build(logger, envConfig, resolveSecret(network));
    await wallet.start();
    await syncWallet(logger, wallet.wallet, syncTimeoutMs);

    providers = buildProviders(wallet, zkConfigPath, config);
    logger.info(`Providers initialized on '${network}'. Ready to test!`);
  });

  afterAll(async () => {
    if (wallet) {
      logger.info('Stopping wallet...');
      await wallet.stop();
    }
  });

  // ---------------------------------------------------------------------------
  // Everything above is generated boilerplate. Your tests begin here.
  // ---------------------------------------------------------------------------

  it('deploys the contract', async () => {
    const deployed: DeployedContract<Contract> = await (deployContract<Contract>)(providers, {
      compiledContract: Compiled__Name__Contract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: __INITIAL_PRIVATE_STATE__,
    });

    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`Contract deployed at: ${contractAddress}`);
    expect(contractAddress).toBeDefined();
    expect(contractAddress.length).toBeGreaterThan(0);
  });

  // TODO: add circuit-interaction tests. `submitCallTx` and `queryLedger` are
  // imported/defined for you. Example shape:
  //
  // it('does the thing', async () => {
  //   await (submitCallTx<Contract, 'yourCircuit'>)(providers, {
  //     compiledContract: Compiled__Name__Contract,
  //     contractAddress,
  //     privateStateId: PRIVATE_STATE_ID,
  //     circuitId: 'yourCircuit',
  //     args: [/* circuit args */],
  //   });
  //   const state = await queryLedger();
  //   expect(state.someField).toEqual(/* expected */);
  // });
  void submitCallTx;
  void queryLedger;
});
