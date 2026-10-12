import canonicalize from 'canonicalize';
import type { InitialInstanceProof, InitialMixedHydrationWire, InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
import { HttpClient, type HttpClientConfig, type HttpJsonResponseWithBytes } from './http-client.ts';
import { decodeInitialInstanceProof, decodeInitialMixedHydration } from './initial-mixed-proof-wire.ts';
import { computeJcsSha256Digest as hash } from './response-action-ledger.ts';
import { hydrationInstant } from './evaluation-composition.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';

export interface InitialProofReadLimits {
  /** Whole hydration, proof transport and verification limit, anchored before hydration. */
  readonly wholeOperationMilliseconds: number;
  /** Conservative sum of each selected response's full admitted wire cap. */
  readonly aggregateProofWireBytes: number;
}
export interface InitialProofReadLifetime {
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
  readonly startedMonotonic: number;
}
export interface HttpInitialMixedProofReaderConfig extends HttpClientConfig {
  readonly limits: InitialProofReadLimits;
  readonly monotonicNow?: () => number;
}
export interface InitialProofReadBundle {
  readonly hydrationBytes: Uint8Array<ArrayBuffer>;
  readonly expectedRequest: InitialNativeRequest;
  readonly proofs: readonly {
    readonly decoded: InitialInstanceProof;
    readonly utf8Bytes: Uint8Array<ArrayBuffer>;
  }[];
}
const NATIVE_CAP = 2 * 1024 * 1024;
const IMAGE_CAP = 48 * 1024 * 1024;
const COMMAND_CAP = 2 * 1024 * 1024;
const equal = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);
function fail(detail: string): never { throw new Error(`Source initial proof ${detail}`); }

/** Transfers selected actual records only. Full native/image qualification remains separate. */
export class HttpInitialMixedProofReader {
  private readonly client: HttpClient;
  private readonly limits: InitialProofReadLimits;
  private readonly now: () => number;
  private readonly scopeHeaders: Readonly<Record<string, string>>;
  private busy = false;
  constructor(config: HttpInitialMixedProofReaderConfig) {
    if (!Number.isSafeInteger(config.limits.wholeOperationMilliseconds)
      || config.limits.wholeOperationMilliseconds < 1 || config.limits.wholeOperationMilliseconds > 60_000
      || !Number.isSafeInteger(config.limits.aggregateProofWireBytes)
      || config.limits.aggregateProofWireBytes < 1 || config.limits.aggregateProofWireBytes > 50 * 1024 * 1024) {
      fail('client limits unavailable');
    }
    this.client = new HttpClient(config);
    if (!config.tenantBinding) fail('tenant binding unavailable');
    this.scopeHeaders = tenantScopeHeaders(config.tenantBinding);
    this.limits = structuredClone(config.limits);
    this.now = config.monotonicNow ?? (() => performance.now());
  }

