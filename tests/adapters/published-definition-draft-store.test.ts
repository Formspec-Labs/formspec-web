import { describe, expect, it, vi } from 'vitest';
import { publishedDefinitionDraftStore } from '../../src/adapters/composing/published-definition-draft-store.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { sampleFormDefinition, sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';

describe('published definition guard', () => {
  it('retains the supplied dispatch assertion while publication reads await, despite caller mutation', async () => {
    const store = stubDraftStore(); let release!: () => void;
    const awaited = new Promise<void>(resolve => { release = resolve; });
    const guarded = publishedDefinitionDraftStore(store, async () => { await awaited; return sampleFormDefinition; }, async () => sampleFormDefinition);
    const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version };
    const options: { assertBeforeDispatch: () => void } = { assertBeforeDispatch: () => { throw new Error('facts retired'); } };
    const saving = guarded.save(key, sampleFormResponse, options); options.assertBeforeDispatch = () => {};
    const refused = expect(saving).rejects.toThrow('facts retired'); release(); await refused;
    expect(await store.load(key)).toBeUndefined();
  });
  it('refuses an async dispatch assertion before stub persistence', async () => {
    const store = stubDraftStore(); const key = { formUrl: sampleFormDefinition.url };
    await expect(store.save(key, sampleFormResponse, { assertBeforeDispatch: async () => {} })).rejects.toThrow('synchronous');
    expect(await store.load(key)).toBeUndefined();
  });

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
