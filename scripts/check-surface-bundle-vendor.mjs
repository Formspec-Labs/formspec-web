/* global console, process */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const formspecRoot = resolve(root, process.env.FORMSPEC_SOURCE_DIR ?? '../formspec');
const integrityRoot = resolve(
  root,
  process.env.INTEGRITY_STACK_SOURCE_DIR ?? '../integrity-stack',
);
const maxVendoredDistBytes = 100 * 1024;

const packages = [
  {
    local: 'vendor/formspec-surface-bundle-signing',
    source: resolve(formspecRoot, 'packages/formspec-surface-bundle-signing'),
    workspace: formspecRoot,
    files: ['index.d.ts', 'index.js', 'types.d.ts', 'types.js', 'verify.d.ts', 'verify.js'],
    licenseSource: 'package',
    sourceBudget: true,
  },
  {
    local: 'vendor/integrity-cose',
    source: resolve(integrityRoot, 'packages/integrity-cose'),
    workspace: integrityRoot,
    files: ['index.d.ts', 'index.js'],
    licenseSource: 'workspace',
    sourceBudget: true,
  },
  {
    local: 'vendor/integrity-signature-port',
    source: resolve(integrityRoot, 'packages/integrity-signature-port'),
    workspace: integrityRoot,
    files: ['index.d.ts', 'index.js'],
    licenseSource: 'workspace',
    sourceBudget: true,
  },
  {
    local: 'vendor/integrity-signature-adapter-webcrypto',
    source: resolve(integrityRoot, 'packages/integrity-signature-adapter-webcrypto'),
    workspace: integrityRoot,
    files: ['index.d.ts', 'index.js'],
    licenseSource: 'workspace',
    sourceBudget: true,
  },
  {
    local: 'vendor/formspec-app-graph',
    source: resolve(formspecRoot, 'packages/formspec-app-graph'),
    workspace: formspecRoot,
    licenseSource: 'package',
  },
  {
    local: 'vendor/formspec-layout',
    source: resolve(formspecRoot, 'packages/formspec-layout'),
    workspace: formspecRoot,
    licenseSource: 'package',
    copiedFiles: [
      { source: 'src/default-theme.json', target: 'default-theme.json' },
      { source: 'src/token-registry.json', target: 'token-registry.json' },
      { source: 'src/formspec-layout.css', target: 'formspec-layout.css' },
      { source: 'src/formspec-default.css', target: 'formspec-default.css' },
      { source: 'src/styles/default.accessibility.css', target: 'styles/default.accessibility.css' },
      { source: 'src/styles/default.base.css', target: 'styles/default.base.css' },
      { source: 'src/styles/default.data.css', target: 'styles/default.data.css' },
      { source: 'src/styles/default.inputs.css', target: 'styles/default.inputs.css' },
      { source: 'src/styles/default.navigation.css', target: 'styles/default.navigation.css' },
      { source: 'src/styles/default.surfaces.css', target: 'styles/default.surfaces.css' },
      { source: 'src/styles/default.tokens.css', target: 'styles/default.tokens.css' },
      { source: 'src/styles/default.utilities.css', target: 'styles/default.utilities.css' },
      { source: 'src/styles/layout.primitives.css', target: 'styles/layout.primitives.css' },
      { source: 'src/styles/layout.responsive.css', target: 'styles/layout.responsive.css' },
    ],
  },
  {
    local: 'vendor/formspec-surface',
    source: resolve(formspecRoot, 'packages/formspec-surface'),
    workspace: formspecRoot,
    licenseSource: 'package',
  },
  {
    local: 'vendor/formspec-surface-react',
    source: resolve(formspecRoot, 'packages/formspec-surface-react'),
    workspace: formspecRoot,
    licenseSource: 'package',
    copiedFiles: [
      {
        source: 'src/formspec-surface.css',
        target: 'formspec-surface.css',
      },
    ],
  },
];

const schemaFiles = [
  'bundle-manifest.schema.json',
  'common.schema.json',
  'component.schema.json',
  'data-sources.schema.json',
  'definition.schema.json',
  'experience.schema.json',
  'issuer.schema.json',
  'locale.schema.json',
  'mapping.schema.json',
  'ontology.schema.json',
  'references.schema.json',
  'registry.schema.json',
  'response-actions.schema.json',
  'screener.schema.json',
  'surface.schema.json',
  'theme.schema.json',
  'validation-mapping.schema.json',
];

if (!existsSync(formspecRoot) || !existsSync(integrityRoot)) {
  throw new Error('Surface bundle upstream sibling checkout is missing.');
}

