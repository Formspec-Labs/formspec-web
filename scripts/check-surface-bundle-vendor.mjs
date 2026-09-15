/* global console, process */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
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

// `--write` refreshes the vendored copies from fresh sibling builds, then runs
// the same verification. Positional arguments narrow the run to those
// `vendor/<package>` directories (`vendor/formspec-schemas` for the schemas).
const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.filter((arg) => !arg.startsWith('--'));

const packages = [
  {
    local: 'vendor/formspec-types',
    source: resolve(formspecRoot, 'packages/formspec-types'),
    workspace: formspecRoot,
    licenseSource: 'package',
  },
  {
    local: 'vendor/formspec-engine',
    source: resolve(formspecRoot, 'packages/formspec-engine'),
    workspace: formspecRoot,
    licenseSource: 'package',
    // wasm-pack output: compared against the sibling's last WASM build, which
    // this check cannot rebuild.
    prebuiltDirs: ['wasm-pkg-runtime', 'wasm-pkg-tools'],
  },
  {
    local: 'vendor/formspec-react',
    source: resolve(formspecRoot, 'packages/formspec-react'),
    workspace: formspecRoot,
    licenseSource: 'package',
  },
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
      // The built files are flattened (no @import, no external url()); the src files are wrappers.
      { source: 'dist/formspec-layout.css', target: 'formspec-layout.css' },
      { source: 'dist/formspec-default.css', target: 'formspec-default.css' },
      { source: 'src/styles', target: 'styles' },
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
  'response.schema.json',
  'response-actions.schema.json',
  'screener.schema.json',
  'surface.schema.json',
  'theme.schema.json',
  'validation-mapping.schema.json',
  'validation-result.schema.json',
  'verification-receipt.schema.json',
];

if (!existsSync(formspecRoot) || !existsSync(integrityRoot)) {
  throw new Error('Surface bundle upstream sibling checkout is missing.');
}
const schemaRoot = join(root, 'vendor/formspec-schemas');
const unknownPackages = only.filter(
  (local) => local !== 'vendor/formspec-schemas'
    && !packages.some((pkg) => pkg.local === local),
);
if (unknownPackages.length > 0) {
  throw new Error(`Not a vendored package: ${unknownPackages.join(', ')}`);
}
const selectedPackages = only.length === 0
  ? packages
  : packages.filter((pkg) => only.includes(pkg.local));

const integrityWorkspace = readFileSync(
  join(integrityRoot, 'Cargo.toml'),
  'utf8',
);
if (!/\[workspace\.package\][\s\S]*?license\s*=\s*"Apache-2\.0"/u.test(integrityWorkspace)) {
  throw new Error('integrity-stack workspace does not declare Apache-2.0.');
}

const selectSchemas = only.length === 0 || only.includes('vendor/formspec-schemas');
if (write && selectSchemas) {
  const sums = schemaFiles.map((file) => {
    copyPath(join(formspecRoot, 'schemas', file), join(schemaRoot, file));
    return `${sha256(join(schemaRoot, file))}  ${file}\n`;
  });
  writeFileSync(join(schemaRoot, 'SHA256SUMS'), sums.join(''));
}
const schemaSums = readFileSync(join(schemaRoot, 'SHA256SUMS'), 'utf8');
let schemaBytes = 0;
for (const file of selectSchemas ? schemaFiles : []) {
  const local = join(schemaRoot, file);
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
  for (const [index, pkg] of selectedPackages.entries()) {
    if (pkg.licenseSource === 'package') {
      const sourceManifest = readJson(join(pkg.source, 'package.json'));
      if (sourceManifest.license !== 'Apache-2.0') {
        throw new Error(`${pkg.source}/package.json does not declare Apache-2.0.`);
      }
    }

    const sourceBuild = join(buildRoot, String(index));
    buildUpstreamPackage(
      pkg.workspace,
      pkg.source,
      sourceBuild,
      pkg.copiedFiles ?? [],
    );
    const files = pkg.files ?? relativeFiles(sourceBuild);
    const localDist = join(root, pkg.local, 'dist');
    if (write) {
      rmSync(localDist, { recursive: true, force: true });
      for (const file of files) {
        copyPath(join(sourceBuild, file), join(localDist, file));
      }
      for (const dir of pkg.prebuiltDirs ?? []) {
        rmSync(join(root, pkg.local, dir), { recursive: true, force: true });
        copyPath(join(pkg.source, dir), join(root, pkg.local, dir));
      }
      const localLicense = join(root, pkg.local, 'LICENSE');
      if (!existsSync(localLicense)) {
        const packageLicense = join(pkg.source, 'LICENSE');
        copyPath(
          existsSync(packageLicense) ? packageLicense : join(pkg.workspace, 'LICENSE'),
          localLicense,
        );
      }
    }

    const localManifest = readJson(join(root, pkg.local, 'package.json'));
    if (localManifest.license !== 'Apache-2.0') {
      throw new Error(`${pkg.local}/package.json must declare Apache-2.0.`);
    }
    const license = readFileSync(join(root, pkg.local, 'LICENSE'), 'utf8');
    if (!license.includes('Apache License') || !license.includes('Version 2.0')) {
      throw new Error(`${pkg.local}/LICENSE is not Apache License Version 2.0 text.`);
    }

    const bytes = assertSameTree(sourceBuild, localDist, files, `${pkg.local}/dist`);
    totalBytes += bytes;
    if (pkg.sourceBudget) sourceBudgetBytes += bytes;
    for (const dir of pkg.prebuiltDirs ?? []) {
      assertSameTree(
        join(pkg.source, dir),
        join(root, pkg.local, dir),
        relativeFiles(join(pkg.source, dir)),
        `${pkg.local}/${dir}`,
      );
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
  `surface bundle vendor ${write ? 'refresh' : 'check'} passed: ${selectedPackages.length} Apache-2.0 package(s), ${selectSchemas ? schemaFiles.length : 0} canonical schema(s), ${sourceBudgetBytes} verification bytes, ${schemaBytes} schema bytes, ${totalBytes} total built bytes`,
);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copyPath(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

/** Asserts `localDir` holds exactly `files`, each byte-equal to `sourceDir`; returns their size. */
function assertSameTree(sourceDir, localDir, files, label) {
  const observed = relativeFiles(localDir);
  if (JSON.stringify(observed) !== JSON.stringify([...files].sort())) {
    throw new Error(`${label} contains an unexpected built-artifact set.`);
  }
  let bytes = 0;
  for (const file of files) {
    const local = join(localDir, file);
    if (sha256(local) !== sha256(join(sourceDir, file))) {
      throw new Error(`${label}/${file} differs from a fresh upstream build.`);
    }
    bytes += statSync(local).size;
  }
  return bytes;
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
    copyPath(join(source, file.source), join(outDir, file.target));
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
