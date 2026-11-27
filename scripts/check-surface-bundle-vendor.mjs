/* global console, process */

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const formspecRoot = resolve(root, process.env.FORMSPEC_SOURCE_DIR ?? '../formspec');
const sourceRoot = resolve(root, process.env.FORMSPEC_SERVER_SOURCE_DIR ?? '../formspec-server');
const integrityRoot = resolve(
  root,
  process.env.INTEGRITY_STACK_SOURCE_DIR ?? '../integrity-stack',
);
// Keeps the hand-vendored verification code (runtime .js only) small enough to audit.
const maxVendoredDistBytes = 100 * 1024;

// `--write` refreshes the vendored copies from fresh sibling builds, then runs
// the same verification. Positional arguments narrow the run to those
// `vendor/<package>` directories, `vendor/formspec-schemas` for all schemas,
// or an allowlisted `vendor/formspec-schemas/<file>` for one schema.
// Source API schemas use `src/adapters/http/source-schemas` (or a file beneath it).
const args = process.argv.slice(2);
const write = args.includes('--write');
const sourcePinsOnly = args.includes('--source-pins-only');
const metadataOnly = args.includes('--metadata-only');
if (write && sourcePinsOnly) throw new Error('--source-pins-only cannot refresh producer schemas.');
const only = args.filter((arg) => !arg.startsWith('--'));

// These packages retain the maintained source API and runtime dependency metadata.
// The small signing/integrity copies use separate vendor packaging.
const maintainedManifestPackages = new Set([
  'vendor/formspec-types', 'vendor/formspec-engine', 'vendor/formspec-app-graph',
  'vendor/formspec-layout', 'vendor/formspec-react', 'vendor/formspec-surface', 'vendor/formspec-surface-react',
  'vendor/formspec-signature-port', 'vendor/formspec-signature-cose',
]);
const publicRuntimeFields = ['name', 'version', 'description', 'main', 'types', 'exports',
  'files', 'sideEffects', 'dependencies', 'peerDependencies'];
const lockPath = join(root, 'package-lock.json');
let lock;
let lockChanged = false;

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
    // wasm-pack output of the sibling's `npm run build` (built in its pinned image).
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
  // The engine's runtime dependencies; their manifests stay maintained so npm sees the
  // integrity packages they need, which the vendored integrity copies satisfy.
  {
    local: 'vendor/formspec-signature-port',
    source: resolve(formspecRoot, 'packages/formspec-signature-port'),
    workspace: formspecRoot,
    files: ['index.d.ts', 'index.js'],
    licenseSource: 'package',
    sourceBudget: true,
  },
  {
    local: 'vendor/formspec-signature-cose',
    source: resolve(formspecRoot, 'packages/formspec-signature-cose'),
    workspace: formspecRoot,
    files: ['index.d.ts', 'index.js'],
    licenseSource: 'package',
    sourceBudget: true,
  },
  {
    local: 'vendor/integrity-canonical',
    source: resolve(integrityRoot, 'packages/integrity-canonical'),
    workspace: integrityRoot,
    files: ['index.d.ts', 'index.js'],
    licenseSource: 'workspace',
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
  'locale-v2.0.schema.json',
  'mapping.schema.json',
  'ontology.schema.json',
  'references.schema.json',
  'registry.schema.json',
  'response.schema.json',
  'response-actions.schema.json',
  'screener.schema.json',
  'surface.schema.json',
  'surface-v0.2.schema.json',
  'theme.schema.json',
  'validation-mapping.schema.json',
  'validation-result.schema.json',
  'verification-receipt.schema.json',
];

const sourceSchemaDir = 'src/adapters/http/source-schemas';
const sourceSchemaFiles = [
  'evaluation-composition-v2.schema.json',
  'evaluation-composition-v4.schema.json',
  'evaluation-composition-v5.schema.json',
  'evaluation-composition.schema.json',
  'evaluation-hydration.schema.json',
  'native-current-check-selector.schema.json',
  'native-screener-api.schema.json',
];
const sourceSchemaSelectors = sourceSchemaFiles.map(file => `${sourceSchemaDir}/${file}`);

