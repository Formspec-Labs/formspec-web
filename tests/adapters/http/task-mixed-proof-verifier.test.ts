import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTaskMixedProofVerifier } from '../../../src/adapters/http/task-mixed-proof-verifier.ts';
import { attachMixedProofWorker } from '../../../src/adapters/source-worker/general-worker.ts';
import type { ProofWorker } from '../../../src/adapters/source-worker/protocol.ts';
import type { MixedProofCommand } from '../../../src/adapters/source-worker/general-protocol.ts';
import type { SavedResponseDraft } from '../../../src/ports/response-signing.ts';
import type { EvaluationHydrationWire } from '../../../src/ports/evaluation-hydration.ts';
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function fixture() {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/mixed-proof-transport-v1/hydrate-task');
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
  let now = 0, current = true, calls = 0, terminated = 0;
  const listeners = new Set<(event: unknown) => void>();
  let receive: ((event: { data: unknown }) => void) | undefined;
  const detach = attachMixedProofWorker({ addEventListener: (_type, listener) => { receive = listener; },
    removeEventListener: () => { receive = undefined; }, postMessage: data => { for (const listener of listeners) listener({ data }); } }, {
    initializeMixedProofVerifier: async () => {}, indexMixedProofObjects: () => encode(indexed),
    verifyMixedProof(inputs) {
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
    worker: { createWorker: () => port, module: new Uint8Array([1]), maxModuleBytes: 1, wholeOperationMilliseconds: 1000 },
    monotonicNow: () => now, utcNow: () => selected.currentAt,
    assertCurrent() { if (!current) throw new Error('Owner retired'); },
    source: { baseUrl: 'https://source.example', accessToken: 'selected-owner', tenantBinding: { kind: 'bound' as const, scope: {
      tenant: view.scope.tenant_id, workspace: view.scope.workspace_id, environment: view.scope.environment_id, cell: view.scope.cell_id } },
      fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
        calls++; now += 10;
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer selected-owner');
        const command = JSON.parse(String(init?.body)); expect(command.hydration).toEqual(view);
        if (String(url).endsWith('/proofs')) return new Response(read('protected-view.json'), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        const object = actual.protectedObjects.find((item: { key: string }) => item.key === command.objectKey);
        if (!object) throw new Error('Unselected proof object');
        return new Response(read(object.file), { headers: { 'cache-control': 'no-store', 'content-type': 'application/octet-stream', 'x-content-type-options': 'nosniff' } });
      } } };
  const saved = { response: selected.request.canonicalResponse, draft: { id: selected.request.draftId, version: selected.request.draftVersion } } as SavedResponseDraft;
  return { config, input: { view: view as EvaluationHydrationWire, saved, hydrationBytes: read('hydration.json') },
    lifetime: { signal: new AbortController().signal, assertCurrent() { if (!current) throw new Error('Owner retired'); } },
    outcome, calls: () => calls, terminated: () => terminated, now: () => now, retire: () => { current = false; } };
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
