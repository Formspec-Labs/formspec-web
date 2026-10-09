import { assertSynchronousGuard } from './synchronous-guard.ts';
import type { SurfaceScreenerCompletionPolicy, SurfaceScreenerCompletionRequest } from '@formspec-org/surface-react';
import type { SavedResponseDraft } from '../ports/response-signing.ts';
import type { ScreenerOperationContext, ScreenerRetention, ScreenerRunView } from '../ports/screener-retention.ts';
import type { HydratedScreenerCandidate, ScreenerHydration } from '../ports/screener-hydration.ts';

export interface NativeScreenerCoordinatorConfig {
  readonly selectionKey: string;
  readonly retention: ScreenerRetention;
  readonly hydration: ScreenerHydration;
  /** Trusted synchronous capture of the current owner/publication and operation lifetime. */
  readonly context: () => ScreenerOperationContext;
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
  const retireFacts = () => { const previous = active; active = undefined; previous?.retire(); };
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
      run = undefined;
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
        return { status: 'accepted' as const };
      } finally { finish(operation); }
    },
  }) satisfies SurfaceScreenerCompletionPolicy;
  async function qualifySaved(saved: SavedResponseDraft, caller?: () => void): Promise<HydratedScreenerCandidate> {
    const operation = begin(undefined, caller);
    try {
      const issued = run;
      if (!issued) throw new Error('Native Screener retained run unavailable');
      const candidate = structuredClone(saved);
      const association = await operation.wait(retention.associate({ saved: candidate, run: issued,
        identity: operation.identity, signal: operation.signal, assertCurrent: operation.assertCurrent }));
      operation.assertCurrent();
      const facts = await operation.wait(hydration.hydrate({ saved: candidate, run: issued, association,
        identity: operation.identity, signal: operation.signal, assertCurrent: operation.assertCurrent }));
      operation.assertCurrent(); facts.assertCurrent();
      return Object.freeze({ view: facts.view,
        assertCurrent: () => { operation.assertCurrent(); facts.assertCurrent(); },
        assertReady: () => { operation.assertCurrent(); facts.assertReady(); } });
    } catch (error) { finish(operation); throw error; }
  }
  return Object.freeze({ completionPolicy, qualifySaved, retireFacts,
    preSignCandidate: async (input: { saved: SavedResponseDraft; operationId: string; assertCurrent: () => void }) => {
      const facts = await qualifySaved(input.saved, input.assertCurrent);
      facts.assertReady();
      return Object.freeze({ assertCurrent: facts.assertCurrent });
    },
    dispose: () => { if (disposed) return; disposed = true; run = undefined; retireFacts(); },
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