const schemaRoot = join(root, 'vendor/formspec-schemas');
const schemaSelectors = schemaFiles.map((file) => `vendor/formspec-schemas/${file}`);
const unknownPackages = only.filter(
  (local) => local !== 'vendor/formspec-schemas'
    && local !== sourceSchemaDir
    && !sourceSchemaSelectors.includes(local)
    && !schemaSelectors.includes(local)
    && !packages.some((pkg) => pkg.local === local),
);
if (unknownPackages.length > 0) {
  throw new Error(`Not a vendored package: ${unknownPackages.join(', ')}`);
}
const selectedPackages = only.length === 0
  ? packages
  : packages.filter((pkg) => only.includes(pkg.local));
const checksWasm = selectedPackages.some(pkg => pkg.prebuiltDirs);

// Manifest-only synchronization neither builds code nor certifies generated bytes or refs.
if (metadataOnly && (sourcePinsOnly || only.length === 0
  || only.some(local => !maintainedManifestPackages.has(local)))) {
  throw new Error('--metadata-only requires explicit maintained package selectors and cannot use --source-pins-only.');
}

// Check all selected dependency edges before writing any package manifests.
const packageManifests = selectedPackages.map(pkg => {
  const sourceManifest = readJson(join(pkg.source, 'package.json'));
  const localManifestPath = join(root, pkg.local, 'package.json');
  const localManifest = readJson(localManifestPath);
  if (maintainedManifestPackages.has(pkg.local)) {
    if (!write) assertPublicRuntimeMetadata(sourceManifest, localManifest, pkg.local);
    reconcileLockedDependencies(sourceManifest, pkg.local);
  }
  return { pkg, sourceManifest, localManifest, localManifestPath };
});

if (metadataOnly) {
  writePackageMetadata();
  console.log(`surface bundle vendor metadata-only ${write ? 'refresh' : 'check'} passed: ${selectedPackages.length} package manifest(s); generated code and upstream refs unchanged`);
  process.exit(0);
}

const selectedSourceSchemas = only.length === 0 || only.includes(sourceSchemaDir)
  ? sourceSchemaFiles : sourceSchemaFiles.filter(file => only.includes(`${sourceSchemaDir}/${file}`));
// Public/fork CI checks committed pins without private credentials. A selected Source
// directory (or explicit env) checks the producer too; trusted CI runs that comparison.
const checkSourceUpstream = !sourcePinsOnly && (write || process.env.FORMSPEC_SERVER_SOURCE_DIR !== undefined
  || only.some(local => local === sourceSchemaDir || sourceSchemaSelectors.includes(local)));
