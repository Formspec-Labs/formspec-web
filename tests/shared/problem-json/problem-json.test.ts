import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertProblemJson, isProblemJson } from '../../../src/shared/problem-json.ts';

describe('Problem JSON mirror', () => {
  it('matches stack-common error.schema.json byte-for-byte', () => {
    const local = readFileSync('src/shared/problem-json.schema.json', 'utf8');
    const upstream = readFileSync('../stack-common/schemas/error.schema.json', 'utf8');
    expect(local).toBe(upstream);
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
