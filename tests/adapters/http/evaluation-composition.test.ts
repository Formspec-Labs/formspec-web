import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ComposedSourcesReceipt, EvaluationHydrationWire, NativeScreenerMappingReceipt } from '../../../src/ports/evaluation-hydration.ts';
import { decodeEvaluationHydrationWire } from '../../../src/adapters/http/evaluation-hydration-wire.ts';
import { hydrationInstant, verifyComposedSources } from '../../../src/adapters/http/evaluation-composition.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import { HttpScreenerHydration } from '../../../src/adapters/http/screener-hydration.ts';
import { createEvaluationInstanceResolver } from '../../../src/shared/evaluation-instance-resolver.ts';
import { hydrationFixture } from './screener-hydration-fixture.ts';

const document = readFileSync(resolve(process.cwd(), 'src/adapters/http/source-schemas/evaluation-composition.schema.json'), 'utf8');
const rawHash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fixture = (name: string): unknown => JSON.parse(readFileSync(resolve(process.cwd(), `tests/fixtures/source-composition-v1/${name}.json`), 'utf8'));
function receipt(view: EvaluationHydrationWire): ComposedSourcesReceipt { return view.providerReceipt as ComposedSourcesReceipt; }
async function rehash(value: ComposedSourcesReceipt) {
  const { receiptHash: _omit, ...preimage } = value;
  Object.assign(value, { receiptHash: await hash(preimage) });
}
async function verifyFixture(value: unknown) {
  const view = decodeEvaluationHydrationWire(value), proof = receipt(view);
  // Static Source fixtures lack original retained run/candidate inputs. This checks composition only.
  return verifyComposedSources({ view, receipt: proof, requestHash: view.requestHash,
    registrationHash: proof.registration.registrationHash, verifyNative: async () => {} });
}
async function composedFixture(options: { allSources?: boolean; parentAge?: number; mutate?: (view: EvaluationHydrationWire) => void | Promise<void> } = {}) {
  const f = await hydrationFixture({ extraSource: options.allSources, taskSource: options.allSources, mutate: options.mutate });
  const owners = f.view.results.map(result => ({ instanceName: result.instanceName, sourceRef: result.sourceRef,
    resolverKind: result.status === 'qualified' ? 'nativeScreenerMapping' : 'unavailable',
    registrationHash: result.status === 'qualified' ? f.receipt.registration.registrationHash : null,
    attachmentMode: 'metadataOnly', executorAdmissionHash: null,
    unavailableReason: result.status === 'qualified' ? null : result.reason }));
  const budgets = { deadlineMillis: 10_000, concurrency: 1, responseBytes: 2 * 1024 * 1024,
    maxEvidenceAgeSeconds: options.parentAge ?? 60, maxValiditySeconds: 60 };
  const descriptor = { version: 1, resolver: 'exactSourceComposition', providerId: 'composer', providerVersion: '1',
    selection: f.view.selection, formVersionHash: f.view.formVersionHash,
    outputSchema: { url: 'urn:formspec:server:evaluation-composition:1', version: '1', hash: rawHash(document), document }, budgets, owners };
  const registrationHash = await hash(descriptor);
  const contributions = await Promise.all(f.view.results.map(async result => ({ instanceName: result.instanceName, sourceRef: result.sourceRef,
    resultHash: await hash(result), receipt: result.status === 'qualified' ? f.receipt : null })));
  const parent: ComposedSourcesReceipt = { kind: 'composedSources', version: 1, purpose: 'formspec.instance.compose',
    registration: { providerId: descriptor.providerId, providerVersion: descriptor.providerVersion, registrationHash,
      outputSchemaHash: descriptor.outputSchema.hash, maxEvidenceAgeSeconds: budgets.maxEvidenceAgeSeconds,
      maxValiditySeconds: budgets.maxValiditySeconds, publicDescriptor: descriptor }, requestHash: f.view.requestHash,
    resolvedAt: f.view.qualifiedAt, validUntil: new Date(Number(hydrationInstant(f.view.qualifiedAt) / 1_000_000n) + budgets.maxEvidenceAgeSeconds * 1000).toISOString(),
    contributions, receiptHash: registrationHash };
  await rehash(parent);
  Object.assign(f.view, { providerReceipt: parent });
  return { ...f, parent, config: { ...f.config, compositionRegistrationHash: registrationHash } };
}

