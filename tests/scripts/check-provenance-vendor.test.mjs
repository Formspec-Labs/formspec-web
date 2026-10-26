import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const stackRoot = resolve(repoRoot, '..');
const run = env => spawnSync(process.execPath, [join(repoRoot, 'scripts/check-provenance-vendor.mjs')],
  { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, ...env } });

describe('check-provenance-vendor', () => {
  it('fails, not skips, when FORMSPEC_STACK_DIR lacks a pinned source', () => {
    const empty = mkdtempSync(join(tmpdir(), 'provenance-vendor-'));
    try {
      const result = run({ FORMSPEC_STACK_DIR: empty });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('is missing under FORMSPEC_STACK_DIR');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it.skipIf(!existsSync(join(stackRoot, 'stack-common')))('compares every pinned file with the stack sources', () => {
    const result = run({ FORMSPEC_STACK_DIR: stackRoot });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/(\d+) pinned file\(s\), \1 compared/);
  });
});
