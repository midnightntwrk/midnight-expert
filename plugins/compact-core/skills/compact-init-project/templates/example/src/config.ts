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

// The main purpose of this file is to hold network configurations. Add configs for new networks
// (such as Preprod) and modify the code in getConfig() to set `const network` appropriately
export type NetworkConfig = {
  networkId: string;
  indexer: string;
  indexerWS: string;
  node: string;
  nodeWS: string;
  proofServer: string;
  // Human-facing faucet page for topping up test wallets. Not a programmatic
  // drip endpoint — the tests assume seeds in .env.<network> are pre-funded.
  faucet: string;
};

// depends on docker config in compose.yml running
export const LOCAL_CONFIG: NetworkConfig = {
  networkId: 'undeployed',
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node: 'http://127.0.0.1:9944',
  nodeWS: 'ws://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
  faucet: '',
};

export const PREVIEW_CONFIG: NetworkConfig = {
  networkId: 'preview',
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  nodeWS: 'wss://rpc.preview.midnight.network',
  proofServer: process.env['MIDNIGHT_PROOF_SERVER'] ?? 'http://127.0.0.1:6300',
  faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
};

// Blockfrost hosts the public Preprod indexer and node RPC, and every request
// needs a project token for that network. Use a "Midnight Preprod" project ID
// (it starts with `nightpreprod`) in BLOCKFROST_PROJECT_ID in .env.preprod.
// The token is part of each URL, so don't log these URLs.
function withBlockfrostKey(url: string, projectId: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}project_id=${encodeURIComponent(projectId)}`;
}

function blockfrostProjectId(): string {
  const projectId = process.env['BLOCKFROST_PROJECT_ID']?.trim();
  if (!projectId) {
    throw new Error('Set BLOCKFROST_PROJECT_ID in .env.preprod to run against preprod.');
  }
  return projectId;
}

// Built on demand rather than at import time, so a missing token fails here
// with a clear message instead of as a 403 deep inside wallet sync.
export function preprodConfig(): NetworkConfig {
  const projectId = blockfrostProjectId();
  return {
    networkId: 'preprod',
    indexer: withBlockfrostKey('https://midnight-preprod.blockfrost.io/api/v0', projectId),
    indexerWS: withBlockfrostKey('wss://midnight-preprod.blockfrost.io/api/v0/ws', projectId),
    node: withBlockfrostKey('https://rpc.midnight-preprod.blockfrost.io', projectId),
    nodeWS: withBlockfrostKey('wss://rpc.midnight-preprod.blockfrost.io', projectId),
    proofServer: process.env['MIDNIGHT_PROOF_SERVER'] ?? 'http://127.0.0.1:6300',
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
  };
}

export function getConfig(): NetworkConfig {
  const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
  switch (network) {
    case 'local':
      return LOCAL_CONFIG;
    case 'preview':
      return PREVIEW_CONFIG;
    case 'preprod':
      return preprodConfig();
    default:
      throw new Error(
        `Unknown network: ${network}. Supported: 'local', 'preview', 'preprod'.`,
      );
  }
}