describe('frozen Source composition fixture replay (shape and composition only)', () => {
  it.each(['valid-native-hydration', 'valid-three-source-blocked-hydration'])('accepts %s without claiming original native proof replay', async name => {
    await expect(verifyFixture(fixture(name))).resolves.toBe(300_000);
  });
  it.each([0, 1, 2, 3, 4, 5, 6])('refuses actual negative fixture %s', async index => {
    await expect(verifyFixture(fixture(`invalid-native-hydration-${index}`))).rejects.toThrow();
  });
  it('decodes only Hydration, never the other two valid root shapes', () => {
    const view = decodeEvaluationHydrationWire(fixture('valid-native-hydration'));
    expect(() => decodeEvaluationHydrationWire(view.providerReceipt)).toThrow();
    const resolved = { requestHash: view.requestHash, results: view.results, providerReceipt: view.providerReceipt };
    expect(() => decodeEvaluationHydrationWire(resolved)).toThrow();
  });
});

describe('independently pinned composed candidate HTTP hydration', () => {
  it('loads qualified native false data through the existing public resolver', async () => {
    const f = await composedFixture();
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    context.assertReady();
    await expect(createEvaluationInstanceResolver(context)({ instanceName: 'facts', source: 'screening', readonly: true, static: false,
      definition: { url: 'urn:test:form', version: '1.0.0' } }, { signal: new AbortController().signal }))
      .resolves.toMatchObject({ status: 'loaded', value: { eligible: false } });
    expect(f.requests[0].body).toEqual({ draftVersion: 3, candidateHash: await hash(f.input.saved.response) });
  });
  it('preserves all three sources and blocks readiness with honest task and photo Unavailable', async () => {
    const f = await composedFixture({ allSources: true });
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    expect(context.view.results.map(value => value.status)).toEqual(['qualified', 'unavailable', 'unavailable']);
    expect(() => context.assertReady()).toThrow('required source unavailable');
  });
  it.each(['absent', 'foreign', 'legacy downgrade'] as const)('refuses %s composition authority', async mode => {
    const f = await composedFixture();
    if (mode === 'absent') Reflect.deleteProperty(f.config, 'compositionRegistrationHash');
    if (mode === 'foreign') f.config.compositionRegistrationHash = `sha256:${'b'.repeat(64)}`;
    if (mode === 'legacy downgrade') Object.assign(f.view, { providerReceipt: f.receipt });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow();
  });
  it.each(['coverage', 'result hash', 'complete result digest', 'deadline', 'null leaf', 'leaf registration', 'unavailable reason', 'result order'] as const)('refuses independently rehashed %s drift', async mode => {
    const f = await composedFixture({ allSources: true, mutate: async view => {
      const parent = receipt(view);
      if (mode === 'coverage') Object.assign(parent, { contributions: [parent.contributions[0], parent.contributions[0], parent.contributions[2]] });
      if (mode === 'complete result digest') Object.assign(parent.contributions[0], { resultHash: `sha256:${'b'.repeat(64)}` });
      if (mode === 'result hash') Object.assign(view.results[0], { data: { eligible: true } });
      if (mode === 'deadline') Object.assign(parent, { validUntil: '2026-10-09T12:01:01Z' });
      if (mode === 'null leaf') Object.assign(parent.contributions[0], { receipt: null });
      if (mode === 'leaf registration') Object.assign(parent.contributions[0].receipt!.registration, { registrationHash: `sha256:${'b'.repeat(64)}` });
      if (mode === 'unavailable reason') Object.assign(view.results[1], { reason: 'different' });
      if (mode === 'result order') Object.assign(view, { results: [view.results[1], view.results[0], view.results[2]] });
      if (['result hash', 'unavailable reason'].includes(mode)) {
        for (let i = 0; i < view.results.length; i++) Object.assign(parent.contributions[i], { resultHash: await hash(view.results[i]) });
      }
      await rehash(parent);
    } });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow();
  });
  it('preserves the original mapping pin even when a changed leaf and parent are consistently repinned', async () => {
    const f = await composedFixture();
    const leaf = f.receipt, descriptor = leaf.registration.publicDescriptor;
    Object.assign(descriptor, { providerVersion: 'changed' });
    Object.assign(leaf.registration, { providerVersion: 'changed', registrationHash: await hash(descriptor) });
    const { receiptHash: _omit, ...leafPreimage } = leaf;
    Object.assign(leaf, { receiptHash: await hash(leafPreimage) });
    const parentDescriptor = f.parent.registration.publicDescriptor;
    Object.assign((parentDescriptor.owners as object[])[0], { registrationHash: leaf.registration.registrationHash });
    const parentPin = await hash(parentDescriptor);
    Object.assign(f.parent.registration, { registrationHash: parentPin });
    f.config.compositionRegistrationHash = parentPin;
    await rehash(f.parent);
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('original policy');
  });
  it('uses the shorter parent age and permanently retires installed facts at that deadline', async () => {
    const f = await composedFixture({ parentAge: 20 });
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    f.setElapsed(19_999); context.assertReady();
    f.setElapsed(20_000); expect(() => context.assertCurrent()).toThrow('expired');
    f.setElapsed(0); expect(() => context.assertCurrent()).toThrow('expired');
  });
  it('counts credential delay before the same parent deadline', async () => {
    const f = await composedFixture({ parentAge: 20 });
    f.config.accessToken.mockImplementation(async () => { f.setElapsed(20_000); return 'token'; });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('expired');
  });
  it('does not install facts after owner retirement during transport', async () => {
    let retired = false;
    const f = await composedFixture({ mutate: () => { retired = true; } });
    f.input.assertCurrent.mockImplementation(() => { if (retired) throw new Error('owner retired'); });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('owner retired');
  });
  it('retains null validity only when no source is qualified', async () => {
    const f = await composedFixture({ mutate: async view => {
      const parent = receipt(view);
      Object.assign(view, { results: [{ status: 'unavailable', instanceName: 'facts', sourceRef: 'screening', reason: 'no proof' }] });
      Object.assign(parent.contributions[0], { receipt: null, resultHash: await hash(view.results[0]) });
      Object.assign(parent, { validUntil: null });
      await rehash(parent);
    } });
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    expect(() => context.assertReady()).toThrow('required source unavailable');
  });
  it('enforces the selected smaller response budget after a consistently repinned policy change', async () => {
    const f = await composedFixture();
    const descriptor = f.parent.registration.publicDescriptor;
    Object.assign(descriptor.budgets as object, { responseBytes: 100 });
    const pin = await hash(descriptor);
    Object.assign(f.parent.registration, { registrationHash: pin });
    f.config.compositionRegistrationHash = pin;
    await rehash(f.parent);
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('byte budget');
  });
  it('compares equivalent UTC instants while preserving original strings in the result hash', async () => {
    const f = await composedFixture({ mutate: async view => {
      Object.assign(view.results[0], { issuedAt: '2026-10-09T12:00:00.000+00:00', expiresAt: '2026-10-09T12:01:00.000Z' });
      Object.assign(receipt(view).contributions[0], { resultHash: await hash(view.results[0]) });
      await rehash(receipt(view));
    } });
    (await new HttpScreenerHydration(f.config).hydrate(f.input)).assertReady();
    expect(hydrationInstant('2026-10-09T12:00:00.000001Z') - hydrationInstant('2026-10-09T12:00:00Z')).toBe(1_000n);
    expect(() => hydrationInstant('2026-10-09T12:00:00.0000000001Z')).toThrow('precision');
  });
  it('does not truncate nanosecond qualification time or accept an extended submillisecond deadline', async () => {
    const f = await composedFixture({ mutate: async view => {
      Object.assign(view, { qualifiedAt: '2026-10-09T12:00:59.998999999Z' });
    } });
    const context = await new HttpScreenerHydration(f.config).hydrate(f.input);
    context.assertReady();
    f.setElapsed(1); expect(() => context.assertCurrent()).toThrow('expired');
    const extended = await composedFixture({ mutate: async view => {
      Object.assign(receipt(view), { validUntil: '2026-10-09T12:01:00.000000001Z' });
      await rehash(receipt(view));
    } });
    await expect(new HttpScreenerHydration(extended.config).hydrate(extended.input)).rejects.toThrow('shared deadline');
  });
  it('never qualifies native child facts solely from the parent descriptor', async () => {
    const f = await composedFixture({ mutate: async view => {
      const parent = receipt(view), leaf = parent.contributions[0].receipt as NativeScreenerMappingReceipt;
      Object.assign(leaf.proof.association, { runRevision: 2 });
      const { receiptHash: _omit, ...preimage } = leaf;
      Object.assign(leaf, { receiptHash: await hash(preimage) });
      await rehash(parent);
    } });
    await expect(new HttpScreenerHydration(f.config).hydrate(f.input)).rejects.toThrow('original policy');
  });
});
