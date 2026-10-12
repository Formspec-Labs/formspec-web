import { describe, expect, it, vi } from 'vitest';
import { attachMixedProofWorker } from '../../../src/adapters/source-worker/general-worker.ts';
import { snapshotMixedInputs } from '../../../src/adapters/source-worker/general-protocol.ts';
import type { MixedProofInputs, SourceMixedProofApi } from '../../../src/adapters/source-worker/general-protocol.ts';
import type { ProofWorkerReply } from '../../../src/adapters/source-worker/protocol.ts';
const inputs = (): MixedProofInputs => ({ selectionBytes: new Uint8Array([1]), hydrationBytes: new Uint8Array([2]),
  proofIndexBytes: new Uint8Array([3]), buffers: [new Uint8Array([4]), new Uint8Array([5]), new Uint8Array([6])] });
function harness() {
  let listener: ((event: { data: unknown }) => void) | undefined;
  const replies: ProofWorkerReply[] = [];
  const source: SourceMixedProofApi = { initializeMixedProofVerifier: vi.fn(async () => {}),
    indexMixedProofObjects: vi.fn(() => new Uint8Array([1])),
    verifyMixedProof: vi.fn(() => new TextEncoder().encode('{"version":1,"status":"refused","code":"proof_refused"}')) };
  const dispose = attachMixedProofWorker({ addEventListener: (_type, value) => { listener = value; },
    removeEventListener: () => { listener = undefined; }, postMessage: reply => { replies.push(reply); } }, source);
  return { source, replies, dispose, send: (data: unknown) => listener?.({ data }) };
}
describe('general worker transport (MOCK API; no owning proof qualification)', () => {
  it('transports all selected buffers and returns owning refusal bytes without treating them as verified', async () => {
    const h = harness(); h.send({ kind: 'initialize', id: 1, module: new Uint8Array([0]) }); await Promise.resolve();
    const selected = inputs(); h.send({ kind: 'verify', id: 2, inputs: selected });
    expect(h.source.verifyMixedProof).toHaveBeenCalledWith(selected);
    const supplied = vi.mocked(h.source.verifyMixedProof).mock.calls[0][0];
    supplied.buffers.forEach((bytes, index) => expect(bytes).not.toBe(selected.buffers[index]));
    const result = h.replies.at(-1);
    expect(result?.kind).toBe('result');
    if (result?.kind !== 'result') throw new Error('Missing byte result');
    expect(JSON.parse(new TextDecoder().decode(result.bytes))).toEqual({ version: 1, status: 'refused', code: 'proof_refused' });
    h.dispose();
  });
  it('refuses controls over 2 MiB and aggregate payloads over 64 MiB before copying or calling Source', async () => {
    const h = harness(); h.send({ kind: 'initialize', id: 1, module: new Uint8Array([0]) }); await Promise.resolve();
    h.send({ kind: 'verify', id: 2, inputs: { ...inputs(), proofIndexBytes: new Uint8Array(2 * 1024 * 1024 + 1) } });
    expect(h.replies.at(-1)).toEqual({ kind: 'refused', id: 2, code: 'input-cap' });
    const shared = new Uint8Array(32 * 1024 * 1024);
    h.send({ kind: 'verify', id: 3, inputs: { ...inputs(), buffers: [shared, shared] } });
    expect(h.replies.at(-1)).toEqual({ kind: 'refused', id: 3, code: 'input-cap' });
    expect(h.source.verifyMixedProof).not.toHaveBeenCalled(); h.dispose();
  });
  it('refuses buffer count above 256 and shared-memory inputs', () => {
    expect(() => snapshotMixedInputs({ ...inputs(), buffers: Array.from({ length: 257 }, () => new Uint8Array()) })).toThrow('input-cap');
    expect(() => snapshotMixedInputs({ ...inputs(), selectionBytes: new Uint8Array(new SharedArrayBuffer(1)) })).toThrow('input-type');
  });
  it('cannot revive a disposed binding after delayed initialization', async () => {
    const h = harness(); let release!: () => void;
    h.source.initializeMixedProofVerifier = () => new Promise<void>(resolve => { release = resolve; });
    h.send({ kind: 'initialize', id: 1, module: new Uint8Array([0]) }); h.dispose(); release(); await Promise.resolve();
    expect(h.replies).toEqual([]);
  });
});
