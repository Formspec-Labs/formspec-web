import { HttpTaskCandidateHydration } from '../../../src/adapters/http/task-candidate-hydration.ts';
import { computeJcsSha256Digest } from '../../../src/adapters/http/response-action-ledger.ts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createTaskMixedProofVerifier } from '../../../src/adapters/http/task-mixed-proof-verifier.ts';
import { attachMixedProofWorker } from '../../../src/adapters/source-worker/general-worker.ts';
import type { ProofWorker } from '../../../src/adapters/source-worker/protocol.ts';
import type { MixedProofCommand } from '../../../src/adapters/source-worker/general-protocol.ts';
import type { SavedResponseDraft } from '../../../src/ports/response-signing.ts';
import type { MixedHydrationWire } from '../../../src/ports/mixed-proof.ts';
import type { EvaluationHydrationWire } from '../../../src/ports/evaluation-hydration.ts';
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function fixture(currentProducer = false) {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), currentProducer ? '../../fixtures/task-mixed-hydration-v3' : '../../fixtures/mixed-proof-transport-v1/hydrate-task');
  const read = (name: string) => Uint8Array.from(readFileSync(resolve(base, name)));
  const json = (name: string) => JSON.parse(new TextDecoder().decode(read(name)));
  const selected = json('selection.json'), view = json('hydration.json'), actual = json('actual-hydration-fixture.json');
  const proofIndex = json('proof-index.json');
  const indexed = { version: 1, status: 'indexed', proofIndex,
    objects: actual.protectedObjects.map((item: { key: string; metadata: { checksum_sha256: string }; byteLength: number }, bufferIndex: number) =>
      ({ objectKey: item.key, bufferIndex, sha256: item.metadata.checksum_sha256, byteLength: item.byteLength })) };
  const outcome = { version: 1, status: 'verified', verificationScope: 'mappedFacts', registration: selected.registration,
    request: selected.request, requestHash: view.requestHash, registrationHash: selected.registration.registrationHash,
    receiptHash: view.providerReceipt.receiptHash, qualifiedAt: view.qualifiedAt, validUntil: view.providerReceipt.validUntil,
    results: view.results, evidenceHash: 'sha256:' + '0'.repeat(64), originalSignatureRequirements: [] };
  let now = 0, current = true, calls = 0, terminated = 0, created = 0, refusal: string | undefined, hydrationBytes: Uint8Array<ArrayBuffer> | undefined;
  const listeners = new Set<(event: unknown) => void>();
  let receive: ((event: { data: unknown }) => void) | undefined;
  const detach = attachMixedProofWorker({ addEventListener: (_type, listener) => { receive = listener; },
    removeEventListener: () => { receive = undefined; }, postMessage: data => { for (const listener of listeners) listener({ data }); } }, {
    initializeMixedProofVerifier: async () => {}, indexMixedProofObjects: () => encode(indexed),
    verifyMixedProof(inputs) {
      if (refusal) throw new Error(refusal);
      expect(JSON.parse(new TextDecoder().decode(inputs.selectionBytes)).request).toEqual(selected.request);
      expect(inputs.buffers).toEqual(actual.protectedObjects.map((item: { file: string }) => read(item.file)));
      return encode(outcome);
    },
  });
  const port: ProofWorker<MixedProofCommand> = { postMessage: message => receive?.({ data: message }),
    addEventListener: (type, listener) => { if (type === 'message') listeners.add(listener); },
    removeEventListener: (type, listener) => { if (type === 'message') listeners.delete(listener); },
    terminate: () => { terminated++; detach(); } };
  const config = { publication: selected.request.formVersion, registration: selected.registration, selection: selected.request.selection,
    worker: { createWorker: () => { created++; return port; }, module: new Uint8Array([1]), maxModuleBytes: 1, wholeOperationMilliseconds: 1000 },
    monotonicNow: () => now, utcNow: () => selected.currentAt,
    assertCurrent() { if (!current) throw new Error('Owner retired'); },
    source: { baseUrl: 'https://source.example', accessToken: 'selected-owner', tenantBinding: { kind: 'bound' as const, scope: {
      tenant: view.scope.tenant_id, workspace: view.scope.workspace_id, environment: view.scope.environment_id, cell: view.scope.cell_id } },
      fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
        calls++; now += 10;
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer selected-owner');
        const command = JSON.parse(String(init?.body));
        if (String(url).endsWith('/evaluation-instances')) {
          expect(command).toEqual({ draftVersion: selected.request.draftVersion, candidateHash: selected.request.candidateHash });
          return new Response(hydrationBytes ?? read('hydration.json'), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        }
        expect(command.hydration).toEqual(view);
        if (String(url).endsWith('/proofs')) return new Response(read('protected-view.json'), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        const object = actual.protectedObjects.find((item: { key: string }) => item.key === command.objectKey);
        if (!object) throw new Error('Unselected proof object');
        return new Response(read(object.file), { headers: { 'cache-control': 'no-store', 'content-type': 'application/octet-stream', 'x-content-type-options': 'nosniff' } });
      } } };
  const saved = { response: selected.request.canonicalResponse, draft: { id: selected.request.draftId, version: selected.request.draftVersion } } as SavedResponseDraft;
  return { config, input: { view: view as EvaluationHydrationWire | MixedHydrationWire, saved, hydrationBytes: read('hydration.json') },
    lifetime: { signal: new AbortController().signal, assertCurrent() { if (!current) throw new Error('Owner retired'); } },
    read, selected, actual, changeHydration: (value: unknown) => { hydrationBytes = encode(value); }, refuse: (code: string) => { refusal = code; }, outcome, calls: () => calls, terminated: () => terminated, created: () => created, now: () => now, retire: () => { current = false; } };
}
describe('task proof adapter binding (mock Source verifier; no native proof qualification)', () => {
  it('uses actual saved request and protected objects, subtracting elapsed time from original validity', async () => {
    const f = fixture(); const result = await createTaskMixedProofVerifier(f.config).verify(f.input, f.lifetime);
    expect(result.validForMilliseconds).toBe(90_000 - f.now()); expect(f.calls()).toBe(3); expect(f.terminated()).toBe(1);
  });
  it.each(['publication', 'candidate', 'bytes', 'selection'] as const)('refuses changed %s before protected reads', async change => {
    const f = fixture();
    if (change === 'publication') f.config.publication = { ...f.config.publication, form_id: 'foreign' };
    if (change === 'candidate') f.input.saved.response.data = {};
    if (change === 'bytes') f.input.hydrationBytes = encode({ ...f.input.view, draftVersion: 99 });
    if (change === 'selection') f.config.selection = { ...f.config.selection, formId: 'foreign' };
    await expect(createTaskMixedProofVerifier(f.config).verify(f.input, f.lifetime)).rejects.toThrow(); expect(f.calls()).toBe(0);
  });
  it('refuses a retired owner before credentials or worker initialization', async () => {
    const f = fixture(); f.retire();
    await expect(createTaskMixedProofVerifier(f.config).verify(f.input, f.lifetime)).rejects.toThrow('Owner retired'); expect(f.calls()).toBe(0);
  });
});


