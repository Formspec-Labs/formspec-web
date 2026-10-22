import canonicalize from 'canonicalize';
import { assertSynchronousGuard } from './synchronous-guard.ts';
import type { SurfaceScreenerCompletionPolicy, SurfaceScreenerCompletionRequest } from '@formspec-org/surface-react';
import type { SavedResponseDraft } from '../ports/response-signing.ts';
import type { ScreenerOperationContext, ScreenerRetention, ScreenerRunView } from '../ports/screener-retention.ts';
import type { HydratedEvaluationCandidate } from '../ports/evaluation-hydration.ts';
import type { HydrateScreenerCandidate, ScreenerHydration } from '../ports/screener-hydration.ts';

export interface NativeScreenerCoordinatorConfig {
  readonly selectionKey: string;
  readonly retention: ScreenerRetention;
  readonly hydration: ScreenerHydration;
  /** Trusted synchronous capture of the current owner/publication and operation lifetime. */
  readonly context: () => ScreenerOperationContext;
  /** Route-independent owner/publication authority, retained across normal navigation. */
  readonly routeContext?: () => ScreenerOperationContext;
  readonly onRouteChange?: () => void;
  readonly elapsedNow?: () => number;
}
interface Operation extends ScreenerOperationContext {
  readonly wait: <T>(task: Promise<T>) => Promise<T>;
  readonly retire: () => void;
}

