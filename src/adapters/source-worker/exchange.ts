import { SOURCE_REFUSALS, SMALL_CAP, snapshotInput } from './protocol.ts';
import type { ProofWorker } from './protocol.ts';

/** Shared dedicated-worker transport; proof admission stays in owning clients. */
export function exchangeProofWorker<C extends { readonly kind: 'initialize' | 'verify' | 'index'; readonly id: number }>(worker: ProofWorker<C>, command: C, signal: AbortSignal,
    check: () => unknown, transfer: Transferable[]): Promise<Uint8Array | undefined> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        worker.removeEventListener('message', message);
        worker.removeEventListener('error', failure);
        worker.removeEventListener('messageerror', failure);
        signal.removeEventListener('abort', cancel);
      };
      const finish = (error?: Error, value?: Uint8Array) => {
        if (settled) return;
        settled = true; cleanup();
        if (error) reject(error); else resolve(value);
      };
      const cancel = () => finish(new Error('worker-aborted'));
      const failure = () => finish(new Error('verification-failed'));
      const message = (event: unknown) => {
        if (settled) return;
        try {
          check();
          const reply = (event as { data?: unknown })?.data;
          if (!reply || typeof reply !== 'object') throw new Error('worker-protocol');
          const value = reply as Record<string, unknown>;
          if (value.id !== command.id) return;
          if (value.kind === 'refused') {
            if (Object.keys(value).length !== 3 || typeof value.code !== 'string' || !SOURCE_REFUSALS.has(value.code)) throw new Error('verification-failed');
            throw new Error(value.code);
          }
          if (command.kind === 'initialize' && value.kind === 'ready' && Object.keys(value).length === 2) finish();
          else if ((command.kind === 'verify' || command.kind === 'index') && value.kind === 'result' && Object.keys(value).length === 3) {
            finish(undefined, snapshotInput(value.bytes as Uint8Array, SMALL_CAP));
          } else throw new Error('worker-protocol');
        } catch (error) { finish(error instanceof Error ? error : new Error('verification-failed')); }
      };
      worker.addEventListener('message', message);
      worker.addEventListener('error', failure);
      worker.addEventListener('messageerror', failure);
      signal.addEventListener('abort', cancel, { once: true });
      try { check(); worker.postMessage(command, transfer); } catch (error) {
        finish(error instanceof Error ? error : new Error('verification-failed'));
      }
    });
  }
