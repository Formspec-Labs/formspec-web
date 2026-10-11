import { NATIVE_SOURCE_OPERATION_MILLISECONDS } from './native-operation-budget.ts';
import { abortable } from './abortable.ts';
import { invokeResponseActionAsync } from '@formspec-org/engine';
import type { ResponseActionInvoker, ResponseActionInvokerResult, SubmitResult } from '@formspec-org/react';
import type { ResponseActionsDocument } from '@formspec-org/types';

/** Trusted composition selects an exact authored event and its host capability. */
export interface NativeHostEventCapability {
  readonly artifactRef: string;
  readonly actionRef: string;
  readonly eventName: string;
  readonly handle: (context: {
    readonly detail: SubmitResult;
    readonly signal: AbortSignal;
    readonly assertCurrent: () => void;
    readonly refreshSavedFacts: () => Promise<void>;
  }) => Promise<void>;
}
export function admitNativeHostEvents(input: {
  documents: Readonly<Record<string, unknown>>;
  definitionUrl: string;
  controllerActions: readonly { artifactRef: string; actionRef: string }[];
  capabilities?: readonly NativeHostEventCapability[];
}) {
  const capabilities = (input.capabilities ?? []).map(value => Object.freeze({
    artifactRef: value.artifactRef, actionRef: value.actionRef, eventName: value.eventName, handle: value.handle,
  }));
  const admitted = capabilities.map(capability => {
    const document = input.documents[capability.artifactRef] as ResponseActionsDocument | undefined;
    const action = document?.actions?.find(value => value.id === capability.actionRef);
    if (!document || document.scope === 'app' || document.targetDefinition?.url !== input.definitionUrl
      || typeof capability.handle !== 'function' || !capability.eventName?.trim()
      || document.actions.filter(value => value.id === capability.actionRef).length !== 1
      || action?.effects?.length !== 1 || action.effects[0].type !== 'hostEvent'
      || action.effects[0].eventName !== capability.eventName
      || input.controllerActions.some(value => JSON.stringify(input.documents[value.artifactRef]) === JSON.stringify(document) && value.actionRef === capability.actionRef))
      throw new Error('native-host-event-unadmitted');
    return { capability, document };
  });
  if (new Set(admitted.map(value => `${value.capability.artifactRef}\0${value.capability.actionRef}`)).size !== admitted.length)
    throw new Error('native-host-event-ambiguous');
  for (const [artifactRef, raw] of Object.entries(input.documents)) {
    const document = raw as Partial<ResponseActionsDocument>;
    if (document.$formspecResponseActions !== '1.0' || document.scope === 'app'
      || document.targetDefinition?.url !== input.definitionUrl) continue;
    for (const action of document.actions ?? []) {
      if (!action.effects?.some(effect => effect.type === 'hostEvent')
        || input.controllerActions.some(value => JSON.stringify(input.documents[value.artifactRef]) === JSON.stringify(document) && value.actionRef === action.id)) continue;
      if (!admitted.some(value => value.capability.artifactRef === artifactRef && value.capability.actionRef === action.id))
        throw new Error('native-host-event-capability-unavailable');
    }
  }
  return Object.freeze({
    owns(document: ResponseActionsDocument | null | undefined, actionRef: string) {
      return admitted.some(value => value.capability.actionRef === actionRef && JSON.stringify(value.document) === JSON.stringify(document));
    },
    async invoke(input: Parameters<ResponseActionInvoker<SubmitResult>>[0], context: {
      signal: AbortSignal; assertCurrent: () => void; refreshSavedFacts: (lifetime: { signal: AbortSignal; assertCurrent: () => void }) => Promise<void>;
    }): Promise<ResponseActionInvokerResult<SubmitResult>> {
      const selected = admitted.find(value => value.capability.actionRef === input.actionRef
        && JSON.stringify(value.document) === JSON.stringify(input.document));
      if (!selected) throw new Error('native-host-event-unadmitted');
      const deadline = new AbortController();
      const signal = AbortSignal.any([context.signal, deadline.signal]);
      const timer = setTimeout(() => deadline.abort(), NATIVE_SOURCE_OPERATION_MILLISECONDS);
      const assertCurrent = () => { signal.throwIfAborted(); context.assertCurrent(); };
      const refreshes: Promise<void>[] = [];
      let completed = false; let closed = false;
      try {
        assertCurrent();
        const calls: SubmitResult[] = [];
        const result = await abortable(signal, invokeResponseActionAsync(input.document, input.actionRef, { ...input.ports,
          dispatchHostEvent(eventName, detail) {
            assertCurrent();
            if (eventName !== selected.capability.eventName) throw new Error('native-host-event-unadmitted');
            calls.push(freezeDetail(structuredClone(detail)));
          },
        }, input.nodeId, input.invocationContext));
        assertCurrent();
        if (result.status !== 'completed') return result;
        if (calls.length !== 1) throw new Error('native-host-event-dispatch-unavailable');
        const refreshSavedFacts = () => {
          if (closed) throw new Error('native-host-event-retired');
          assertCurrent();
          const operation = context.refreshSavedFacts({ signal, assertCurrent });
          refreshes.push(operation); void operation.catch(() => undefined);
          return operation;
        };
        await abortable(signal, selected.capability.handle({ signal, assertCurrent, refreshSavedFacts, detail: calls[0] }));
        closed = true;
        await abortable(signal, Promise.all(refreshes));
        assertCurrent(); completed = true;
        return result;
      } catch {
        // Async host completion is distinct from the Engine's synchronous event dispatch.
        throw new Error('native-host-event-handler-failed');
      } finally { closed = true; clearTimeout(timer); if (!completed) deadline.abort(); }
    },
  });
}

function freezeDetail<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDetail(child);
    Object.freeze(value);
  }
  return value;
}
