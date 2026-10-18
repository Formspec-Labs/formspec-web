import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { MixedProofWorkerClient } from '../../../src/adapters/source-worker/general-client.ts';
import { attachMixedProofWorker } from '../../../src/adapters/source-worker/general-worker.ts';
import type { MixedProofCommand, SourceMixedProofApi } from '../../../src/adapters/source-worker/general-protocol.ts';
import type { ProofWorker } from '../../../src/adapters/source-worker/protocol.ts';
import { HttpMixedProofReader } from '../../../src/adapters/http/mixed-proof-reader.ts';
import { decodeMixedHydration } from '../../../src/adapters/http/mixed-proof-wire.ts';
import { otherScopeKey } from '../../fixtures/scope.ts';
import type { InitialNativeRequest } from '../../../src/ports/initial-mixed-proof.ts';
const expectedIssuer = 'https://Source.test/independent/scope/';
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function fixture(phase: 'initial' | 'task') {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/mixed-proof-transport-v1', `hydrate-${phase}`);
  const read = (file: string) => Uint8Array.from(readFileSync(resolve(base, file)));
  const selection = { ...JSON.parse(new TextDecoder().decode(read('selection.json'))), expectedIssuer };
  const hydrationBytes = read('hydration.json'); const view = JSON.parse(new TextDecoder().decode(hydrationBytes));
  const proofIndex = JSON.parse(new TextDecoder().decode(read('proof-index.json')));
  const actual = JSON.parse(new TextDecoder().decode(read('actual-hydration-fixture.json')));
  const indexed = { version: 1, status: 'indexed', proofIndex, objects: actual.protectedObjects.map((item: { key: string; metadata: { checksum_sha256: string }; byteLength: number }, bufferIndex: number) =>
    ({ objectKey: item.key, bufferIndex, sha256: item.metadata.checksum_sha256, byteLength: item.byteLength })) };
  const outcome = { version: 1, status: 'verified', verificationScope: 'mappedFacts', registration: selection.registration,
    request: selection.request, requestHash: view.requestHash, registrationHash: selection.registration.registrationHash,
    receiptHash: view.providerReceipt.receiptHash, qualifiedAt: view.qualifiedAt, validUntil: view.providerReceipt.validUntil,
    results: view.results, evidenceHash: 'sha256:' + '0'.repeat(64), originalSignatureRequirements: [] };
  return { read, selection, view, hydrationBytes, actual, indexed, outcome };
}
function worker(source: SourceMixedProofApi) {
  const listeners = new Set<(event: unknown) => void>(); let receive: ((event: { data: unknown }) => void) | undefined; let terminated = 0;
  const dispose = attachMixedProofWorker({ addEventListener: (_type, handler) => { receive = handler; },
    removeEventListener: () => { receive = undefined; }, postMessage: data => { for (const listener of listeners) listener({ data }); } }, source);
  const port: ProofWorker<MixedProofCommand> = { postMessage: message => receive?.({ data: message }),
    addEventListener: (type, listener) => { if (type === 'message') listeners.add(listener); },
    removeEventListener: (type, listener) => { if (type === 'message') listeners.delete(listener); },
    terminate: () => { terminated++; dispose(); } };
  return { port, terminated: () => terminated };
}
describe('general client and actual Hydrate transport (MOCK verifier; no proof qualification)', () => {
  for (const phase of ['initial', 'task'] as const) it(`preserves genuine ${phase} three-result inputs across indexing and object reads`, async () => {
    const f = fixture(phase); decodeMixedHydration(f.view);
    const source: SourceMixedProofApi = { initializeMixedProofVerifier: vi.fn(async () => {}),
      indexMixedProofObjects: vi.fn(() => encode(f.indexed)), verifyMixedProof: vi.fn(() => encode(f.outcome)) };
    const w = worker(source); let now = 0; let guarded = true; const paths: string[] = [];
    const reader = new HttpMixedProofReader({ baseUrl: 'https://source.example', scopeKey: f.view.scope,
      accessToken: 'selected', fetchImpl: async (url, init) => {
        paths.push(String(url)); const command = JSON.parse(String(init?.body));
        expect(command.hydration).toEqual(f.view); expect(new Headers(init?.headers).get('authorization')).toBe('Bearer selected');
        if (String(url).endsWith('/proofs')) return new Response(f.read('protected-view.json'), { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
        const selected = f.actual.protectedObjects.find((item: { key: string }) => item.key === command.objectKey);
        if (!selected) throw new Error('Unselected object');
        return new Response(f.read(selected.file), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
      } });
    const client = new MixedProofWorkerClient({ createWorker: () => w.port, module: new Uint8Array([1]), maxModuleBytes: 1,
      wholeOperationMilliseconds: 1000, monotonicNow: () => now });
    const nativeCurrentCheck = { selectionHash: `sha256:${'a'.repeat(64)}`, runId: 'exact-selected-run', runRevision: 1 };
    if (phase === 'initial') Object.assign(f.selection, { nativeCurrentCheck });
    const pending = client.verify(f.selection, (index, lifetime) => reader.readAll({ value: f.view, utf8Bytes: f.hydrationBytes },
      f.selection.request as InitialNativeRequest, index, lifetime), { signal: new AbortController().signal, assertCurrent: () => { if (!guarded) throw new Error('retired-owner'); },
      startedMonotonic: 0, currentAt: f.selection.currentAt, currentAtMonotonic: 0 });
    nativeCurrentCheck.runId = 'caller-mutated-run';
    f.selection.expectedIssuer = 'https://source.test/changed';
    const proof = await pending;
    expect(proof.outcome.results).toHaveLength(3); expect(proof.outcome.results).toEqual(f.actual.expectedFullResults);
    const supplied = vi.mocked(source.verifyMixedProof).mock.calls[0][0];
    expect(JSON.parse(new TextDecoder().decode(supplied.selectionBytes)).expectedIssuer).toBe(expectedIssuer);
    if (phase === 'initial') expect(JSON.parse(new TextDecoder().decode(supplied.selectionBytes)).nativeCurrentCheck)
      .toEqual({ ...nativeCurrentCheck, runId: 'exact-selected-run' });
    expect(supplied.hydrationBytes).toEqual(f.hydrationBytes); expect(supplied.buffers).toEqual(f.actual.protectedObjects.map((item: { file: string }) => f.read(item.file)));
    expect(paths).toHaveLength(1 + f.actual.protectedObjects.length); expect(w.terminated()).toBe(1);
    now = 1001; expect(proof.remainingMilliseconds()).toBe(Date.parse(f.view.providerReceipt.validUntil) - Date.parse(f.selection.currentAt) - 1001); expect(() => proof.assertCurrent()).not.toThrow(); expect(proof.refreshRequired()).toBe(false);
    const expiry = Date.parse(f.view.providerReceipt.validUntil) - Date.parse(f.selection.currentAt);
    now = expiry; expect(proof.remainingMilliseconds()).toBe(0); expect(() => proof.assertCurrent()).toThrow('worker-expired'); expect(proof.refreshRequired()).toBe(true);
    now = expiry - 1; expect(() => proof.refreshRequired()).toThrow('worker-clock-retired');
    now = expiry + 1; expect(() => proof.remainingMilliseconds()).toThrow('worker-clock-retired'); expect(() => proof.refreshRequired()).toThrow('worker-clock-retired');
    now = 1002; expect(() => proof.assertCurrent()).toThrow('worker-clock-retired');
    guarded = false; client.dispose();
  });
  for (const retirement of ['owner', 'cancel', 'generation', 'clock'] as const) it(`refuses ${retirement} changes after completed work and before Source expiry`, async () => {
    const f = fixture('initial'); let now = 0; let current = true; const parent = new AbortController();
    const w = worker({ initializeMixedProofVerifier: async () => {}, indexMixedProofObjects: () => encode(f.indexed), verifyMixedProof: () => encode(f.outcome) });
    const client = new MixedProofWorkerClient({ createWorker: () => w.port, module: new Uint8Array([1]), maxModuleBytes: 1,
      wholeOperationMilliseconds: 1000, monotonicNow: () => now });
    const proof = await client.verify(f.selection, async () => ({ hydrationBytes: f.hydrationBytes,
      proofIndexBytes: encode(f.indexed.proofIndex), buffers: f.actual.protectedObjects.map((item: { file: string }) => f.read(item.file)) }),
      { signal: parent.signal, assertCurrent() { if (!current) throw new Error('retired-owner'); },
        startedMonotonic: 0, currentAt: f.selection.currentAt, currentAtMonotonic: 0 });
    now = 1001; expect(proof.remainingMilliseconds()).toBe(Date.parse(f.view.providerReceipt.validUntil) - Date.parse(f.selection.currentAt) - 1001); expect(() => proof.assertCurrent()).not.toThrow(); expect(proof.refreshRequired()).toBe(false);
    if (retirement === 'owner') current = false;
    if (retirement === 'cancel') parent.abort();
    if (retirement === 'generation') client.retireFacts();
    if (retirement === 'clock') now = 1000;
    expect(() => proof.assertCurrent()).toThrow(); expect(() => proof.refreshRequired()).toThrow();
    now = 1002; current = true; expect(() => proof.assertCurrent()).toThrow();
    client.dispose();
  });
  it.each([undefined, '', 'relative/issuer', 'https://source.test/has space'])(
    'refuses invalid independent issuer %s before caller callbacks, preparation or worker creation', async issuer => {
      const f = fixture('initial'); f.selection.expectedIssuer = issuer;
      const prepare = vi.fn(), createWorker = vi.fn(), assertCurrent = vi.fn();
      const client = new MixedProofWorkerClient({ createWorker, module: new Uint8Array([1]), maxModuleBytes: 1,
        wholeOperationMilliseconds: 1000 });
      await expect(client.verify(f.selection, prepare, { signal: new AbortController().signal, assertCurrent,
        startedMonotonic: 0, currentAt: f.selection.currentAt, currentAtMonotonic: 0 })).rejects.toThrow('issuer');
      expect(prepare).not.toHaveBeenCalled(); expect(createWorker).not.toHaveBeenCalled(); expect(assertCurrent).not.toHaveBeenCalled();
      client.dispose();
    });
  it('requires the deployment scope key at construction', () => {
    expect(() => new HttpMixedProofReader({ baseUrl: 'https://source.example', accessToken: 'selected' })).toThrow('scope key required');
  });
  it('refuses a foreign scope before credentials or proof transport', async () => {
    const f = fixture('initial'); let calls = 0;
    const reader = new HttpMixedProofReader({ baseUrl: 'https://source.example', scopeKey: otherScopeKey,
      accessToken: () => { calls++; return 'selected'; }, fetchImpl: async () => { calls++; return new Response(); } });
    await expect(reader.readAll({ value: f.view, utf8Bytes: f.hydrationBytes }, f.selection.request,
      async () => encode(f.indexed), { signal: new AbortController().signal, assertCurrent() {} })).rejects.toThrow('current request differs');
    expect(calls).toBe(0);
  });
  it('retains the original guard despite caller mutation during owning indexing', async () => {
    const f = fixture('initial'); let current = true; let objects = 0;
    const reader = new HttpMixedProofReader({ baseUrl: 'https://source.example', scopeKey: f.view.scope,
      fetchImpl: async url => {
        if (String(url).endsWith('/proofs')) return new Response(f.read('protected-view.json'), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        objects++; throw new Error('Objects must not dispatch');
      } });
    const lifetime = { signal: new AbortController().signal, assertCurrent: () => { if (!current) throw new Error('retired-owner'); } };
    await expect(reader.readAll({ value: f.view, utf8Bytes: f.hydrationBytes }, f.selection.request, async () => {
      current = false; lifetime.assertCurrent = () => {}; lifetime.signal = new AbortController().signal; return encode(f.indexed);
    }, lifetime)).rejects.toThrow('retired-owner');
    expect(objects).toBe(0);
  });
  it('preempts noncooperative proof preparation and terminates its worker', async () => {
    const f = fixture('initial');
    const w = worker({ initializeMixedProofVerifier: async () => {}, indexMixedProofObjects: () => encode(f.indexed), verifyMixedProof: () => encode(f.outcome) });
    const client = new MixedProofWorkerClient({ createWorker: () => w.port, module: new Uint8Array([1]), maxModuleBytes: 1, wholeOperationMilliseconds: 20 });
    const at = performance.now();
    await expect(client.verify(f.selection, async () => new Promise(() => {}), { signal: new AbortController().signal,
      assertCurrent() {}, startedMonotonic: at, currentAt: f.selection.currentAt, currentAtMonotonic: at })).rejects.toThrow();
    expect(w.terminated()).toBe(1); client.dispose();
  });
});
