/* global console, process */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const siblingFormspec = resolve(root, process.env.FORMSPEC_SOURCE_DIR ?? '../formspec');

const packageChecks = [
  { manifest: 'packages/formspec-layout/package.json', license: 'packages/formspec-layout/LICENSE' },
  { manifest: 'packages/formspec-adapters/package.json', license: 'packages/formspec-adapters/LICENSE' },
  { manifest: 'packages/formspec-types/package.json', license: 'packages/formspec-types/LICENSE' },
];

const assetChecks = [
  {
    source: 'packages/formspec-layout/src/default-theme.json',
    local: 'src/theme/upstream/layout/default-theme.json',
  },
  {
    source: 'packages/formspec-layout/src/token-registry.json',
    local: 'src/theme/upstream/layout/token-registry.json',
  },
  {
    source: 'packages/formspec-adapters/src/tailwind/tailwind-formspec-core.css',
    local: 'src/theme/upstream/adapters/tailwind-formspec-core.css',
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (!existsSync(siblingFormspec)) {
  throw new Error(`Formspec source checkout not found at ${siblingFormspec}`);
}

for (const { manifest, license } of packageChecks) {
  const absolute = resolve(siblingFormspec, manifest);
  const pkg = readJson(absolute);
  if (pkg.license !== 'Apache-2.0') {
    throw new Error(`${manifest} has license ${pkg.license}; expected Apache-2.0`);
  }

  const licenseText = readFileSync(resolve(siblingFormspec, license), 'utf8');
  if (!licenseText.includes('Apache License') || !licenseText.includes('Version 2.0')) {
    throw new Error(`${license} does not contain Apache License Version 2.0 text`);
  }
}

const mismatches = [];

for (const check of assetChecks) {
  const source = resolve(siblingFormspec, check.source);
  const local = resolve(root, check.local);
  const sourceHash = sha256(source);
  const localHash = sha256(local);
  if (sourceHash !== localHash) {
    mismatches.push(`${check.local} differs from ${check.source}`);
  }
}

if (mismatches.length > 0) {
  throw new Error(`Upstream theme asset sync failed:\n${mismatches.join('\n')}`);
}

console.log('upstream theme assets are Apache-2.0 and byte-for-byte synced');
