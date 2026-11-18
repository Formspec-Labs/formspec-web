import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

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

  it('validates the native agent declaration using only pinned schemas', () => {
    const dir = join(repoRoot, 'vendor/wos-api');
    const read = file => JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    for (const file of Object.keys(read('provenance.json').files)) ajv.addSchema(read(file));

    const governance = read('governance.schema.json');
    const validate = ajv.getSchema(governance.$id + '#/$defs/AgentView');
    const agent = {
      id: 'screenEligibility',
      workflowUrl: 'https://workflow.test/current',
      declaration: {
        id: 'screenEligibility',
        agentType: 'deterministic',
        modelIdentifier: 'screening',
        modelVersion: '1.0.0',
      },
    };
    expect(validate(agent)).toBe(true);
    expect(validate({ ...agent, declaration: {} })).toBe(false);
  });

  it.skipIf(!existsSync(join(stackRoot, 'stack-common')))('compares every pinned file with the stack sources', () => {
    const result = run({ FORMSPEC_STACK_DIR: stackRoot });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/(\d+) pinned file\(s\), \1 compared/);
  });
});
