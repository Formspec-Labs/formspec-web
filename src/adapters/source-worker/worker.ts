import { IMAGE_CAP, SMALL_CAP, snapshotInput, sourceFailureCode } from './protocol.ts';
import type { ProofWorkerReply, SourceInitialMixedProofApi } from './protocol.ts';

export interface ProofWorkerScope {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(reply: ProofWorkerReply, transfer?: Transferable[]): void;
}
/** Bind inside a dedicated worker. The host supplies the exact owning package API. */
export function attachInitialMixedProofWorker(scope: ProofWorkerScope, source: SourceInitialMixedProofApi): () => void {
  let state: 'new' | 'initializing' | 'ready' | 'closed' = 'new';
  const reply = (value: ProofWorkerReply, transfer: Transferable[] = []) => {
    if (state !== 'closed') scope.postMessage(value, transfer);
  };
  const listener = (event: { data: unknown }) => { void handle(event.data); };
  const handle = async (data: unknown): Promise<void> => {
    if (state === 'closed') return;
    if (!data || typeof data !== 'object') return;
    const message = data as Record<string, unknown>;
    if (!Number.isSafeInteger(message.id) || (message.id as number) < 1) return;
    const id = message.id as number;
    try {
      if (message.kind === 'initialize') {
        if (state !== 'new') throw new Error('already-initialized');
        const module = message.module;
        if (!(module instanceof Uint8Array) && !(module instanceof WebAssembly.Module)) throw new Error('init-input');
        state = 'initializing';
        await source.initializeInitialMixedProof({ module_or_path: module });
        // A disposed worker binding cannot be revived by a late initialization.
        if ((state as string) === 'closed') return;
        state = 'ready'; reply({ kind: 'ready', id }); return;
      }
      if (message.kind !== 'verify') throw new Error('input-wire');
      if (state !== 'ready') throw new Error('not-initialized');
      if (!message.inputs || typeof message.inputs !== 'object') throw new Error('input-type');
      const inputs = message.inputs as Record<string, Uint8Array>;
      const bytes = source.verifyInitialMixedProof(snapshotInput(inputs.selection, SMALL_CAP),
        snapshotInput(inputs.hydration, SMALL_CAP), snapshotInput(inputs.native, SMALL_CAP), snapshotInput(inputs.image, IMAGE_CAP));
      const output = snapshotInput(bytes, SMALL_CAP);
      reply({ kind: 'result', id, bytes: output }, [output.buffer]);
    } catch (error) { reply({ kind: 'refused', id, code: sourceFailureCode(error) }); }
  };
  scope.addEventListener('message', listener);
  return () => { state = 'closed'; scope.removeEventListener('message', listener); };
}
