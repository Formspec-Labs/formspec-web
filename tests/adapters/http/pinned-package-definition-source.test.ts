import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { PinnedPackageDefinitionSource } from '../../../src/adapters/http/pinned-package-definition-source.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';

afterEach(() => vi.unstubAllGlobals());

describe('PinnedPackageDefinitionSource', () => {
  it('preserves authored data and shares the verified load across consumers', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const bytes = JSON.stringify(sampleFormDefinition);
    const sha256 = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes)))].map(b => b.toString(16).padStart(2, '0')).join('');
    const fetch = vi.fn(async (url: URL) => new Response(url.pathname.endsWith('package.json')
      ? JSON.stringify({ files: { definition: { path: 'definition.json', sha256 } } }) : bytes));
    vi.stubGlobal('fetch', fetch);
    const source = new PinnedPackageDefinitionSource('/package.json');
    const [definition, locales] = await Promise.all([source.getDefinition(), source.getLocaleDocuments()]);
    expect(definition).toEqual(sampleFormDefinition);
    expect(locales).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses altered file bytes before the form can load', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', async (url: URL) => new Response(url.pathname.endsWith('package.json')
      ? JSON.stringify({ files: { definition: { path: 'definition.json', sha256: 'wrong' } } })
      : JSON.stringify(sampleFormDefinition)));
    await expect(new PinnedPackageDefinitionSource('/package.json').getDefinition()).rejects.toThrow('Package hash mismatch');
  });

  it('refuses a cross-origin package source', async () => {
    await expect(new PinnedPackageDefinitionSource('https://other.example/package.json').getDefinition()).rejects.toThrow('this app origin');
  });
});
