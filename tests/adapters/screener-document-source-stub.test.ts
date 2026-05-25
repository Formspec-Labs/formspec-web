import { describe, expect, it } from 'vitest';
import { stubScreenerDocumentSource } from '../../src/adapters/stub/screener-document-source.ts';
import { ScreenerDocumentNotFoundError } from '../../src/ports/screener-document-source.ts';
import {
  isDemoStubAdapter,
} from '../../src/policy/sentinel.ts';
import {
  demoScreener,
  demoScreenerUrl,
} from '../../src/demo/screener.ts';
import { sampleScreenerDocument } from '../../src/adapter-conformance/index.ts';

describe('stubScreenerDocumentSource', () => {
  it('returns a registered document by URN', async () => {
    const adapter = stubScreenerDocumentSource([demoScreener]);
    const found = await adapter.readScreener({ url: demoScreenerUrl });
    expect(found.url).toBe(demoScreenerUrl);
    expect(found.title).toBe('Which form is right for you?');
  });

  it('throws ScreenerDocumentNotFoundError on URN miss', async () => {
    const adapter = stubScreenerDocumentSource([demoScreener]);
    await expect(
      adapter.readScreener({ url: 'urn:demo:formspec-web:screener:does-not-exist' }),
    ).rejects.toBeInstanceOf(ScreenerDocumentNotFoundError);
  });

  it('registerScreener replaces an existing URN entry', async () => {
    const adapter = stubScreenerDocumentSource([demoScreener]);
    adapter.registerScreener({ ...demoScreener, title: 'Replaced title' });
    const found = await adapter.readScreener({ url: demoScreenerUrl });
    expect(found.title).toBe('Replaced title');
  });

  it('rejects a malformed fixture at registration time', () => {
    const adapter = stubScreenerDocumentSource();
    expect(() =>
      adapter.registerScreener({
        ...sampleScreenerDocument,
        $formspecScreener: '2.0',
      } as never),
    ).toThrow();
  });

  it('clones returned documents — caller mutation does not affect the catalog', async () => {
    const adapter = stubScreenerDocumentSource([demoScreener]);
    const first = await adapter.readScreener({ url: demoScreenerUrl });
    // Mutate the returned object's title; the next read MUST see the original.
    (first as { title: string }).title = 'mutated';
    const second = await adapter.readScreener({ url: demoScreenerUrl });
    expect(second.title).toBe('Which form is right for you?');
  });

  it('clones at register time — caller mutation does not affect the catalog', async () => {
    const adapter = stubScreenerDocumentSource();
    const seed = { ...demoScreener, title: 'Original' };
    adapter.registerScreener(seed);
    seed.title = 'mutated';
    const found = await adapter.readScreener({ url: demoScreenerUrl });
    expect(found.title).toBe('Original');
  });

  it('is marked as a demo-stub adapter', () => {
    const adapter = stubScreenerDocumentSource();
    expect(isDemoStubAdapter(adapter)).toBe(true);
  });
});
