import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(repoRoot, 'scripts/check-bundle-budget.mjs');
const budgetBytes = 200 * 1024;
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-bundle-budget', () => {
  it('accepts an entry and code-split chunks inside their budgets', () => {
    const result = runCheck(createFixture({
      initial: { 'index-aaa.js': budgetBytes - 4096 },
      lazy: { 'surface-bbb.js': budgetBytes - 4096, 'schemas-ccc.js': budgetBytes - 8192 },
    }));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('bundle budget check passed');
  });

  it('reports every chunk with its remaining headroom', () => {
    const result = runCheck(createFixture({
      initial: { 'index-aaa.js': 64 * 1024 },
      lazy: { 'surface-bbb.js': 128 * 1024 },
    }));

    expect(result.stdout).toMatch(/initial\s+64\.0 KiB gzip \(136\.0 KiB headroom\)\s+index-aaa\.js/);
    expect(result.stdout).toMatch(/lazy\s+128\.0 KiB gzip \(72\.0 KiB headroom\)\s+surface-bbb\.js/);
  });

  // The budget exists to force splitting or deferral, never a larger number.
  // These two cases are the pin: raising either limit turns them green.
  it('rejects an entry over the 200 KiB gzip budget', () => {
    const result = runCheck(createFixture({
      initial: { 'index-aaa.js': budgetBytes + 4096 },
      lazy: {},
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('initial JS is 204.0 KiB gzip, limit 200.0 KiB');
  });

  it('rejects one code-split chunk over the 200 KiB gzip budget', () => {
    const result = runCheck(createFixture({
      initial: { 'index-aaa.js': 32 * 1024 },
      lazy: { 'small-bbb.js': 16 * 1024, 'surface-ccc.js': budgetBytes + 8192 },
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lazy JS chunk over 200.0 KiB: surface-ccc.js=208.0 KiB gzip');
    expect(result.stderr).not.toContain('small-bbb.js');
  });

  it('sums the entry assets rather than budgeting them one at a time', () => {
    const result = runCheck(createFixture({
      initial: { 'index-aaa.js': 128 * 1024, 'vendor-bbb.js': 128 * 1024 },
      lazy: {},
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('initial JS is 256.0 KiB gzip');
  });

  it('rejects a build whose index.html loads no JS at all', () => {
    const root = createFixture({ initial: {}, lazy: { 'orphan-aaa.js': 1024 } });

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no initial JS assets found in dist/index.html');
  });
});

function runCheck(root) {
  return spawnSync('node', [scriptPath, '--root', root], { encoding: 'utf8' });
}

/**
 * Build a `dist/` whose assets gzip to the requested sizes.
 *
 * The check measures gzipped bytes, so fixture content is random: it does not
 * compress, which makes the on-disk size the gzipped size to within a header.
 */
function createFixture({ initial, lazy }) {
  const root = mkdtempSync(join(tmpdir(), 'formspec-web-bundle-budget-'));
  tempRoots.push(root);
  mkdirSync(join(root, 'dist/assets'), { recursive: true });

  for (const [name, gzipBytes] of Object.entries({ ...initial, ...lazy })) {
    writeFileSync(join(root, 'dist/assets', name), incompressibleBytes(gzipBytes));
  }

  const tags = Object.keys(initial)
    .map((name) => `    <script type="module" crossorigin src="/assets/${name}"></script>`)
    .join('\n');
  writeFileSync(
    join(root, 'dist/index.html'),
    `<!doctype html>\n<html>\n  <head>\n${tags}\n  </head>\n  <body></body>\n</html>\n`,
  );

  return root;
}

function incompressibleBytes(gzipBytes) {
  let content = randomBytes(gzipBytes);
  // Gzip adds a small constant frame; trim until the compressed size lands on
  // the requested budget exactly, so the assertions can quote KiB figures.
  while (gzipSync(content).byteLength > gzipBytes) {
    content = content.subarray(0, content.byteLength - 64);
  }
  return content;
}

function randomBytes(length) {
  const bytes = Buffer.alloc(length);
  let state = 0x2545f491;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}
