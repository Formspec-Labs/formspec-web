import { describe, expect, it, vi } from 'vitest';
import { InitialMixedProofWorkerClient } from '../../../src/adapters/source-worker/client.ts';
import type { ProofWorker, ProofWorkerCommand } from '../../../src/adapters/source-worker/protocol.ts';
import { at, encode, mockFixture } from './mock-fixture.ts';

class ControlledWorker implements ProofWorker {
  readonly commands: ProofWorkerCommand[] = [];
  readonly transfers: Transferable[][] = [];
  readonly terminate = vi.fn();
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly historical: ((event: unknown) => void)[] = [];
  postMessage(command: ProofWorkerCommand, transfer: Transferable[]): void { this.commands.push(command); this.transfers.push(transfer); }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set(); set.add(listener); this.listeners.set(type, set);
    if (type === 'message') this.historical.push(listener);
  }
  removeEventListener(type: string, listener: (event: unknown) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(data: unknown): void { for (const listener of [...(this.listeners.get('message') ?? [])]) listener({ data }); }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function harness() {
  const worker = new ControlledWorker(); const workers = [worker]; let created = 0;
  const createWorker = vi.fn(() => {
    if (created++ === 0) return worker;
    const next = new ControlledWorker(); workers.push(next); return next;
  });
  let now = 100;
  const client = new InitialMixedProofWorkerClient({ createWorker, module: new Uint8Array([1]), maxModuleBytes: 1024,
    wholeOperationMilliseconds: 60_000, monotonicNow: () => now });
  const abort = new AbortController(); const assertCurrent = vi.fn(() => {});
  const lifetime = { signal: abort.signal, assertCurrent, startedMonotonic: 100, currentAt: at, currentAtMonotonic: 100 };
  const fixture = mockFixture();
  return { worker, workers, createWorker, client, abort, lifetime, ...fixture, advance: (value: number) => { now = value; } };
}
async function ready(h: ReturnType<typeof harness>) { h.worker.emit({ kind: 'ready', id: 1 }); await flush(); }

describe('initial Source worker client (MOCK lifecycle only; no native proof qualification)', () => {
  it('refuses an already aborted operation without creating a worker', async () => {
    const h = harness(); h.abort.abort();
    await expect(h.client.verify(h.selected, h.bundle, h.lifetime)).rejects.toThrow();
    expect(h.createWorker).not.toHaveBeenCalled();
  });
  it.each(['resolved', 'rejected'])('refuses a %s async current guard before worker effects', async mode => {
    const h = harness(); const assertCurrent = () => mode === 'resolved' ? Promise.resolve() : Promise.reject(new Error('changed'));
    await expect(h.client.verify(h.selected, h.bundle, { ...h.lifetime, assertCurrent })).rejects.toThrow('must be synchronous');
    expect(h.createWorker).not.toHaveBeenCalled();
  });
  it('snapshots exact input bytes before initialization and transfers only copies', async () => {
    const h = harness(); const originalNative = h.bundle.proofs[0].utf8Bytes.slice();
    const pending = h.client.verify(h.selected, h.bundle, h.lifetime);
    h.bundle.proofs[0].utf8Bytes.fill(32); h.bundle.hydrationBytes.fill(32);
    await ready(h);
    const command = h.worker.commands[1]; expect(command.kind).toBe('verify');
    if (command.kind !== 'verify') throw new Error('expected verification');
    expect(command.inputs.native).toEqual(originalNative);
    expect(command.inputs.native.buffer).not.toBe(h.bundle.proofs[0].utf8Bytes.buffer);
    expect(h.worker.transfers[1]).toEqual(Object.values(command.inputs).map(bytes => bytes.buffer));
    h.worker.emit({ kind: 'result', id: 2, bytes: encode(h.outcome) });
    await expect(pending).resolves.toHaveProperty('outcome', h.outcome);
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  });
  it.each(['initialization', 'verification'])('aborts during %s and discards captured late callbacks', async stage => {
    const h = harness(); const pending = h.client.verify(h.selected, h.bundle, h.lifetime);
    const refusal = expect(pending).rejects.toThrow('worker-aborted');
    if (stage === 'verification') await ready(h);
    h.abort.abort(); await refusal;
    for (const callback of h.worker.historical) callback({ data: { kind: 'result', id: 2, bytes: encode(h.outcome) } });
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    expect([...h.worker.listeners.values()].every(set => set.size === 0)).toBe(true);
  });
  it.each(['owner', 'session', 'publication', 'candidate', 'draft-version', 'route', 'engine-generation'])('refuses changed %s before returning facts', async field => {
    const h = harness(); let current = true;
    const assertCurrent = () => { if (!current) throw new Error(`${field} changed`); };
    const pending = h.client.verify(h.selected, h.bundle, { ...h.lifetime, assertCurrent });
    const refused = expect(pending).rejects.toThrow('changed'); await ready(h); current = false;
    h.worker.emit({ kind: 'result', id: 2, bytes: encode(h.outcome) }); await refused;
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  });
  it.each(['requestHash', 'registrationHash', 'receiptHash', 'qualifiedAt', 'expiresAt', 'results'])('rejects changed output %s', async field => {
    const h = harness(); const pending = h.client.verify(h.selected, h.bundle, h.lifetime); const refused = expect(pending).rejects.toThrow('binding');
    await ready(h); const output = structuredClone(h.outcome);
    if (field === 'results') Object.assign(output.results[0], { data: { value: true } });
    else if (field === 'qualifiedAt' || field === 'expiresAt') Object.assign(output, { [field]: '2026-10-10T12:00:01Z' });
    else Object.assign(output, { [field]: `sha256:${'b'.repeat(64)}` });
    h.worker.emit({ kind: 'result', id: 2, bytes: encode(output) }); await refused;
  });
  it('settles once and returned guards retain the original expiry and retirement', async () => {
    const h = harness(); let settlements = 0;
    const pending = h.client.verify(h.selected, h.bundle, h.lifetime).then(value => { settlements++; return value; });
    await ready(h); h.worker.emit({ kind: 'result', id: 2, bytes: encode(h.outcome) }); const facts = await pending;
    for (const callback of h.worker.historical) callback({ data: { kind: 'result', id: 2, bytes: encode(h.outcome) } });
    expect(settlements).toBe(1); expect(facts.outcome.qualifiedAt).toBe(at); facts.assertCurrent();
    h.advance(30_100); expect(facts.assertCurrent).toThrow('worker-expired');
    h.advance(100); expect(facts.assertCurrent).toThrow('worker-expired');
  });
  it('retires pending work and already returned facts through the same generation', async () => {
    const h = harness(); const pending = h.client.verify(h.selected, h.bundle, h.lifetime);
    await ready(h); h.worker.emit({ kind: 'result', id: 2, bytes: encode(h.outcome) }); const facts = await pending;
    h.client.retireFacts(); expect(facts.assertCurrent).toThrow();
    const next = h.client.verify(h.selected, h.bundle, h.lifetime); const refused = expect(next).rejects.toThrow('worker-aborted');
    h.client.dispose(); await refused;
  });
  it('refuses expired or reversed monotonic anchors before creating a worker', async () => {
    for (const anchor of [NaN, 101, -1]) {
      const h = harness();
      await expect(h.client.verify(h.selected, h.bundle, { ...h.lifetime, currentAtMonotonic: anchor })).rejects.toThrow('worker-expired');
      expect(h.createWorker).not.toHaveBeenCalled();
    }
  });
  it('bounds unexpected worker errors and ignores foreign operation replies', async () => {
    const h = harness(); const pending = h.client.verify(h.selected, h.bundle, h.lifetime);
    h.worker.emit({ kind: 'ready', id: 99 }); expect(h.worker.commands).toHaveLength(1);
    const refused = expect(pending).rejects.toThrow('verification-failed');
    for (const callback of h.worker.listeners.get('error') ?? []) callback({ message: 'secret input/stack' });
    await refused;
  });
  it.each(['initialization', 'verification'])('times out a hung %s and terminates its worker', async stage => {
    vi.useFakeTimers();
    try {
      const h = harness(); const pending = h.client.verify(h.selected, h.bundle, h.lifetime);
      const refused = expect(pending).rejects.toThrow('worker-aborted');
      if (stage === 'verification') await ready(h);
      h.advance(30_100); await vi.advanceTimersByTimeAsync(30_000); await refused;
      expect(h.worker.terminate).toHaveBeenCalledTimes(1);
      expect([...h.worker.listeners.values()].every(set => set.size === 0)).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('supersedes an overlapping operation and cannot accept its late result in the new worker', async () => {
    const h = harness(); const first = h.client.verify(h.selected, h.bundle, h.lifetime);
    const firstRefused = expect(first).rejects.toThrow('worker-aborted'); await ready(h);
    const second = h.client.verify(h.selected, h.bundle, h.lifetime); await firstRefused;
    expect(h.worker.terminate).toHaveBeenCalledTimes(1); const next = h.workers[1];
    for (const callback of h.worker.historical) callback({ data: { kind: 'result', id: 2, bytes: encode(h.outcome) } });
    expect(next.commands).toHaveLength(1); next.emit({ kind: 'ready', id: 1 }); await flush();
    next.emit({ kind: 'result', id: 2, bytes: encode(h.outcome) }); await expect(second).resolves.toHaveProperty('outcome', h.outcome);
    expect(next.terminate).toHaveBeenCalledTimes(1);
  });
  it('rounds fractional original expiry down without rewriting the original timestamp', async () => {
    const h = harness(); const expiresAt = '2026-10-10T12:00:30.000999999Z';
    const hydration = JSON.parse(new TextDecoder().decode(h.bundle.hydrationBytes));
    hydration.providerReceipt.validUntil = expiresAt;
    const pending = h.client.verify(h.selected, { ...h.bundle, hydrationBytes: encode(hydration) }, h.lifetime); await ready(h);
    h.worker.emit({ kind: 'result', id: 2, bytes: encode({ ...h.outcome, expiresAt }) }); const facts = await pending;
    expect(facts.outcome.expiresAt).toBe(expiresAt); h.advance(30_099); expect(facts.remainingMilliseconds()).toBe(1); facts.assertCurrent();
    h.advance(30_100); expect(facts.assertCurrent).toThrow('worker-expired');
  });
  it('keeps a returned owner failure retired even if the owner guard later appears current', async () => {
    const h = harness(); let current = true;
    const assertCurrent = () => { if (!current) throw new Error('owner changed'); };
    const pending = h.client.verify(h.selected, h.bundle, { ...h.lifetime, assertCurrent }); await ready(h);
    h.worker.emit({ kind: 'result', id: 2, bytes: encode(h.outcome) }); const facts = await pending;
    current = false; expect(facts.assertCurrent).toThrow('owner changed');
    current = true; expect(facts.assertCurrent).toThrow('owner changed');
  });
  it.each(['hydration', 'native', 'image'])('refuses oversized %s bytes before creating a worker', async family => {
    const h = harness();
    const bundle = { ...h.bundle, proofs: h.bundle.proofs.map(proof => ({ ...proof })) };
    if (family === 'hydration') bundle.hydrationBytes = new Uint8Array(2 * 1024 * 1024 + 1);
    else bundle.proofs[family === 'native' ? 0 : 1].utf8Bytes = new Uint8Array((family === 'native' ? 2 : 48) * 1024 * 1024 + 1);
    await expect(h.client.verify(h.selected, bundle, h.lifetime)).rejects.toThrow('input-cap'); expect(h.createWorker).not.toHaveBeenCalled();
  });
});
