import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { canonicalResponseHandoffBytes, parseJsonExact } from '@formspec-org/integrity-canonical';
import type { FormResponse } from '@formspec-org/types';
import { responseHash, ResponseHashUnavailableError } from '../../src/app/respondent-flow.ts';
import vectors from '../fixtures/response-handoff/vectors.json';

afterEach(() => vi.unstubAllGlobals());

describe('maintained canonical full-Response handoff hash', () => {
  it.each(vectors.valid)('matches the shared Rust bytes and SHA-256 for $name', async vector => {
    vi.stubGlobal('crypto', webcrypto);
    for (const input of vector.inputJson) {
      // parseJsonExact keeps the digits a JS number cannot hold, as the server's text does.
      const value = parseJsonExact(input) as FormResponse;
      const bytes = canonicalResponseHandoffBytes(value);
      expect(Buffer.from(bytes).toString('hex')).toBe(vector.bytesHex);
      expect(await responseHash(value)).toBe(`sha256:${vector.sha256}`);
    }
  });

  it('refuses missing crypto instead of advertising a noncryptographic SHA-256', async () => {
    vi.stubGlobal('crypto', {});
    await expect(responseHash({} as FormResponse)).rejects.toBeInstanceOf(ResponseHashUnavailableError);
  });

  it('refuses invalid Unicode through the maintained canonicalizer', async () => {
    vi.stubGlobal('crypto', webcrypto);
    await expect(responseHash({ data: { text: '\ud800' } } as unknown as FormResponse)).rejects.toThrow();
  });
});
