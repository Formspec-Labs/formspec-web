import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const schemaFiles = readdirSync(join(repoRoot, 'vendor/formspec-schemas'))
  .filter((file) => file.endsWith('.schema.json'));
// The canonical inventory preserves published Surface 0.2 and Locale 2.0 schemas.
// Keep the isolated copy/check fixture complete before Runtime distributes it.
if (!schemaFiles.includes('surface-v0.2.schema.json')) schemaFiles.push('surface-v0.2.schema.json');
if (!schemaFiles.includes('locale-v2.0.schema.json')) schemaFiles.push('locale-v2.0.schema.json');
schemaFiles.sort();
const selector = 'vendor/formspec-schemas/locale.schema.json';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('surface bundle vendor schema selection', () => {
  it('checks Source schema bytes and refreshes only the selected schema without builds', () => {
    const fixture = createFixture();
    const { dir, upstream, files, git } = addSourceFixture(fixture);
    expect(run(fixture, dir).status).toBe(0);
    const file = files[0];
    const source = join(upstream, 'schemas', file);
    // JSON-equivalent whitespace still changes the bytes and must be caught.
    writeFileSync(source, `${readFileSync(source, 'utf8')}\n`);
    git('add', 'schemas');
    git('commit', '-m', 'Update producer schema');
    const before = snapshot(fixture);
    const other = join(fixture.web, dir, files[1]);
    const otherBytes = readFileSync(other, 'utf8');
    const check = run(fixture, dir);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain(`${dir}/${file} differs from the upstream schema`);
    const refresh = run(fixture, '--write', `${dir}/${file}`);
    expect(refresh.status, refresh.stderr).toBe(0);
    expect(readFileSync(join(fixture.web, dir, file))).toEqual(readFileSync(source));
    expect(readFileSync(other, 'utf8')).toBe(otherBytes);
    expect(snapshot(fixture)).toEqual(before);
    expect(JSON.parse(readFileSync(join(fixture.web, 'vendor/upstream-refs.json'), 'utf8')))
      .toEqual({ formspec: 'unchanged', 'formspec-server': git('rev-parse', 'HEAD') });
    expect(run(fixture, dir).status).toBe(0);
  });

  it('checks Source pins without private producer access and rejects byte drift', () => {
    const fixture = createFixture();
    const { dir, upstream, files } = addSourceFixture(fixture);
    rmSync(upstream, { recursive: true });
    expect(run(fixture, '--source-pins-only', dir).status).toBe(0);
    const file = join(fixture.web, dir, files[0]);
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n`);
    const result = run(fixture, '--source-pins-only', dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SHA256SUMS is stale');
  });

  it('refuses an uncommitted Source refresh before changing copies or provenance', () => {
    const fixture = createFixture();
    const { dir, upstream, files } = addSourceFixture(fixture);
    const before = Object.fromEntries(readdirSync(join(fixture.web, dir)).map(file =>
      [file, readFileSync(join(fixture.web, dir, file), 'utf8')]));
    const refs = readFileSync(join(fixture.web, 'vendor/upstream-refs.json'), 'utf8');
    const source = join(upstream, 'schemas', files[0]);
    writeFileSync(source, `${readFileSync(source, 'utf8')}\n`);
    const result = run(fixture, '--write', `${dir}/${files[0]}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match the producer commit');
    for (const [file, bytes] of Object.entries(before)) {
      expect(readFileSync(join(fixture.web, dir, file), 'utf8')).toBe(bytes);
    }
    expect(readFileSync(join(fixture.web, 'vendor/upstream-refs.json'), 'utf8')).toBe(refs);
  });

  it('refreshes source public/runtime metadata and preserves local tooling and unselected packages', () => {
    const fixture = createFixture();
    const { sourceManifest, local, originalLocal, unselected, unselectedBytes } = addPackageFixture(fixture);
    const schemas = snapshot(fixture);
    const result = run(fixture, '--write', 'vendor/formspec-types');
    expect(result.status, result.stderr).toBe(0);
    const refreshed = JSON.parse(readFileSync(join(local, 'package.json'), 'utf8'));
    for (const field of publicRuntimeFields) {
      expect(refreshed[field], field).toEqual(sourceManifest[field]);
      expect(Object.hasOwn(refreshed, field), field).toBe(Object.hasOwn(sourceManifest, field));
    }
    expect(refreshed.scripts).toEqual(originalLocal.scripts);
    expect(refreshed.devDependencies).toEqual(originalLocal.devDependencies);
    expect(readFileSync(unselected, 'utf8')).toBe(unselectedBytes);
    expect(snapshot(fixture)).toEqual(schemas);
    expect(run(fixture, 'vendor/formspec-types').status).toBe(0);
  });

  it('refuses drift in every public/runtime field in read mode without changing files', () => {
    const fixture = createFixture();
    const { local } = addPackageFixture(fixture);
    const result = run(fixture, '--write', 'vendor/formspec-types');
    expect(result.status, result.stderr).toBe(0);
    const path = join(local, 'package.json');
    const refreshed = JSON.parse(readFileSync(path, 'utf8'));
    for (const field of publicRuntimeFields) {
      const changed = { ...refreshed, [field]: 'stale' };
      const bytes = `${JSON.stringify(changed)}\n`;
      writeFileSync(path, bytes);
      const check = run(fixture, 'vendor/formspec-types');
      expect(check.status, field).toBe(1);
      expect(check.stderr).toContain(`package.json ${field} differs from upstream public/runtime metadata`);
      expect(readFileSync(path, 'utf8')).toBe(bytes);
    }
  });

  it('retains local metadata when the real TypeScript build fails', () => {
    const fixture = createFixture();
    const { local, source } = addPackageFixture(fixture);
    const before = readFileSync(join(local, 'package.json'), 'utf8');
    writeFileSync(join(source, 'src/index.ts'), 'const broken: string = 42;\n');
    const result = run(fixture, '--write', 'vendor/formspec-types');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Upstream package build failed');
    expect(readFileSync(join(local, 'package.json'), 'utf8')).toBe(before);
  });

  it('refreshes both exact Locale versions while preserving every unselected file and checksum', () => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    const selected = ['locale.schema.json', 'locale-v2.0.schema.json'];
    const result = run(fixture, '--write', ...selected.map((file) => `vendor/formspec-schemas/${file}`));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('0 Apache-2.0 package(s), 2 canonical schema(s)');
    for (const file of selected) {
      expect(readFileSync(join(fixture.local, file), 'utf8')).toBe(sourceContent(file));
    }
    expect(JSON.parse(readFileSync(join(fixture.local, selected[0]), 'utf8')).$id)
      .toBe('https://formspec.org/schemas/locale/2.1');
    expect(JSON.parse(readFileSync(join(fixture.local, selected[1]), 'utf8')).$id)
      .toBe('https://formspec.org/schemas/locale/2.0');
    for (const file of schemaFiles.filter((name) => !selected.includes(name))) {
      expect(readFileSync(join(fixture.local, file), 'utf8')).toBe(before[file]);
    }
    const sums = before.SHA256SUMS.split('\n').map((line) => {
      const file = selected.find((name) => line.endsWith(`  ${name}`));
      return file ? `${hash(sourceContent(file))}  ${file}` : line;
    });
    expect(readFileSync(join(fixture.local, 'SHA256SUMS'), 'utf8').split('\n')).toEqual(sums);
    expect(run(fixture, ...selected.map((file) => `vendor/formspec-schemas/${file}`)).status).toBe(0);
  });

  it('refreshes one schema and its checksum while preserving all other pins without builds', () => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    const result = run(fixture, '--write', selector);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('0 Apache-2.0 package(s), 1 canonical schema(s)');
    expect(readFileSync(join(fixture.local, 'locale.schema.json'), 'utf8'))
      .toBe(sourceContent('locale.schema.json'));
    for (const file of schemaFiles.filter((name) => name !== 'locale.schema.json')) {
      expect(readFileSync(join(fixture.local, file), 'utf8')).toBe(before[file]);
    }
    const oldLines = before.SHA256SUMS.split('\n');
    const newLines = readFileSync(join(fixture.local, 'SHA256SUMS'), 'utf8').split('\n');
    expect(newLines).toEqual(oldLines.map((line) => line.endsWith('  locale.schema.json')
      ? `${hash(sourceContent('locale.schema.json'))}  locale.schema.json` : line));
    expect(run(fixture, selector).status).toBe(0);
  });

  it('checks only the selected upstream bytes and refuses stale selected checksums', () => {
    const fixture = createFixture();
    expect(run(fixture, selector).stderr).toContain('locale.schema.json differs from the upstream schema');
    writeFileSync(join(fixture.local, 'locale.schema.json'), sourceContent('locale.schema.json'));
    const before = snapshot(fixture);
    const result = run(fixture, selector);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SHA256SUMS is stale for locale.schema.json');
    expect(snapshot(fixture)).toEqual(before);
  });

  it.each([
    'vendor/formspec-schemas/unknown.schema.json',
    'vendor/formspec-schemas/../locale.schema.json',
    'vendor/formspec-schemas/./locale.schema.json',
  ])('refuses selector %s before any selected write', (invalid) => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    const result = run(fixture, '--write', selector, invalid);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Not a vendored package');
    expect(snapshot(fixture)).toEqual(before);
  });

  it.each(['missing', 'duplicate'])('refuses a %s checksum slot before copying', (kind) => {
    const fixture = createFixture();
    const sums = readFileSync(join(fixture.local, 'SHA256SUMS'), 'utf8');
    const entry = sums.split('\n').find((line) => line.endsWith('  locale.schema.json'));
    writeFileSync(join(fixture.local, 'SHA256SUMS'), kind === 'missing'
      ? sums.replace(`${entry}\n`, '') : `${sums}${entry}\n`);
    const before = snapshot(fixture);
    const result = run(fixture, '--write', selector);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SHA256SUMS must contain one entry for locale.schema.json');
    expect(snapshot(fixture)).toEqual(before);
  });

  it('preserves the existing whole-schema refresh and verification', () => {
    const fixture = createFixture();
    const result = run(fixture, '--write', 'vendor/formspec-schemas');
    expect(result.status, result.stderr).toBe(0);
    for (const file of schemaFiles) {
      expect(readFileSync(join(fixture.local, file), 'utf8')).toBe(sourceContent(file));
    }
    expect(run(fixture, 'vendor/formspec-schemas').status).toBe(0);
  });

  it('preserves package-only refresh without touching schemas or checksums', () => {
    const fixture = createFixture();
    const source = join(fixture.upstream, 'packages/formspec-types');
    const local = join(fixture.web, 'vendor/formspec-types');
    mkdirSync(join(source, 'src'), { recursive: true });
    mkdirSync(local, { recursive: true });
    mkdirSync(join(fixture.upstream, 'node_modules/.bin'), { recursive: true });
    symlinkSync(join(repoRoot, 'node_modules/.bin/tsc'), join(fixture.upstream, 'node_modules/.bin/tsc'));
    writeFileSync(join(source, 'src/index.ts'), 'export const fixture = 1;\n');
    writeFileSync(join(source, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { declaration: true, module: 'ESNext', target: 'ES2020', skipLibCheck: true },
      include: ['src/**/*.ts'],
    }));
    for (const directory of [source, local]) {
      writeFileSync(join(directory, 'package.json'), '{"license":"Apache-2.0"}\n');
      writeFileSync(join(directory, 'LICENSE'), 'Apache License\nVersion 2.0\n');
    }
    const before = snapshot(fixture);
    const result = run(fixture, '--write', 'vendor/formspec-types');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('1 Apache-2.0 package(s), 0 canonical schema(s)');
    expect(readFileSync(join(local, 'dist/index.js'), 'utf8')).toContain('export const fixture = 1');
    expect(snapshot(fixture)).toEqual(before);
    expect(run(fixture, 'vendor/formspec-types').status).toBe(0);
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'formspec-vendor-selector-'));
  roots.push(root);
  const web = join(root, 'web');
  const upstream = join(root, 'formspec');
  const integrity = join(root, 'integrity');
  const local = join(web, 'vendor/formspec-schemas');
  for (const path of [join(web, 'scripts'), local, join(upstream, 'schemas'), integrity]) {
    mkdirSync(path, { recursive: true });
  }
  cpSync(join(repoRoot, 'scripts/check-surface-bundle-vendor.mjs'), join(web, 'scripts/check-surface-bundle-vendor.mjs'));
  writeFileSync(join(integrity, 'Cargo.toml'), '[workspace.package]\nlicense="Apache-2.0"\n');
  const sums = [];
  for (const file of schemaFiles) {
    const content = `${JSON.stringify({ file, revision: 'pinned' })}\n`;
    writeFileSync(join(local, file), content);
    writeFileSync(join(upstream, 'schemas', file), sourceContent(file));
    sums.push(`${hash(content)}  ${file}`);
  }
  writeFileSync(join(local, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  return { web, upstream, integrity, local };
}

function sourceContent(file) {
  if (file === 'locale.schema.json' || file === 'locale-v2.0.schema.json') {
    const version = file === 'locale.schema.json' ? '2.1' : '2.0';
    return `${JSON.stringify({ $id: `https://formspec.org/schemas/locale/${version}`, file, revision: 'upstream' })}\n`;
  }
  return `${JSON.stringify({ file, revision: 'upstream' })}\n`;
}

function addSourceFixture(fixture) {
  const dir = 'src/adapters/http/source-schemas';
  const upstream = join(fixture.web, '../formspec-server');
  const files = readdirSync(join(repoRoot, dir)).filter(file => file.endsWith('.schema.json'));
  mkdirSync(join(upstream, 'schemas'), { recursive: true });
  mkdirSync(join(fixture.web, dir), { recursive: true });
  for (const file of files) {
    cpSync(join(repoRoot, dir, file), join(upstream, 'schemas', file));
    cpSync(join(repoRoot, dir, file), join(fixture.web, dir, file));
  }
  cpSync(join(repoRoot, dir, 'SHA256SUMS'), join(fixture.web, dir, 'SHA256SUMS'));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Schema Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd: upstream, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  git('init');
  git('add', 'schemas');
  git('commit', '-m', 'Pin producer schemas');
  writeFileSync(join(fixture.web, 'vendor/upstream-refs.json'), JSON.stringify({ formspec: 'unchanged', 'formspec-server': git('rev-parse', 'HEAD') }));
  return { dir, upstream, files, git };
}

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

function snapshot(fixture) {
  return Object.fromEntries(readdirSync(fixture.local).map((file) => [
    file, readFileSync(join(fixture.local, file), 'utf8'),
  ]));
}

function run(fixture, ...args) {
  return spawnSync(process.execPath, [join(fixture.web, 'scripts/check-surface-bundle-vendor.mjs'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORMSPEC_SOURCE_DIR: fixture.upstream,
      INTEGRITY_STACK_SOURCE_DIR: fixture.integrity,
      FORMSPEC_SERVER_SOURCE_DIR: join(fixture.web, '../formspec-server'),
    },
  });
}


const publicRuntimeFields = ['name', 'version', 'description', 'main', 'types', 'exports',
  'files', 'sideEffects', 'dependencies', 'peerDependencies'];

function addPackageFixture(fixture) {
  const source = join(fixture.upstream, 'packages/formspec-types');
  const local = join(fixture.web, 'vendor/formspec-types');
  mkdirSync(join(source, 'src'), { recursive: true });
  mkdirSync(local, { recursive: true });
  mkdirSync(join(fixture.upstream, 'node_modules/.bin'), { recursive: true });
  symlinkSync(join(repoRoot, 'node_modules/.bin/tsc'), join(fixture.upstream, 'node_modules/.bin/tsc'));
  writeFileSync(join(source, 'src/index.ts'), 'export const fixture = 1;\n');
  writeFileSync(join(source, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { declaration: true, module: 'ESNext', target: 'ES2020', skipLibCheck: true },
    include: ['src/**/*.ts'],
  }));
  const sourceManifest = { name: '@fixture/types', version: '2.1.0', description: 'Maintained types',
    main: 'dist/index.js', types: 'dist/index.d.ts', exports: { '.': './dist/index.js' }, files: ['dist'],
    sideEffects: false, dependencies: { 'maintained-runtime': '^2.0.0' }, license: 'Apache-2.0',
    scripts: { build: 'source-only-build' }, devDependencies: { 'source-only-tool': '*' } };
  const originalLocal = { name: '@fixture/old', version: '0.1.0', peerDependencies: { 'retired-peer': '*' },
    scripts: { build: 'vendor-only-build' }, devDependencies: { 'vendor-only-tool': '*' }, license: 'Apache-2.0' };
  writeFileSync(join(source, 'package.json'), JSON.stringify(sourceManifest));
  writeFileSync(join(local, 'package.json'), JSON.stringify(originalLocal));
  for (const directory of [source, local]) writeFileSync(join(directory, 'LICENSE'), 'Apache License\nVersion 2.0\n');
  const unselected = join(fixture.web, 'vendor/formspec-react/package.json');
  mkdirSync(dirname(unselected), { recursive: true });
  const unselectedBytes = '{ "version": "retained-unselected" }\n';
  writeFileSync(unselected, unselectedBytes);
  return { source, sourceManifest, local, originalLocal, unselected, unselectedBytes };
}
