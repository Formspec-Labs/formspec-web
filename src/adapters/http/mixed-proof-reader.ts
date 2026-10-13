import canonicalize from 'canonicalize';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { HttpClient } from './http-client.ts';
import type { HttpClientConfig, HttpJsonResponseWithBytes } from './http-client.ts';
import { decodeBoundedProofJson, boundedProofJsonField } from '../source-worker/wire.ts';
import type { MixedProofIndexer, PreparedMixedProof } from '../source-worker/general-client.ts';
import { snapshotInput, SMALL_CAP } from '../source-worker/protocol.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import type { InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
const RESPONSE_CAP = 4 * 1024 * 1024 + 4096;
const equal = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Source mixed proof object required');
  return value as Record<string, unknown>;
}
const keys = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
/** Uses owning references/index keys and actual current protected-object routes. */
export class HttpMixedProofReader {
  private readonly client: HttpClient;
  private readonly scopeHeaders: Readonly<Record<string, string>>;
  constructor(config: HttpClientConfig) {
    if (!config.tenantBinding) throw new Error('Source mixed proof tenant binding required');
    this.scopeHeaders = tenantScopeHeaders(config.tenantBinding);
    this.client = new HttpClient(config);
  }
  async readAll(hydration: HttpJsonResponseWithBytes<unknown>, request: InitialNativeRequest, index: MixedProofIndexer,
    lifetime: { signal: AbortSignal; assertCurrent: () => void }): Promise<PreparedMixedProof> {
    const signal = lifetime.signal; const callerCurrent = lifetime.assertCurrent.bind(lifetime);
    const check = () => { signal.throwIfAborted(); assertSynchronousGuard(callerCurrent); };
    check(); const selected = structuredClone(request);
    const hydrationBytes = snapshotInput(hydration.utf8Bytes, SMALL_CAP);
    const view = object(decodeBoundedProofJson(hydrationBytes));
    if (this.scopeHeaders['x-formspec-tenant-id'] !== selected.scope.tenant_id
      || this.scopeHeaders['x-formspec-workspace-id'] !== selected.scope.workspace_id
      || this.scopeHeaders['x-formspec-environment-id'] !== selected.scope.environment_id
      || this.scopeHeaders['x-formspec-cell-id'] !== selected.scope.cell_id
      || view.operation !== 'hydrate' || view.draftId !== selected.draftId || view.draftVersion !== selected.draftVersion
      || view.candidateHash !== selected.candidateHash || view.requestHash !== selected.requestHash
      || !equal(view.scope, selected.scope) || !equal(view.owner, selected.owner) || !equal(view.selection, selected.selection)
      || !equal(view.sources, selected.sources) || !selected.draftId || ['.', '..'].includes(selected.draftId)) {
      throw new Error('Source mixed proof current request differs');
    }
    const options = { signal, assertCurrent: check, timeoutMs: 10_000,
      successStatuses: [200], requireNoStore: true };
    const path = `/drafts/${encodeURIComponent(selected.draftId)}/evaluation-instances`;
    const response = await this.client.postJsonWithBytes<unknown>(`${path}/proofs`, { version: 1, hydration: view },
      { ...options, requireJson: true, maxResponseBytes: RESPONSE_CAP }); check();
    const returned = object(decodeBoundedProofJson(response.utf8Bytes, RESPONSE_CAP));
    if (!keys(returned, ['version','hydration','proofs']) || returned.version !== 1 || !equal(returned.hydration, view)) {
      throw new Error('Source mixed proof unchanged hydration differs');
    }
    const referencesBytes = snapshotInput(boundedProofJsonField(response.utf8Bytes, 'proofs', RESPONSE_CAP), SMALL_CAP);
    const indexed = object(decodeBoundedProofJson(await index(referencesBytes))); check();
    if (!keys(indexed, ['version','status','proofIndex','objects']) || indexed.version !== 1 || indexed.status !== 'indexed'
      || !Array.isArray(indexed.objects) || indexed.objects.length > 256) throw new Error('Source mixed proof index refused');
    const proofIndex = object(indexed.proofIndex);
    if (!keys(proofIndex, ['version','references','buffers']) || proofIndex.version !== 1
      || !equal(proofIndex.references, returned.proofs) || !Array.isArray(proofIndex.buffers)
      || proofIndex.buffers.length !== indexed.objects.length) throw new Error('Source mixed proof index binding differs');
    const objects = indexed.objects.map((value, position) => {
      const item = object(value); const entry = object((proofIndex.buffers as unknown[])[position]);
      if (!keys(item, ['objectKey','bufferIndex','sha256','byteLength']) || !keys(entry, ['key','bytes'])
        || typeof item.objectKey !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(item.objectKey)
        || item.bufferIndex !== position || entry.key !== item.objectKey || entry.bytes !== position
        || typeof item.sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(item.sha256)
        || !Number.isSafeInteger(item.byteLength) || (item.byteLength as number) < 1) throw new Error('Source mixed proof object selector differs');
      return { objectKey: item.objectKey, byteLength: item.byteLength as number };
    });
    if (objects.reduce((total, item) => total + item.byteLength, 0) > 64 * 1024 * 1024
      || objects.some((item, position) => position > 0 && item.objectKey <= objects[position - 1].objectKey)) {
      throw new Error('Source mixed proof aggregate or ordering differs');
    }
    const buffers: Uint8Array[] = [];
    for (let offset = 0; offset < objects.length; offset += 2) {
      check();
      const siblings = new AbortController();
      const batchSignal = AbortSignal.any([signal, siblings.signal]);
      const batchCurrent = () => { batchSignal.throwIfAborted(); check(); };
      let failure: { error: unknown } | undefined;
      const batch = objects.slice(offset, offset + 2).map(async item => {
        try {
          batchCurrent();
          const bytes = await this.client.postJsonForBytes(`${path}/proof-object`,
            { version: 1, hydration: view, objectKey: item.objectKey },
            { ...options, signal: batchSignal, assertCurrent: batchCurrent, maxResponseBytes: item.byteLength });
          batchCurrent();
          if (bytes.byteLength !== item.byteLength) throw new Error('Source mixed proof object length differs');
          return bytes;
        } catch (error) {
          failure ??= { error };
          siblings.abort(failure.error);
          throw failure.error;
        }
      });
      // Promise.all preserves indexed positions and observes every late rejection.
      const completed = await Promise.all(batch);
      check(); buffers.push(...completed);
    }
    check();
    return { hydrationBytes, proofIndexBytes: snapshotInput(new TextEncoder().encode(JSON.stringify(proofIndex)), SMALL_CAP), buffers };
  }
}