/** Write-free same-session sequence. Durable draft/signature receipts remain owned by the caller. */
export function createNativeScreenerCoordinator(config: NativeScreenerCoordinatorConfig) {
  const { selectionKey, retention, hydration, context } = config;
  if (!selectionKey.trim()) throw new Error('Native Screener selection key unavailable');
  let run: ScreenerRunView | undefined;
  let active: Operation | undefined;
  let disposed = false;
  let uncertainRefresh = false;
  const elapsedNow = config.elapsedNow ?? (() => performance.now());
  let lastElapsed = -Infinity;
  const clock = () => {
    const value = elapsedNow();
    if (!Number.isFinite(value) || value < lastElapsed) throw new Error('Screener elapsed clock unavailable');
    lastElapsed = value; return value;
  };
  let route: { run: ScreenerRunView; identity: string; deadline: number; assertOwner: () => void } | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const retireRoute = (notify = true) => {
    route = undefined;
    if (expiry !== undefined) clearTimeout(expiry);
    expiry = undefined;
    if (notify) config.onRouteChange?.();
  };
  function routeAllowed(target: string, document: { url?: string; version: string }): boolean {
    try {
      if (disposed || !route || clock() >= route.deadline) throw new Error('Screener route expired');
      assertSynchronousGuard(route.assertOwner);
      const owner = (config.routeContext ?? context)();
      owner.signal.throwIfAborted(); assertSynchronousGuard(owner.assertCurrent.bind(owner));
      if (JSON.stringify(owner.identity) !== route.identity) throw new Error('Screener route owner changed');
      if (route.run.selection.screenerUrl !== document.url || route.run.selection.screenerVersion !== document.version
        || route.run.acceptance?.qualification.status !== 'ready' || route.run.acceptance.qualification.target !== target) return false;
      return true;
    } catch { retireRoute(false); return false; }
  }
  const retireFacts = () => { const previous = active; active = undefined; previous?.retire(); hydration.retireFacts?.(); };
  function begin(extra?: AbortSignal, caller?: () => void): Operation {
    retireFacts();
    if (disposed) throw new Error('Native Screener coordinator disposed');
    const parent = context();
    const parentAssert = parent.assertCurrent.bind(parent);
    const identity = Object.freeze(structuredClone(parent.identity));
    const controller = new AbortController();
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    // Retirement may occur between awaits or after successful qualification.
    void aborted.catch(() => {});
    const parents = [...new Set([parent.signal, ...(extra ? [extra] : [])])];
    const subscriptions = parents.map(signal => {
      const abort = () => { controller.abort(signal.reason); rejectAbort(controller.signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      return () => signal.removeEventListener('abort', abort);
    });
    let retired = false;
    const operation: Operation = {
      identity, signal: controller.signal,
      assertCurrent: () => {
        try {
          controller.signal.throwIfAborted();
          if (disposed || active !== operation) throw new Error('Native Screener operation retired');
          for (const signal of parents) signal.throwIfAborted();
          assertSynchronousGuard(parentAssert); if (caller) assertSynchronousGuard(caller);
        } catch (error) { operation.retire(); throw error; }
      },
      wait: task => Promise.race([task, aborted]),
      retire: () => {
        if (retired) return;
        retired = true;
        subscriptions.forEach(release => release());
        controller.abort(new Error('Native Screener operation retired'));
        rejectAbort(controller.signal.reason);
      },
    };
    active = operation;
    try { operation.assertCurrent(); } catch (error) { retireFacts(); throw error; }
    return operation;
  }
  function finish(operation: Operation) {
    if (active === operation) active = undefined;
    operation.retire();
  }
  const completionPolicy = Object.freeze({ mode: 'host-required' as const, selectionKey,
    complete: async (request: SurfaceScreenerCompletionRequest) => {
      // A new attempt cannot fall back to an older run after an ambiguous or refused result.
      run = undefined; retireRoute();
      const started = clock();
      const routeOwner = (config.routeContext ?? context)();
      routeOwner.signal.throwIfAborted(); assertSynchronousGuard(routeOwner.assertCurrent.bind(routeOwner));
      const routeIdentity = JSON.stringify(routeOwner.identity);
      const assertOwner = () => { routeOwner.signal.throwIfAborted(); assertSynchronousGuard(routeOwner.assertCurrent.bind(routeOwner)); };
      const operation = begin(request.signal);
      try {
        if (request.selectionKey !== selectionKey) throw new Error('Native Screener selection mismatch');
        const input = structuredClone({ completionId: request.completionId, document: request.document,
          screenerRef: request.screenerRef, answers: request.answers, target: request.target });
        const answers = primitiveAnswers(input.answers);
        const retained = await operation.wait(retention.retain({ identity: operation.identity, signal: operation.signal,
          assertCurrent: operation.assertCurrent, completionId: input.completionId,
          document: Object.fromEntries(Object.entries(input.document)), screenerRef: input.screenerRef, answers, target: input.target }));
        operation.assertCurrent();
        const acceptance = retained.acceptance?.qualification;
        const original = retained.run.qualification;
        if (acceptance?.status !== 'ready' || acceptance.target !== input.target
          || original.status !== 'ready' || original.target !== input.target) {
          return { status: 'refused' as const, reason: acceptance?.status === 'pending' ? acceptance.reason : 'native-screener-acceptance-unavailable', retry: 'new-act' as const };
        }
        // Keep the exact port-issued object; serializing it would discard retention provenance.
        run = retained;
        const validity = retained.run.determination.validity as { validUntil?: string } | undefined;
        const until = validity?.validUntil;
        // Date.parse truncates submillisecond fractions. Reserve one millisecond so
        // endpoint truncation can only shorten authority, never extend original validity.
        const remaining = until === undefined && !input.document.resultValidity ? Infinity
          : Date.parse(until ?? '') - Date.parse(retained.acceptance!.checkedAt) - 1;
        const deadline = started + remaining;
        assertOwner();
        const owner = (config.routeContext ?? context)();
        owner.signal.throwIfAborted(); assertSynchronousGuard(owner.assertCurrent.bind(owner));
        if (JSON.stringify(owner.identity) !== routeIdentity || !(remaining > 0) || clock() >= deadline) {
          run = undefined;
          return { status: 'refused' as const, reason: 'native-screener-route-expired', retry: 'new-act' as const };
        }
        route = { run: retained, identity: routeIdentity, deadline, assertOwner };
        if (Number.isFinite(deadline)) expiry = setTimeout(() => retireRoute(), Math.min(deadline - clock(), 2_147_483_647));
        config.onRouteChange?.();
        return { status: 'accepted' as const };
      } finally { finish(operation); }
    },
  }) satisfies SurfaceScreenerCompletionPolicy;
  async function qualifySaved(saved: SavedResponseDraft, caller?: () => void, options?: { readonly allowRefresh?: boolean }): Promise<HydratedEvaluationCandidate> {
    const operation = begin(undefined, caller);
    try {
      const candidate = structuredClone(saved);
      const currentCheck = !!candidate.response.authoredSignatures?.length;
      const allowRefresh = options?.allowRefresh === true && !currentCheck && !candidate.response.extensions?.['x-formspec-signing-content'];
      if (!run && currentCheck) {
        if (!retention.recover) throw new Error('Native Screener retained recovery unavailable');
        const recovered = await operation.wait(retention.recover({ saved: candidate, identity: operation.identity,
          signal: operation.signal, assertCurrent: operation.assertCurrent }));
        operation.assertCurrent(); run = recovered;
      } else if (allowRefresh && (!run || run.acceptance?.qualification.status !== 'ready') && retention.recover && retention.refresh) {
        if (!run) {
          const recovered = await operation.wait(retention.recover({ saved: candidate, identity: operation.identity,
            signal: operation.signal, assertCurrent: operation.assertCurrent }));
          operation.assertCurrent(); run = recovered;
        }
        if (run.acceptance?.qualification.status !== 'ready') {
          let issuedLatest = run;
          const refreshCommon = { identity: operation.identity, signal: operation.signal, assertCurrent: operation.assertCurrent };
          if (uncertainRefresh) {
            if (!retention.load) throw new Error('Native Screener refresh recovery unavailable');
            issuedLatest = await operation.wait(retention.load({ ...refreshCommon, run: issuedLatest })); operation.assertCurrent();
            run = issuedLatest;
          }
          uncertainRefresh = true;
          const fresh = await operation.wait(retention.refresh({ ...refreshCommon, run: issuedLatest }));
          operation.assertCurrent(); run = fresh; uncertainRefresh = false;
          if (fresh.acceptance?.qualification.status !== 'ready' || fresh.run.qualification.status !== 'ready')
            throw new Error('Native Screener refreshed acceptance unavailable');
        }
      }
      const issued = run;
      if (!issued) throw new Error('Native Screener retained run unavailable');
      const nativeCurrentCheck = currentCheck ? Object.freeze({ selectionHash: issued.run.selectionHash,
        runId: issued.run.runId, runRevision: issued.run.revision }) : undefined;
      const common = { saved: candidate, run: issued,
        identity: operation.identity, signal: operation.signal, assertCurrent: operation.assertCurrent };
      const hydrationCandidate: HydrateScreenerCandidate = nativeCurrentCheck
        ? { ...common, nativeCurrentCheck }
        : { ...common, association: await operation.wait(retention.associate(common)) };
      operation.assertCurrent();
      const facts = await operation.wait(hydration.hydrate(hydrationCandidate));
      operation.assertCurrent(); facts.assertCurrent();
      if (nativeCurrentCheck && canonicalize(facts.nativeCurrentCheck) !== canonicalize(nativeCurrentCheck)) throw new Error('Native current check proof selector mismatch');
      return Object.freeze({ view: facts.view,
        ...(facts.remainingMilliseconds ? { remainingMilliseconds: () => { operation.assertCurrent(); return facts.remainingMilliseconds!(); } } : {}), ...(nativeCurrentCheck ? { nativeCurrentCheck } : {}),
        ...(facts.refreshRequired ? { refreshRequired: () => { operation.assertCurrent(); return facts.refreshRequired!(); } } : {}),
        assertCurrent: () => { operation.assertCurrent(); facts.assertCurrent(); },
        assertReady: () => { operation.assertCurrent(); facts.assertReady(); } });
    } catch (error) { finish(operation); throw error; }
  }
  async function refreshSaved(saved: SavedResponseDraft, caller: () => void): Promise<void> {
    const operation = begin(undefined, caller);
    try {
      if (saved.response.authoredSignatures?.length) throw new Error('Signed Screener refresh requires current check');
      if (!run) {
        if (!retention.recover) throw new Error('Native Screener retained recovery unavailable');
        const recovered = await operation.wait(retention.recover({ saved, identity: operation.identity,
          signal: operation.signal, assertCurrent: operation.assertCurrent }));
        operation.assertCurrent(); run = recovered;
      }
      const issued = run;
      if (!retention.refresh) throw new Error('Native Screener refresh unavailable');
      let issuedLatest = issued;
      const common = { identity: operation.identity, signal: operation.signal, assertCurrent: operation.assertCurrent };
      if (uncertainRefresh) {
        if (!retention.load) throw new Error('Native Screener refresh recovery unavailable');
        issuedLatest = await operation.wait(retention.load({ ...common, run: issued })); operation.assertCurrent();
        // Owning GET supplies history only. The next explicit attempt reevaluates
        // from its actual latest revision; only successful PUT supplies acceptance.
        run = issuedLatest;
      }
      uncertainRefresh = true;
      const fresh = await operation.wait(retention.refresh({ ...common, run: issuedLatest }));
      operation.assertCurrent(); run = fresh; uncertainRefresh = false;
      if (fresh.acceptance?.qualification.status !== 'ready' || fresh.run.qualification.status !== 'ready')
        throw new Error('Native Screener refreshed acceptance unavailable');
    } finally { finish(operation); }
  }
  return Object.freeze({ completionPolicy, qualifySaved, refreshSaved, retireFacts, routeAllowed,
    retireAuthority: () => { run = undefined; retireRoute(false); retireFacts(); },
    preSignCandidate: async (input: { saved: SavedResponseDraft; operationId: string; assertCurrent: () => void }) => {
      const facts = await qualifySaved(input.saved, input.assertCurrent, { allowRefresh: false });
      facts.assertReady();
      return Object.freeze({ assertCurrent: facts.assertCurrent });
    },
    dispose: () => { if (disposed) return; disposed = true; run = undefined; retireRoute(); retireFacts(); hydration.dispose?.(); },
  });
}
function primitiveAnswers(answers: SurfaceScreenerCompletionRequest['answers']): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(answers).map(([path, value]) => {
    if (!(typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('Native Screener flat answers required');
    }
    return [path, value];
  }));
}
