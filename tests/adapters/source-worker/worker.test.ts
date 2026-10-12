import { describe, expect, it, vi } from 'vitest';
import { attachInitialMixedProofWorker } from '../../../src/adapters/source-worker/worker.ts';
import type { ProofWorkerReply, SourceInitialMixedProofApi } from '../../../src/adapters/source-worker/protocol.ts';

describe('worker binding (MOCK Source API; not emitted module qualification)', () => {
  function harness() {
    let listener: ((event: { data: unknown }) => void) | undefined;
    const replies: ProofWorkerReply[] = [];
    const source: SourceInitialMixedProofApi = { initializeInitialMixedProof: vi.fn(async () => {}),
      verifyInitialMixedProof: vi.fn(() => new Uint8Array([1])) };
    const dispose = attachInitialMixedProofWorker({ addEventListener: (_type, handler) => { listener = handler; },
      removeEventListener: () => { listener = undefined; }, postMessage: reply => { replies.push(reply); } }, source);
    return { replies, source, dispose, send: (data: unknown) => { listener?.({ data }); } };
  }
  it('refuses verification before initialization and calls only the owning byte API after readiness', async () => {
    const h = harness(); const inputs = { selection: new Uint8Array([1]), hydration: new Uint8Array([2]),
      native: new Uint8Array([3]), image: new Uint8Array([4]) };
    h.send({ kind: 'verify', id: 1, inputs }); expect(h.replies[0]).toEqual({ kind: 'refused', id: 1, code: 'not-initialized' });
    h.send({ kind: 'initialize', id: 2, module: new Uint8Array([0]) }); await Promise.resolve(); await Promise.resolve();
    expect(h.replies[1]).toEqual({ kind: 'ready', id: 2 }); h.send({ kind: 'verify', id: 3, inputs });
    expect(h.source.verifyInitialMixedProof).toHaveBeenCalledWith(inputs.selection, inputs.hydration, inputs.native, inputs.image);
    expect(h.replies[2]).toHaveProperty('kind', 'result'); h.dispose();
  });
  it('bounds unexpected exceptions and preserves finite owning refusals', async () => {
    for (const token of ['native-proof', 'secret input/stack']) {
      const h = harness(); h.send({ kind: 'initialize', id: 1, module: new Uint8Array([0]) }); await Promise.resolve(); await Promise.resolve();
      h.source.verifyInitialMixedProof = () => { throw new Error(token); };
      const bytes = new Uint8Array(); h.send({ kind: 'verify', id: 2, inputs: { selection: bytes, hydration: bytes, native: bytes, image: bytes } });
      expect(h.replies.at(-1)).toEqual({ kind: 'refused', id: 2, code: token === 'native-proof' ? token : 'verification-failed' }); h.dispose();
    }
  });
  it('cannot revive a disposed binding after delayed initialization', async () => {
    const h = harness(); let release!: () => void;
    h.source.initializeInitialMixedProof = () => new Promise<void>(resolve => { release = resolve; });
    h.send({ kind: 'initialize', id: 1, module: new Uint8Array([0]) }); h.dispose(); release(); await Promise.resolve();
    expect(h.replies).toEqual([]);
  });
});
