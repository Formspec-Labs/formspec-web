import { describe, expect, it } from 'vitest';
import { HttpScreenerHydration } from '../../../src/adapters/http/screener-hydration.ts';
import { createEvaluationInstanceResolver } from '../../../src/shared/evaluation-instance-resolver.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import { hydrationFixture } from './screener-hydration-fixture.ts';
import type { NativeScreenerMappingReceipt } from '../../../src/ports/evaluation-hydration.ts';

async function rehashReceipt(receipt: NativeScreenerMappingReceipt) {
  const { receiptHash: _remove, ...preimage } = receipt;
  Object.assign(receipt, { receiptHash: await hash(preimage) });
}
describe('authenticated native Screener candidate hydration', () => {
  it('posts the exact unsigned saved revision, verifies frozen Source context and loads false facts only through the public resolver', async () => {
    const f = await hydrationFixture();
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    expect(f.requests[0].url).toBe('https://source.example/drafts/draft%2Fid/evaluation-instances');
    expect(f.requests[0].body).toEqual({ draftVersion: 3, candidateHash: await hash(f.input.saved.response) });
    expect(f.requests[0].headers.get('authorization')).toBe('Bearer owner-token');
    expect(f.requests[0].headers.has('idempotency-key')).toBe(false);
    expect(Object.isFrozen(context.view.results[0])).toBe(true);
    context.assertReady();
    const resolve = createEvaluationInstanceResolver(context);
    await expect(resolve({ instanceName: 'facts', source: 'screening', readonly: true, static: false,
      definition: { url: 'urn:test:form', version: '1.0.0' } }, { signal: new AbortController().signal })).resolves.toMatchObject({ status: 'loaded', value: { eligible: false } });
  });

  it('keeps other selected sources explicitly unavailable and refuses readiness', async () => {
    const f = await hydrationFixture({ extraSource: true });
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    expect(() => context.assertReady()).toThrow();
    expect(context.view.results[1]).toMatchObject({ status: 'unavailable', instanceName: 'photo' });
  });

  it.each(['owner', 'publication', 'revision', 'candidate', 'mapping pin', 'response URL', 'response version', 'draft state'])('refuses local %s mismatch before credentials', async mode => {
    const f = await hydrationFixture();
    if (mode === 'owner') Object.assign(f.input.identity, { subject: 'other' });
    if (mode === 'publication') Object.assign(f.input.saved.evidence, { form_version_id: 'other' });
    if (mode === 'revision') Object.assign(f.input.saved.draft, { version: 4 });
    if (mode === 'candidate') f.input.saved.response.data.flag = true;
    if (mode === 'response URL') Object.assign(f.input.saved.response, { definitionUrl: 'urn:other' });
    if (mode === 'response version') Object.assign(f.input.saved.response, { definitionVersion: '2' });
    if (mode === 'draft state') Object.assign(f.input.saved.evidence, { draft_state: { flag: true } });
    if (mode === 'mapping pin') Object.assign(f.config.selection, { instanceMappingHash: `sha256:${'b'.repeat(64)}` });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow();
    expect(f.accessToken).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
  });

  it.each(['owner', 'request hash', 'candidate', 'data', 'receipt hash', 'result coverage', 'proof revision', 'original policy', 'schema whitespace', 'provider attribution'])('refuses returned %s drift', async mode => {
    const f = await hydrationFixture({ mutate: async view => {
      const receipt = view.providerReceipt as NativeScreenerMappingReceipt;
      if (mode === 'owner') Object.assign(view.owner.authenticated!, { subject: 'other' });
      if (mode === 'request hash') Object.assign(view, { requestHash: `sha256:${'b'.repeat(64)}` });
      if (mode === 'candidate') Object.assign(view, { candidateHash: `sha256:${'b'.repeat(64)}` });
      if (mode === 'data') Object.assign(view.results[0], { data: { eligible: true } });
      if (mode === 'receipt hash') Object.assign(receipt, { receiptHash: `sha256:${'b'.repeat(64)}` });
      if (mode === 'result coverage') Object.assign(view, { results: [view.results[0], view.results[0]] });
      if (mode === 'proof revision') Object.assign(receipt.proof.association, { draftVersion: 4 });
      if (mode === 'original policy') { Object.assign(receipt.registration.publicDescriptor, { providerVersion: '2' }); Object.assign(receipt.registration, { registrationHash: await hash(receipt.registration.publicDescriptor) }); }
      if (mode === 'schema whitespace') {
        const schema = receipt.registration.publicDescriptor.outputSchema as { document: string };
        schema.document += ' ';
        Object.assign(receipt.registration, { registrationHash: await hash(receipt.registration.publicDescriptor) });
      }
      if (mode === 'provider attribution') Object.assign(receipt.registration, { providerId: 'other' });
      if (!['receipt hash', 'request hash', 'candidate', 'data', 'result coverage', 'owner'].includes(mode)) await rehashReceipt(receipt);
    } });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow();
  });

  it('refuses an already signed candidate before credentials', async () => {
    const f = await hydrationFixture();
    Object.assign(f.input.saved.response, { authoredSignatures: [{}] });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('local candidate');
    expect(f.accessToken).not.toHaveBeenCalled();
  });

  it('refuses owner invalidation while credentials are pending before dispatch', async () => {
    const f = await hydrationFixture();
    f.config.accessToken.mockImplementation(async () => {
      f.input.assertCurrent.mockImplementation(() => { throw new Error('owner retired'); });
      return 'owner-token';
    });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('owner retired');
    expect(f.requests).toHaveLength(0);
  });

  it.each(['pending', 'unavailable'] as const)('preserves null-receipt %s without readiness or loaded facts', async status => {
    const f = await hydrationFixture({ mutate: view => {
      Object.assign(view, { providerReceipt: null, results: [{ instanceName: 'facts', sourceRef: 'screening', status, reason: 'not-qualified' }] });
    } });
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    expect(() => context.assertReady()).toThrow('unavailable');
    await expect(createEvaluationInstanceResolver(context)({ instanceName: 'facts', source: 'screening', readonly: true,
      static: false, definition: { url: 'urn:test:form', version: '1.0.0' } }, { signal: new AbortController().signal })).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('refuses qualified facts without a receipt and an additional qualified source', async () => {
    const missing = await hydrationFixture({ mutate: view => { Object.assign(view, { providerReceipt: null }); } });
    await expect(new HttpScreenerHydration(missing.config).hydrate(missing.input)).rejects.toThrow('lack receipt');
    const extra = await hydrationFixture({ extraSource: true, mutate: view => {
      Object.assign(view, { results: [view.results[0], { ...view.results[0], instanceName: 'photo', sourceRef: 'photo' }] });
    } });
    await expect(new HttpScreenerHydration(extra.config).hydrate(extra.input)).rejects.toThrow('qualified result');
  });

  it('rejects a parsed-schema JCS digest even when original policy and receipt consistently pin it', async () => {
    const original = await hydrationFixture();
    const schema = original.receipt.registration.publicDescriptor.outputSchema as { document: string };
    const f = await hydrationFixture({ outputSchemaHash: await hash(JSON.parse(schema.document)) });
    expect(f.receipt.registration.outputSchemaHash).not.toBe(original.receipt.registration.outputSchemaHash);
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('original policy');
  });

  it('anchors freshness before held credentials and preserves the same returned proof without extending expiry', async () => {
    const f = await hydrationFixture();
    f.config.accessToken.mockImplementation(async () => { f.setElapsed(60_001); return 'owner-token'; });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('expired');
    expect(f.requests).toHaveLength(1);
  });

  it('retires installed context and resolver when owner generation changes or local elapsed freshness expires', async () => {
    const f = await hydrationFixture();
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    f.setElapsed(60_001); expect(() => context.assertReady()).toThrow('expired');
    f.setElapsed(0); expect(() => context.assertCurrent()).toThrow('expired');
    const owner = await hydrationFixture();
    const owned = await new HttpScreenerHydration(owner.config).hydrate(owner.input);
    owner.input.assertCurrent.mockImplementation(() => { throw new Error('owner retired'); });
    expect(() => owned.assertCurrent()).toThrow('owner retired');
  });

  it('permanently retires a context on a backwards clock observation', async () => {
    const f = await hydrationFixture();
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    f.setElapsed(30_000); context.assertCurrent();
    f.setElapsed(20_000); expect(() => context.assertCurrent()).toThrow('clock mismatch');
    f.setElapsed(40_000); expect(() => context.assertCurrent()).toThrow('clock mismatch');
  });

  it('preserves returned reference order while checking whole-reference multiplicity across numeric/unicode keys', async () => {
    const a = { kind: 'attachment-ref', uri: 'urn:formspec:attachment:a' };
    const b = { contentType: 'image/jpeg', data: 'opaque', nested: a };
    const f = await hydrationFixture({ data: { '2': a, '10': b, '\uE000': a, '\u{10000}': a }, mutate: view => {
      Object.assign(view, { attachmentBindings: [b, a, a, a] });
    } });
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    expect(context.view.attachmentBindings).toEqual([b, a, a, a]);
    const missing = await hydrationFixture({ data: { values: [a, a] }, mutate: view => { Object.assign(view, { attachmentBindings: [a] }); } });
    await expect(new HttpScreenerHydration(missing.config).hydrate(missing.input)).rejects.toThrow('attachment');
  });

  it('refuses resolver source, Definition or readonly mismatch without fallback fetch', async () => {
    const f = await hydrationFixture();
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    const resolve = createEvaluationInstanceResolver(context);
    const request = { instanceName: 'facts', source: 'screening', readonly: true, static: false, definition: { url: 'urn:test:form', version: '1.0.0' } };
    for (const changed of [{ ...request, source: 'https://unselected.example/facts' }, { ...request, readonly: false }, { ...request, definition: { url: 'urn:other', version: '1.0.0' } }]) {
      await expect(resolve(changed, { signal: new AbortController().signal })).resolves.toMatchObject({ status: 'unavailable' });
    }
    expect(f.requests).toHaveLength(1);
  });
});