const integrityWorkspace = readFileSync(
  join(integrityRoot, 'Cargo.toml'),
  'utf8',
);
if (!/\[workspace\.package\][\s\S]*?license\s*=\s*"Apache-2\.0"/u.test(integrityWorkspace)) {
  throw new Error('integrity-stack workspace does not declare Apache-2.0.');
}

const schemaSums = readFileSync(
  join(root, 'vendor/formspec-schemas/SHA256SUMS'),
  'utf8',
);
let schemaBytes = 0;
for (const file of schemaFiles) {
  const local = join(root, 'vendor/formspec-schemas', file);
  const source = join(formspecRoot, 'schemas', file);
  const localHash = sha256(local);
  if (localHash !== sha256(source)) {
    throw new Error(`vendor/formspec-schemas/${file} differs from the upstream schema.`);
  }
  if (!schemaSums.split('\n').includes(`${localHash}  ${file}`)) {
    throw new Error(`vendor/formspec-schemas/SHA256SUMS is stale for ${file}.`);
  }
  schemaBytes += statSync(local).size;
}

const buildRoot = mkdtempSync(join(tmpdir(), 'formspec-web-surface-bundle-vendor-'));
let totalBytes = 0;
let sourceBudgetBytes = 0;
try {
  for (const [index, pkg] of packages.entries()) {
    const localManifest = readJson(join(root, pkg.local, 'package.json'));
    if (localManifest.license !== 'Apache-2.0') {
      throw new Error(`${pkg.local}/package.json must declare Apache-2.0.`);
    }
    if (pkg.licenseSource === 'package') {
      const sourceManifest = readJson(join(pkg.source, 'package.json'));
      if (sourceManifest.license !== 'Apache-2.0') {
        throw new Error(`${pkg.source}/package.json does not declare Apache-2.0.`);
      }
    }
    const license = readFileSync(join(root, pkg.local, 'LICENSE'), 'utf8');
    if (!license.includes('Apache License') || !license.includes('Version 2.0')) {
      throw new Error(`${pkg.local}/LICENSE is not Apache License Version 2.0 text.`);
    }

    const sourceBuild = join(buildRoot, String(index));
    buildUpstreamPackage(
      pkg.workspace,
      pkg.source,
      sourceBuild,
      pkg.copiedFiles ?? [],
    );
    const files = pkg.files ?? relativeFiles(sourceBuild);
    const observed = relativeFiles(join(root, pkg.local, 'dist'));
    if (JSON.stringify(observed) !== JSON.stringify([...files].sort())) {
      throw new Error(`${pkg.local}/dist contains an unexpected built-artifact set.`);
    }
    for (const file of files) {
      const local = join(root, pkg.local, 'dist', file);
      const source = join(sourceBuild, file);
      if (sha256(local) !== sha256(source)) {
        throw new Error(`${pkg.local}/dist/${file} differs from a fresh upstream build.`);
      }
      const bytes = statSync(local).size;
      totalBytes += bytes;
      if (pkg.sourceBudget) sourceBudgetBytes += bytes;
    }
  }
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}

if (sourceBudgetBytes > maxVendoredDistBytes) {
  throw new Error(
    `Surface bundle verification dist is ${sourceBudgetBytes} bytes; limit is ${maxVendoredDistBytes}.`,
  );
}

console.log(
  `surface bundle vendor check passed: ${packages.length} Apache-2.0 package(s), ${schemaFiles.length} canonical schema(s), ${sourceBudgetBytes} verification bytes, ${schemaBytes} schema bytes, ${totalBytes} total built bytes`,
);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function buildUpstreamPackage(workspace, source, outDir, copiedFiles) {
  const tsc = resolve(workspace, 'node_modules/.bin/tsc');
  if (!existsSync(tsc)) {
    throw new Error(`TypeScript compiler is missing from upstream workspace: ${workspace}`);
  }
  const result = spawnSync(
    tsc,
    ['--project', join(source, 'tsconfig.json'), '--outDir', outDir],
    {
      cwd: workspace,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Upstream package build failed for ${source}:\n${result.stdout}${result.stderr}`,
    );
  }
  for (const file of copiedFiles) {
    const target = join(outDir, file.target);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, file.source), target);
  }
}

function relativeFiles(rootDir, currentDir = rootDir) {
  return readdirSync(currentDir, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        return relativeFiles(rootDir, absolute);
      }
      return entry.isFile()
        ? [absolute.slice(rootDir.length + 1)]
        : [];
    })
    .sort();
}
