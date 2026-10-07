import { describe, expect, it, vi } from 'vitest';
import { publishedDefinitionDraftStore } from '../../src/adapters/composing/published-definition-draft-store.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { sampleFormDefinition, sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';

describe('published definition guard', () => {
  it('refuses answers under a different published version before creating a draft', async () => {
    const store = stubDraftStore(); const save = vi.spyOn(store, 'save');
    const guarded = publishedDefinitionDraftStore(store, async () => sampleFormDefinition, async () => ({ ...sampleFormDefinition, version: 'different' }));
    await expect(guarded.save({ formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version }, sampleFormResponse)).rejects.toThrow('differs from the published form');
    expect(save).not.toHaveBeenCalled();
  });
  it('allows equal content despite JSON property order differences', async () => {
    const store = stubDraftStore(); const save = vi.spyOn(store, 'save');
    const reversed = Object.fromEntries(Object.entries(sampleFormDefinition).reverse()) as typeof sampleFormDefinition;
    const guarded = publishedDefinitionDraftStore(store, async () => sampleFormDefinition, async () => reversed);
    await guarded.save({ formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version }, sampleFormResponse);
    expect(save).toHaveBeenCalledOnce();
  });
});
