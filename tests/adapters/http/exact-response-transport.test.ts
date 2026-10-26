import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalResponseHandoffBytes, parseJsonExact } from '@formspec-org/integrity-canonical';
import { HttpClient } from '../../../src/adapters/http/http-client.ts';
import { HttpDraftStore } from '../../../src/adapters/http/draft-store.ts';
import { createDraftBindingRegistry } from '../../../src/adapters/http/draft-binding-registry.ts';
import { sampleFormDefinition, sampleFormResponse } from '../../../src/adapter-conformance/fixtures.ts';

const hash = (value: unknown) => createHash('sha256').update(canonicalResponseHandoffBytes(value)).digest('hex');
// Numeric tokens are authored as text; a JS number cannot supply these inputs.
const responseText = JSON.stringify({ ...sampleFormResponse, id: 'exact-api-response' })
  .replace('"Ada Lovelace"', '"Ada Lovelace","amount":1234567890.123456789,"count":9007199254740993');
const wire = `{"draft_id":"exact-draft","draft_version":2,"canonical_response":${responseText},"draft_state":${responseText.match(/"data":(\{[^}]*\})/)![1]}}`;
const fetchImpl = async () => new Response(wire, { headers: { 'content-type': 'application/json' } });

describe('exact Response transport', () => {
  it('keeps raw numeric tokens through the actual JSON transport', async () => {
    const client = new HttpClient({ baseUrl: 'https://source.test', fetchImpl });
    const result = await client.getJson<{ canonical_response: unknown }>('/drafts/exact-draft');
    expect(hash(result.canonical_response)).toBe(hash(parseJsonExact(responseText)));
    expect(hash(JSON.parse(responseText))).not.toBe(hash(parseJsonExact(responseText)));
    expect(JSON.stringify(result.canonical_response)).toContain('1234567890.123456789');
    expect(JSON.stringify(result.canonical_response)).toContain('9007199254740993');
  });

  it('keeps exact numbers through draft validation, snapshotting and the retained binding', async () => {
    const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version, subjectRef: 'exact-owner' };
    const bindings = createDraftBindingRegistry();
    bindings.put(key, { draftId: 'exact-draft', draftVersion: 1 });
    let savedText = '';
    const store = new HttpDraftStore({ baseUrl: 'https://source.test', fetchImpl: async (_input, init) => {
      if (init?.method === 'PATCH') savedText = String(init.body);
      return fetchImpl();
    }, bindingRegistry: bindings });
    const loaded = await store.load(key);
    expect(hash(loaded)).toBe(hash(parseJsonExact(responseText)));
    expect(hash(bindings.get(key)!.response)).toBe(hash(parseJsonExact(responseText)));
    await store.save(key, loaded!);
    const saved = parseJsonExact(savedText) as { canonical_response: unknown };
    expect(hash(saved.canonical_response)).toBe(hash(parseJsonExact(responseText)));
    expect(savedText).toContain('1234567890.123456789');
    expect(savedText).toContain('9007199254740993');
    expect(hash(bindings.get(key)!.response)).toBe(hash(parseJsonExact(responseText)));
  });

  it('retains the exact canonical Response when Source supplies its rounded display answers', async () => {
    const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version, subjectRef: 'exact-owner' };
    const bindings = createDraftBindingRegistry();
    bindings.put(key, { draftId: 'exact-draft', draftVersion: 1 });
    const display = JSON.parse(responseText).data;
    const sourceWire = `{"draft_id":"exact-draft","draft_version":2,"canonical_response":${responseText},"draft_state":${JSON.stringify(display)}}`;
    const store = new HttpDraftStore({ baseUrl: 'https://source.test', bindingRegistry: bindings,
      fetchImpl: async () => new Response(sourceWire, { headers: { 'content-type': 'application/json' } }) });
    expect(hash(await store.load(key))).toBe(hash(parseJsonExact(responseText)));
  });
});
