import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertProblemJson, isProblemJson } from '../../../src/shared/problem-json.ts';

// The schema is owned by the private `stack-common` sibling; `src/shared/problem-json.schema.json`
// is its vendored copy. The byte-for-byte check runs wherever that sibling is checked out (the
// stack, or STACK_COMMON_SOURCE_DIR) and is reported as skipped in a lone checkout such as CI —
// the same posture as scripts/check-surface-bundle-vendor.mjs.
const upstreamSchema = resolve(
  process.env.STACK_COMMON_SOURCE_DIR ?? '../stack-common',
  'schemas/error.schema.json',
);

describe('Problem JSON mirror', () => {
  it.skipIf(!existsSync(upstreamSchema))('matches stack-common error.schema.json byte-for-byte', () => {
    const local = readFileSync('src/shared/problem-json.schema.json', 'utf8');
    expect(local).toBe(readFileSync(upstreamSchema, 'utf8'));
  });

  it('requires error_code and rejects legacy code', () => {
    expect(
      isProblemJson({
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        error_code: 'FORMSPEC-4001',
      }),
    ).toBe(true);
    expect(
      isProblemJson({
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        code: 'FORMSPEC-4001',
      }),
    ).toBe(false);
  });

  it('throws on invalid problem shapes', () => {
    expect(() => assertProblemJson({ title: 'Invalid request', status: 400 })).toThrow();
  });
});