// Exact current Source producer export. Transport and proof worker protocol are
// real maintained adapters; Source's cryptographic API is an explicit double.
async function taskHydrationFixture() {
  const f = fixture(true);
  const request = f.selected.request;
  const contextObject = f.actual.protectedObjects.find((item: { metadata: { object_kind: string } }) => item.metadata.object_kind === 'immutable:task-context-observation:v1');
  const association = JSON.parse(new TextDecoder().decode(f.read(contextObject.file))).origin.association;
  const taskDraft = { version: 1 as const, associationHash: association.associationHash, taskBindingHash: association.taskBindingHash };
  const response = structuredClone(request.canonicalResponse);
  const saved: SavedResponseDraft = { draftKey: { formUrl: response.definitionUrl, formVersion: response.definitionVersion, subjectRef: request.owner.subjectRef },
    response, draft: { id: request.draftId, version: request.draftVersion, responseHash: await computeJcsSha256Digest(response) }, actor: { id: request.owner.subjectRef },
    evidence: { draft_id: request.draftId, draft_version: request.draftVersion, form_version_id: request.selection.formVersionId,
      subject_ref: request.owner.subjectRef, status: 'in_progress', canonical_response: response, draft_state: response.data, taskDraft } };
  const adapter = new HttpTaskCandidateHydration({ ...f.config.source, definition: JSON.parse(request.formVersion.definition_json),
    selection: request.selection, formVersionHash: f.input.view.formVersionHash, taskDraft, subjectRef: request.owner.subjectRef,
    identity: { issuer: request.owner.authenticated.issuer, subject: request.owner.authenticated.subject, clientId: request.owner.authenticated.clientId },
    assertCurrent: f.config.assertCurrent, elapsedNow: f.now, receiptVerifier: createTaskMixedProofVerifier(f.config) }, f.lifetime);
  return { ...f, adapter, saved };
}
describe('current Source-produced task mixed V3 through hydration and proof transport', () => {
  it.each(['depth', 'nodes'] as const)('preserves the mixed %s snapshot budget before protected reads', async mode => {
    const f = await taskHydrationFixture();
    const view = JSON.parse(new TextDecoder().decode(f.read('hydration.json')));
    const data = mode === 'depth' ? Array.from({ length: 130 }).reduce<unknown>(value => [value], null) : Array(100_001).fill(null);
    Object.assign(view.results[0], { data, dataHash: await computeJcsSha256Digest(data) }); f.changeHydration(view);
    try { await expect(f.adapter.qualifySaved(f.saved, f.lifetime)).rejects.toThrow('Response data exceeds the safe snapshot limit'); expect(f.calls()).toBe(1); expect(f.created()).toBe(0); }
    finally { f.adapter.dispose(); }
  });

  it.each(['extra-root', 'extra-receipt', 'receipt2', 'top3', 'null-receipt', 'owner', 'request-hash', 'result-digest'] as const)('refuses %s before any protected proof read', async mode => {
    const f = await taskHydrationFixture();
    const view = JSON.parse(new TextDecoder().decode(f.read('hydration.json')));
    if (mode === 'extra-root') view.unadmitted = true;
    if (mode === 'extra-receipt') view.providerReceipt.unadmitted = true;
    if (mode === 'receipt2') view.providerReceipt.version = 2;
    if (mode === 'top3') view.version = 3;
    if (mode === 'null-receipt') view.providerReceipt = null;
    if (mode === 'owner') view.owner.subjectRef = 'foreign-neutral-owner';
    if (mode === 'request-hash') view.requestHash = `sha256:${'d'.repeat(64)}`;
    if (mode === 'result-digest') view.results[0].dataHash = `sha256:${'d'.repeat(64)}`;
    f.changeHydration(view);
    try { await expect(f.adapter.qualifySaved(f.saved, f.lifetime)).rejects.toThrow(); expect(f.calls()).toBe(1); expect(f.terminated()).toBe(0); }
    finally { f.adapter.dispose(); }
  });

  it('admits TOP2/receipt3 without changing original bytes and verifies the exact candidate', async () => {
    const f = await taskHydrationFixture();
    const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/adapters/http/source-schemas/evaluation-composition-v3.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(f.actual.producerProtocol).toEqual({ hydrationVersion: 2, mixedReceiptVersion: 3,
      selectedPolicyVersion: f.config.registration.publicDescriptor.version,
      selectedRegistrationHash: f.config.registration.registrationHash, schemaId: schema.$id,
      schemaSha256: `sha256:${createHash('sha256').update(readFileSync(schemaPath)).digest('hex')}` });
    try {
      const facts = await f.adapter.qualifySaved(f.saved, f.lifetime);
      facts.assertReady();
      expect(facts.view).toEqual(JSON.parse(new TextDecoder().decode(f.read('hydration.json'))));
      expect(facts.view.version).toBe(2); expect(facts.view.providerReceipt).toHaveProperty('version', 3);
      expect(f.calls()).toBe(4); expect(f.terminated()).toBe(1);
      expect(facts.remainingMilliseconds!()).toBeGreaterThan(0);
    } finally { f.adapter.dispose(); }
  });
  it('preserves original Source proof refusal after wire admission', async () => {
    const f = await taskHydrationFixture(); f.refuse('native-proof');
    try { await expect(f.adapter.qualifySaved(f.saved, f.lifetime)).rejects.toThrow('native-proof'); expect(f.calls()).toBe(4); }
    finally { f.adapter.dispose(); }
  });
});