if (selectedSourceSchemas.length > 0) {
  if (checkSourceUpstream && !existsSync(sourceRoot)) throw new Error('formspec-server checkout is missing; set FORMSPEC_SERVER_SOURCE_DIR.');
  const sumsPath = join(root, sourceSchemaDir, 'SHA256SUMS');
  const sums = readFileSync(sumsPath, 'utf8').trimEnd().split('\n');
  for (const file of selectedSourceSchemas) {
    const count = sums.filter(line => line.endsWith(`  ${file}`)).length;
    // An explicit refresh may introduce a newly allowlisted dependency. Checks
    // require its existing pin; duplicate rows are invalid in either mode.
    if (count > 1 || (count === 0 && !write)) {
      throw new Error(`${sourceSchemaDir}/SHA256SUMS must contain one entry for ${file}.`);
    }
  }
  const schemas = selectedSourceSchemas.map(file => ({ file, bytes: readFileSync(join(
    checkSourceUpstream ? join(sourceRoot, 'schemas') : join(root, sourceSchemaDir), file,
  )) }));
  if (write) {
    const refsPath = join(root, 'vendor/upstream-refs.json');
    const refs = readJson(refsPath);
    const git = (...gitArgs) => spawnSync('git', gitArgs, { cwd: sourceRoot, encoding: 'utf8' });
    const head = git('rev-parse', 'HEAD');
    if (head.status !== 0) throw new Error('Cannot record the formspec-server producer commit.');
    // Pinning a new producer requires every retained copy to agree with it, including
    // unselected files. Check before writing so a partial refresh cannot mislabel them.
    for (const file of sourceSchemaFiles) {
      const committed = git('show', `HEAD:schemas/${file}`);
      const bytes = schemas.find(schema => schema.file === file)?.bytes ?? readFileSync(join(root, sourceSchemaDir, file));
      if (committed.status !== 0 || !bytes.equals(Buffer.from(committed.stdout))) {
        throw new Error(`Source schema ${file} does not match the producer commit; refresh the complete Source selection from committed schemas.`);
      }
    }
    for (const { file, bytes } of schemas) writeFileSync(join(root, sourceSchemaDir, file), bytes);
    for (const { file, bytes } of schemas) {
      const line = `${createHash('sha256').update(bytes).digest('hex')}  ${file}`;
      const index = sums.findIndex(entry => entry.endsWith(`  ${file}`));
      if (index === -1) sums.push(line);
      else sums[index] = line;
    }
    writeFileSync(sumsPath, `${sums.join('\n')}\n`);
    writeFileSync(refsPath, `${JSON.stringify({ ...refs, 'formspec-server': head.stdout.trim() }, null, 2)}\n`);
  }
  for (const { file, bytes } of schemas) {
    if (!readFileSync(join(root, sourceSchemaDir, file)).equals(bytes)) {
      throw new Error(`${sourceSchemaDir}/${file} differs from the upstream schema.`);
    }
    const pin = `${createHash('sha256').update(bytes).digest('hex')}  ${file}`;
    if (sums.filter(line => line === pin).length !== 1) throw new Error(`${sourceSchemaDir}/SHA256SUMS is stale for ${file}.`);
  }
}

if (selectedPackages.some(pkg => pkg.workspace === integrityRoot)) {
  const integrityWorkspace = readFileSync(join(integrityRoot, 'Cargo.toml'), 'utf8');
  if (!/\[workspace\.package\][\s\S]*?license\s*=\s*"Apache-2\.0"/u.test(integrityWorkspace)) {
    throw new Error('integrity-stack workspace does not declare Apache-2.0.');
  }
}