  async readAll(hydration: HttpJsonResponseWithBytes<unknown>, expectedRequest: InitialNativeRequest,
    lifetime: InitialProofReadLifetime): Promise<InitialProofReadBundle> {
    const { signal, assertCurrent, startedMonotonic } = lifetime;
    if (this.busy) fail('concurrent reader use refused');
    this.busy = true;
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let lastElapsed = 0;
      const check = () => {
        signal.throwIfAborted(); controller.signal.throwIfAborted(); assertSynchronousGuard(assertCurrent);
        const now = this.now(); const elapsed = now - startedMonotonic;
        if (!Number.isFinite(startedMonotonic) || !Number.isFinite(now)
          || elapsed < lastElapsed || elapsed < 0 || elapsed >= this.limits.wholeOperationMilliseconds) fail('whole deadline expired');
        lastElapsed = elapsed;
        return this.limits.wholeOperationMilliseconds - elapsed;
      };
      const remaining = check();
      timer = setTimeout(() => controller.abort(new Error('Source initial proof whole deadline expired')), remaining);
      // Detach before any credentials/transport awaits. Never let callers mutate the command.
      if (!(hydration.utf8Bytes instanceof Uint8Array) || !hydration.utf8Bytes.byteLength
        || hydration.utf8Bytes.byteLength > 2 * 1024 * 1024) fail('original hydration bytes unavailable');
      const hydrationBytes = Uint8Array.from(hydration.utf8Bytes);
      // Keep exact bytes for owning native parsing: JSON.parse alone loses duplicates and unsafe integers.
      const view: InitialMixedHydrationWire = decodeInitialMixedHydration(JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(hydrationBytes)) as unknown);
      const expected = structuredClone(expectedRequest);
      if (this.scopeHeaders['x-formspec-tenant-id'] !== view.scope.tenant_id
        || this.scopeHeaders['x-formspec-workspace-id'] !== view.scope.workspace_id
        || this.scopeHeaders['x-formspec-environment-id'] !== view.scope.environment_id
        || this.scopeHeaders['x-formspec-cell-id'] !== view.scope.cell_id
        || expected.operation !== 'hydrate' || !equal(expected.scope, view.scope) || !equal(expected.owner, view.owner)
        || !equal(expected.selection, view.selection) || expected.draftId !== view.draftId
        || expected.draftVersion !== view.draftVersion || expected.candidateHash !== view.candidateHash
        || expected.requestHash !== view.requestHash || !equal(expected.sources, view.sources)
        || !view.draftId || ['.', '..'].includes(view.draftId)
        || await hash(expected.canonicalResponse) !== view.candidateHash) fail('current request binding mismatch');
      check();
      const receipt = view.providerReceipt;
      if (receipt.validUntil !== null && hydrationInstant(receipt.validUntil) <= hydrationInstant(view.qualifiedAt)) {
        fail('original receipt lifetime unavailable');
      }
      const selected = view.results.filter(result => result.status === 'qualified');
      const names = new Set<string>();
      const requests = selected.map(result => {
        if (names.has(result.instanceName)) fail('duplicate selected result');
        names.add(result.instanceName);
        const contributions = receipt.contributions.filter(entry => entry.instanceName === result.instanceName);
        if (contributions.length !== 1 || contributions[0].sourceRef !== result.sourceRef || !contributions[0].receipt) {
          fail('selected contribution unavailable');
        }
        const kind = contributions[0].receipt.kind === 'nativeScreenerMapping' ? 'native' : 'image';
        return { name: result.instanceName, kind, cap: kind === 'native' ? NATIVE_CAP : IMAGE_CAP };
      });
      // Reserving complete caps bounds actual wire bytes even when JSON contains extra whitespace.
      // One native plus one image fits 50 MiB; larger graphs need independently selected limits.
      if (requests.reduce((sum, request) => sum + request.cap, 0) > this.limits.aggregateProofWireBytes) {
        fail('aggregate proof wire budget exceeded');
      }
      const proofs: { decoded: InitialInstanceProof; utf8Bytes: Uint8Array<ArrayBuffer> }[] = [];
      for (const request of requests) {
        const command = { hydration: view, instanceName: request.name };
        if (new TextEncoder().encode(JSON.stringify(command)).byteLength > COMMAND_CAP) fail('command byte limit exceeded');
        const response = await this.client.postJsonWithBytes<unknown>(`/drafts/${encodeURIComponent(view.draftId)}/evaluation-instance-proof`,
          command, { signal: controller.signal, assertCurrent: () => { check(); }, timeoutMs: Math.min(30_000, Math.ceil(check())),
            maxResponseBytes: request.cap, successStatuses: [200], requireJson: true, requireNoStore: true });
        check();
        const proof = decodeInitialInstanceProof(response.value);
        if (proof.kind !== request.kind || proof.instanceName !== request.name || !equal(proof.request, expected)) {
          fail('returned complete request or selected leaf mismatch');
        }
        proofs.push(Object.freeze({ decoded: proof, utf8Bytes: response.utf8Bytes }));
      }
      check();
      return Object.freeze({ hydrationBytes, expectedRequest: expected, proofs: Object.freeze(proofs) });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      controller.abort();
      this.busy = false;
    }
  }
}
