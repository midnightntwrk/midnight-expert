#!/usr/bin/env node
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

// Vendored, standalone scaffolder for compact-core:compact-init-project.
//
// PROVENANCE: adapted from mn-examples `scripts/new-example.mjs`
//   Source (provisional): https://github.com/nstanford5/mn-examples
//   TODO: repoint this to the canonical midnightntwrk org repo once it lands,
//   and re-sync this script + templates/example/ from there.
//
// Differs from the upstream monorepo generator: it emits a SELF-CONTAINED
// project into ./<name> (not an examples/<name> workspace) and does NOT edit any
// ci.yaml / README.md / AGENTS.md. Zero dependencies — Node built-ins only, so a
// fresh user never has to install anything.
//
//   node new-example.mjs <name> [--witnesses]
//
// After scaffolding, the author only has to write contract/<name>.compact and
// fill in the test bodies. Everything else (harness, config, docker, and a test
// skeleton up to the first deployContract call) is generated.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(SCRIPT_DIR, '..', 'templates', 'example');

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function usage() {
  console.log(
    [
      'Usage: node new-example.mjs <name> [--witnesses]',
      '',
      '  <name>          kebab-case project name (e.g. voting, hello-world)',
      '  --witnesses     generate a witnesses.ts stub and wire withWitnesses()',
      '',
      'Creates a standalone Midnight project at ./<name> in the current directory.',
    ].join('\n'),
  );
}

// --- arg parsing ------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}
const withWitnesses = args.includes('--witnesses');
const positionals = args.filter((a) => !a.startsWith('-'));
if (positionals.length !== 1) {
  usage();
  fail('exactly one <name> argument is required');
}
const name = positionals[0];
if (!NAME_RE.test(name)) {
  fail(`invalid name '${name}'. Use kebab-case: lowercase letters/digits, hyphen-separated (e.g. hello-world).`);
}

const targetDir = path.join(process.cwd(), name);
if (fs.existsSync(targetDir)) {
  fail(`${name} already exists in this directory — choose a different name or remove it first.`);
}
if (!fs.existsSync(TEMPLATE_DIR)) {
  fail(`template directory not found at ${TEMPLATE_DIR}`);
}

// --- name derivations -------------------------------------------------------
const words = name.split('-');
const Name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(''); // PascalCase
const Title = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' '); // Space-joined

// --- token/marker substitution ----------------------------------------------
const KNOWN_TOKENS = [
  '__name__',
  '__Name__',
  '__Title__',
  '__WITNESS_IMPORT__',
  '__WITNESS_METHOD__',
  '__PRIVATE_STATE_IMPORT__',
  '__INITIAL_PRIVATE_STATE__',
];

function substitute(content) {
  // 1) Plain name tokens (case-sensitive, non-overlapping).
  let out = content
    .replaceAll('__Title__', Title)
    .replaceAll('__Name__', Name)
    .replaceAll('__name__', name);

  // 2) Witness markers. Values are pre-resolved so ordering is irrelevant.
  if (withWitnesses) {
    out = out
      .replaceAll('__WITNESS_IMPORT__', "import { witnesses } from './witnesses.js';")
      .replaceAll('__WITNESS_METHOD__', 'withWitnesses(witnesses)')
      .replaceAll(
        '__PRIVATE_STATE_IMPORT__',
        `import { create${Name}PrivateState } from '../../contract/witnesses.js';`,
      )
      .replaceAll('__INITIAL_PRIVATE_STATE__', `create${Name}PrivateState()`);
  } else {
    // Drop the whole marker line for the two import markers.
    out = out
      .replaceAll('__WITNESS_IMPORT__\n', '')
      .replaceAll('__PRIVATE_STATE_IMPORT__\n', '')
      .replaceAll('__WITNESS_METHOD__', 'withVacantWitnesses')
      .replaceAll('__INITIAL_PRIVATE_STATE__', '{}');
  }
  return out;
}

function assertNoLeftoverTokens(rel, content) {
  const leftovers = KNOWN_TOKENS.filter((t) => content.includes(t));
  if (leftovers.length > 0) {
    fail(`unresolved template token(s) ${leftovers.join(', ')} in ${rel} — this is a generator bug.`);
  }
}

// --- recursive copy ---------------------------------------------------------
const created = [];

function copyTree(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const relFromTemplate = path.relative(TEMPLATE_DIR, srcPath);

    // Only copy the witnesses stub when --witnesses is set.
    if (!withWitnesses && relFromTemplate === path.join('contract', 'witnesses.ts')) {
      continue;
    }

    const destName = entry.name.replaceAll('__name__', name);
    const destPath = path.join(destDir, destName);

    if (entry.isDirectory()) {
      copyTree(srcPath, destPath);
    } else {
      const raw = fs.readFileSync(srcPath, 'utf8');
      const content = substitute(raw);
      assertNoLeftoverTokens(relFromTemplate, content);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, content);
      created.push(path.relative(process.cwd(), destPath));
    }
  }
}

copyTree(TEMPLATE_DIR, targetDir);

// --- summary ----------------------------------------------------------------
console.log(`\n✔ Scaffolded ${name} (${withWitnesses ? 'with witnesses' : 'witness-free'})\n`);
console.log(`  ${created.length} files created:`);
for (const f of created) console.log(`    ${f}`);
console.log('\n  Next steps:');
console.log(`    1. Write your contract in ${name}/contract/${name}.compact`);
if (withWitnesses) {
  console.log(`    2. Implement the declared witnesses in ${name}/contract/witnesses.ts`);
  console.log(`    3. Fill in tests in ${name}/src/test/${name}.test.ts`);
} else {
  console.log(`    2. Fill in tests in ${name}/src/test/${name}.test.ts`);
}
console.log(`\n    Then, from ${name}/:`);
console.log('      yarn install        # or: npm install');
console.log('      yarn compile');
console.log('      yarn env:up && yarn wait:dust && yarn test:local && yarn env:down');
console.log('');
