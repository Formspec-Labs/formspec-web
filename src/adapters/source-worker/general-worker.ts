import { SMALL_CAP, snapshotInput, sourceFailureCode } from './protocol.ts';
import type { ProofWorkerReply, ProofWorkerScope } from './protocol.ts';
import { snapshotMixedInputs } from './general-protocol.ts';
import type { MixedProofInputs, SourceMixedProofApi } from './general-protocol.ts';
/** Dedicated-worker binding to the selected public Source verifier. */
export function attachMixedProofWorker(scope: ProofWorkerScope, source: SourceMixedProofApi): () => void {
  let state: 'new' | 'initializing' | 'ready' | 'closed' = 'new';
  const reply = (value: ProofWorkerReply, transfer: Transferable[] = []) => {
    if (state !== 'closed') scope.postMessage(value, transfer);
  };
  const listener = (event: { data: unknown }) => { void handle(event.data); };
  const handle = async (data: unknown) => {
    if (state === 'closed' || !data || typeof data !== 'object') return;
    const message = data as Record<string, unknown>;
    if (!Number.isSafeInteger(message.id) || (message.id as number) < 1) return;
    const id = message.id as number;
    try {
      if (message.kind === 'initialize') {
        if (state !== 'new') throw new Error('already-initialized');
        const module = message.module;
        if (!(module instanceof Uint8Array) && !(module instanceof WebAssembly.Module)) throw new Error('init-input');
        state = 'initializing';
        await source.initializeMixedProofVerifier({ module_or_path: module });
        if ((state as string) === 'closed') return;
        state = 'ready'; reply({ kind: 'ready', id }); return;
      }
      if ((message.kind !== 'verify' && message.kind !== 'index') || Object.keys(message).length !== 3) throw new Error('input-wire');
      if (state !== 'ready') throw new Error('not-initialized');
      const bytes = message.kind === 'index'
        ? source.indexMixedProofObjects({ referencesBytes: snapshotInput(message.referencesBytes as Uint8Array, SMALL_CAP) })
        : source.verifyMixedProof(snapshotMixedInputs(message.inputs as MixedProofInputs));
      const output = snapshotInput(bytes, SMALL_CAP);
      reply({ kind: 'result', id, bytes: output }, [output.buffer]);
    } catch (error) { reply({ kind: 'refused', id, code: sourceFailureCode(error) }); }
  };
  scope.addEventListener('message', listener);
  return () => { state = 'closed'; scope.removeEventListener('message', listener); };
}