describe('selected mixed task proof configuration admission', () => {
  it.each(['version2', 'future4', 'unknown-owner'] as const)('refuses %s before transport or worker creation', mode => {
    const f = fixture(true);
    if (mode === 'version2') f.config.registration.publicDescriptor.version = 2;
    if (mode === 'future4') f.config.registration.publicDescriptor.version = 4;
    if (mode === 'unknown-owner') f.config.registration.publicDescriptor.owners[0].resolverKind = 'unsupported-owner';
    expect(() => createTaskMixedProofVerifier(f.config)).toThrow('Invalid Source mixed proof registration shape');
    expect(f.calls()).toBe(0); expect(f.created()).toBe(0);
  });
  it('admits semantic version3 despite a provider label correction-2', () => {
    const f = fixture(true);
    f.config.registration.providerVersion = 'correction-2';
    f.config.registration.publicDescriptor.providerVersion = 'correction-2';
    expect(() => createTaskMixedProofVerifier(f.config)).not.toThrow();
    expect(f.calls()).toBe(0); expect(f.created()).toBe(0);
  });
});


describe('bounded protected transport overlap (simulated timing; mock Source crypto)', () => {
  it('overlaps two genuine producer objects and preserves buffers under reverse completion', async () => {
    const f = await taskHydrationFixture(); const original = f.config.source.fetchImpl;
    const held: { release: () => void }[] = []; const completed: number[] = []; let elapsed = 0;
    f.config.monotonicNow = () => elapsed;
    f.config.source.fetchImpl = async (url, init) => {
      if (!String(url).endsWith('/proof-object')) return original(url, init);
      const position = held.length;
      await new Promise<void>(resolve => { held.push({ release: resolve }); });
      const response = await original(url, init); completed.push(position); return response;
    };
    // Recreate the real adapter/verifier so the selected transport is pinned.
    const request = f.selected.request;
    const adapter = new HttpTaskCandidateHydration({ ...f.config.source, definition: JSON.parse(request.formVersion.definition_json),
      selection: request.selection, formVersionHash: f.input.view.formVersionHash, taskDraft: f.saved.evidence.taskDraft!, subjectRef: f.saved.actor.id,
      identity: { issuer: request.owner.authenticated.issuer, subject: request.owner.authenticated.subject, clientId: request.owner.authenticated.clientId },
      assertCurrent: f.config.assertCurrent, elapsedNow: () => elapsed, receiptVerifier: createTaskMixedProofVerifier(f.config) }, f.lifetime);
    const lifetime = new AbortController();
    const outcome = adapter.qualifySaved(f.saved, { ...f.lifetime, signal: lifetime.signal }).then(facts => ({ facts }), error => ({ error }));
    try {
      await vi.waitFor(() => expect(held).toHaveLength(2), { timeout: 500 });
      elapsed = 45; held[1].release(); await vi.waitFor(() => expect(completed).toEqual([1]));
      elapsed = 75; held[0].release();
      const result = await outcome; if ('error' in result) throw result.error;
      result.facts.assertReady(); expect(result.facts.view).toEqual(f.input.view);
      // Two controlled delays75/45 cost75 overlapped, versus120 sequential.
      expect(elapsed).toBe(75); expect(completed).toEqual([1, 0]); expect(f.terminated()).toBe(1);
    } finally { lifetime.abort(new Error('test cleanup')); held.forEach(item => item.release()); await outcome; adapter.dispose(); f.adapter.dispose(); }
  });
});