const selectAllSchemas = only.length === 0 || only.includes('vendor/formspec-schemas');
const selectedSchemaFiles = selectAllSchemas ? schemaFiles : schemaFiles.filter(
  (file) => only.includes(`vendor/formspec-schemas/${file}`),
);
if (write && selectedSchemaFiles.length > 0) {
  const sumLines = selectAllSchemas ? [] : readFileSync(join(schemaRoot, 'SHA256SUMS'), 'utf8').split('\n');
  // Validate selected checksum slots before copying. Leave every unselected pin byte-for-byte intact.
  const slots = selectedSchemaFiles.map((file) => {
    if (selectAllSchemas) return -1;
    const matches = sumLines.flatMap((line, index) => line.endsWith(`  ${file}`) ? [index] : []);
    if (matches.length !== 1) throw new Error(`SHA256SUMS must contain one entry for ${file}.`);
    return matches[0];
  });
  for (const [index, file] of selectedSchemaFiles.entries()) {
    copyPath(join(formspecRoot, 'schemas', file), join(schemaRoot, file));
    const entry = `${sha256(join(schemaRoot, file))}  ${file}`;
    if (selectAllSchemas) sumLines.push(entry);
    else sumLines[slots[index]] = entry;
  }
  writeFileSync(join(schemaRoot, 'SHA256SUMS'), selectAllSchemas ? `${sumLines.join('\n')}\n` : sumLines.join('\n'));
}
const schemaSums = selectedSchemaFiles.length ? readFileSync(join(schemaRoot, 'SHA256SUMS'), 'utf8') : '';
let schemaBytes = 0;
for (const file of selectedSchemaFiles) {
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

// Formspec resolves integrity-stack's built canonical package through a sibling link.
// Build integrity first, even when only a Formspec package is selected.
if (checksWasm && (process.env.FORMSPEC_WASM_PLATFORM ?? 'linux/arm64') !== 'linux/arm64') {
  throw new Error('The published WASM pair must be built on linux/arm64.');
}
if (checksWasm && realpathSync(integrityRoot) !== realpathSync(resolve(formspecRoot, '../integrity-stack'))) {
  throw new Error('The WASM build must use the recorded integrity-stack sibling.');
}
const selectedWorkspaces = new Set(selectedPackages.map(pkg => pkg.workspace));
if (selectedWorkspaces.has(formspecRoot)) selectedWorkspaces.add(integrityRoot);
for (const workspace of [integrityRoot, formspecRoot].filter(dir => selectedWorkspaces.has(dir))) {
  const manifest = join(workspace, 'package.json');
  if (existsSync(manifest) && readJson(manifest).scripts?.build) {
    const result = spawnSync('npm', ['run', 'build'], { cwd: workspace, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (result.status !== 0) {
      throw new Error(`Upstream workspace build failed in ${workspace}:\n${result.stdout}${result.stderr}`);
    }
  }
}

// A full refresh records the exact upstream commits the copies were built from, so CI can
// check out the same ones. The byte comparison remains the gate.
if (write && only.length === 0) {
  const refs = {};
  for (const [name, dir] of [
    ['formspec', formspecRoot], ['fel-core', resolve(formspecRoot, '../fel-core')], ['integrity-stack', integrityRoot],
    ['formspec-server', sourceRoot],
  ]) {
    const git = (...gitArgs) => spawnSync('git', gitArgs, { cwd: dir, encoding: 'utf8' });
    if (git('status', '--porcelain').stdout.trim()) throw new Error(`${name} has uncommitted changes; refusing to record its ref.`);
    refs[name] = git('rev-parse', 'HEAD').stdout.trim();
  }
  writeFileSync(join(root, 'vendor/upstream-refs.json'), `${JSON.stringify(refs, null, 2)}\n`);
}

const buildRoot = mkdtempSync(join(tmpdir(), 'formspec-web-surface-bundle-vendor-'));
let totalBytes = 0;
let sourceBudgetBytes = 0;
try {
  for (const [index, { pkg, sourceManifest, localManifest }] of packageManifests.entries()) {
    if (pkg.licenseSource === 'package') {
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

    if (localManifest.license !== 'Apache-2.0') {
      throw new Error(`${pkg.local}/package.json must declare Apache-2.0.`);
    }
    const license = readFileSync(join(root, pkg.local, 'LICENSE'), 'utf8');
    if (!license.includes('Apache License') || !license.includes('Version 2.0')) {
      throw new Error(`${pkg.local}/LICENSE is not Apache License Version 2.0 text.`);
    }

    const bytes = assertSameTree(sourceBuild, localDist, files, `${pkg.local}/dist`);
    totalBytes += bytes;
    if (pkg.sourceBudget) {
      sourceBudgetBytes += files.filter((file) => file.endsWith('.js'))
        .reduce((sum, file) => sum + statSync(join(localDist, file)).size, 0);
    }
    for (const dir of pkg.prebuiltDirs ?? []) {
      assertSameTree(
        join(pkg.source, dir),
        join(root, pkg.local, dir),
        relativeFiles(join(pkg.source, dir)),
        `${pkg.local}/${dir}`,
      );
    }
    if (pkg.prebuiltDirs) checkWasmBuildReceipt(pkg);
  }
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}

if (sourceBudgetBytes > maxVendoredDistBytes) {
  throw new Error(
    `Surface bundle verification dist is ${sourceBudgetBytes} bytes; limit is ${maxVendoredDistBytes}.`,
  );
}
writePackageMetadata();

console.log(
  `surface bundle vendor ${write ? 'refresh' : 'check'} passed: ${selectedPackages.length} Apache-2.0 package(s), ${selectedSchemaFiles.length} canonical schema(s), ${selectedSourceSchemas.length} Source API schema(s) (${checkSourceUpstream ? 'upstream bytes and pins' : 'pins only'}), ${sourceBudgetBytes} verification bytes, ${schemaBytes} schema bytes, ${totalBytes} total built bytes`,
);

function writePublicRuntimeMetadata(source, local, path) {
  for (const field of publicRuntimeFields) {
    if (Object.hasOwn(source, field)) local[field] = source[field];
    else delete local[field];
  }
  writeFileSync(path, `${JSON.stringify(local, null, 2)}\n`);
}

function reconcileLockedDependencies(manifest, label) {
  lock ??= readJson(lockPath);
  const locked = lock.packages[label];
  if (!locked) throw new Error(`${label} is missing from package-lock.json.`);
  const { satisfies } = require('semver');
  for (const field of ['dependencies', 'peerDependencies']) {
    const dependencies = manifest[field];
    const stale = !isDeepStrictEqual(dependencies, locked[field]);
    if (stale && !write) throw new Error(`${label} ${field} is stale in package-lock.json. Run npm run vendor:refresh.`);
    for (const [name, range] of Object.entries(dependencies ?? {})) {
      const existing = lock.packages[`${label}/node_modules/${name}`] ?? lock.packages[`node_modules/${name}`];
      const resolved = existing?.link ? lock.packages[existing.resolved] : existing;
      if ([existing, resolved].some(entry => entry?.dev || entry?.optional || entry?.devOptional)
        || !resolved?.version || !satisfies(resolved.version, range)) {
        throw new Error(`${label} requires ${name}@${range} but package-lock.json has no matching resolution.`);
      }
    }
    if (!stale) continue;
    if (dependencies) locked[field] = dependencies;
    else delete locked[field];
    lockChanged = true;
  }
}

function writePackageMetadata() {
  if (!write) return;
  for (const { pkg, sourceManifest, localManifest, localManifestPath } of packageManifests) {
    if (maintainedManifestPackages.has(pkg.local)) {
      writePublicRuntimeMetadata(sourceManifest, localManifest, localManifestPath);
    }
  }
  if (lockChanged) writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

function assertPublicRuntimeMetadata(source, local, label) {
  for (const field of publicRuntimeFields) {
    if (Object.hasOwn(source, field) !== Object.hasOwn(local, field)
      || !isDeepStrictEqual(source[field], local[field])) {
      throw new Error(`${label}/package.json ${field} differs from upstream public/runtime metadata.`);
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function checkWasmBuildReceipt(pkg) {
  const felRoot = resolve(formspecRoot, '../fel-core');
  const commit = dir => {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Cannot identify WASM build source ${dir}.`);
    if (write) {
      const status = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
      if (status.status !== 0 || status.stdout.trim()) {
        throw new Error(`WASM build source ${dir} must be clean to record its revision.`);
      }
    }
    return result.stdout.trim();
  };
  const artifacts = pkg.prebuiltDirs.flatMap(dir => {
    const directory = join(root, pkg.local, dir);
    return relativeFiles(directory).map(file => {
      const path = join(directory, file);
      return { path: `${pkg.local}/${dir}/${file.split(sep).join('/')}`, sha256: sha256(path), bytes: statSync(path).size };
    });
  });
  const receipt = {
    version: 1,
    platform: 'linux/arm64',
    sources: { formspec: commit(formspecRoot), 'fel-core': commit(felRoot), 'integrity-stack': commit(integrityRoot) },
    dockerfileSha256: sha256(join(formspecRoot, 'docker/wasm-build/Dockerfile')),
    artifacts,
  };
  const path = join(root, pkg.local, 'wasm-build-receipt.json');
  if (write) writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  if (!isDeepStrictEqual(readJson(path), receipt)) throw new Error(`${pkg.local} WASM build receipt differs from the fresh pinned build.`);
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
