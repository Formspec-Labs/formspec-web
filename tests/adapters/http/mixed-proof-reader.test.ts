import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { HttpMixedProofReader } from '../../../src/adapters/http/mixed-proof-reader.ts';
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

// The owning request/protected view is a genuine neutral Source fixture. The
// ten-object index below is a transport scheduling double, not proof authority.
function fixture() {
  const base = resolve('tests/fixtures/task-mixed-hydration-v4');
  const read = (name: string) => Uint8Array.from(readFileSync(resolve(base, name)));
  const selected = JSON.parse(new TextDecoder().decode(read('selection.json')));
  const view = JSON.parse(new TextDecoder().decode(read('hydration.json')));
  const references = JSON.parse(new TextDecoder().decode(read('protected-view.json'))).proofs;
  const objects = Array.from({ length: 10 }, (_, position) => ({ objectKey: `sha256:${position.toString(16).padStart(64, '0')}`,
    bufferIndex: position, sha256: `sha256:${'a'.repeat(64)}`, byteLength: 1 }));
  const indexed = { version: 1, status: 'indexed', objects,
    proofIndex: { version: 1, references, buffers: objects.map(item => ({ key: item.objectKey, bytes: item.bufferIndex })) } };
  const parent = new AbortController(); const retired = new Error('Owner retired'); let current = true;
  const pending: { position: number; signal: AbortSignal; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
  let active = 0, maxActive = 0;
  const reader = new HttpMixedProofReader({ baseUrl: 'https://source.example', accessToken: 'selected-owner', scopeKey: view.scope,
    fetchImpl: async (url, init) => {
      expect(init!.method).toBe('POST'); expect(new Headers(init!.headers).get('authorization')).toBe('Bearer selected-owner');
      const body = JSON.parse(String(init!.body)); expect(body.version).toBe(1); expect(body.hydration).toEqual(view);
      if (String(url).endsWith('/proofs')) return new Response(read('protected-view.json'), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      const position = objects.findIndex(item => item.objectKey === body.objectKey); expect(position).toBeGreaterThanOrEqual(0);
      active++; maxActive = Math.max(maxActive, active);
      return new Promise<Response>((resolve, reject) => { pending.push({ position, signal: init!.signal!,
        resolve: response => { active--; resolve(response); }, reject: error => { active--; reject(error); } }); });
    } });
  const start = () => reader.readAll({ value: view, utf8Bytes: read('hydration.json') }, selected.request, async () => encode(indexed),
    { signal: parent.signal, assertCurrent: () => { if (!current) throw retired; } });
  const release = (position: number) => pending.find(item => item.position === position)!.resolve(new Response(new Uint8Array([position]), {
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }));
  return { start, pending, release, indexed, parent, retired, retire: () => { current = false; }, maxActive: () => maxActive };
}

describe('protected-object transport bounded to two requests', () => {
  it('reads ten indexed objects in five waves and preserves positions under reverse completion', async () => {
    const f = fixture(); const observed = f.start().then(output => ({ output }), error => ({ error }));
    try {
      for (let wave = 0; wave < 5; wave++) {
        await vi.waitFor(() => expect(f.pending).toHaveLength((wave + 1) * 2));
        f.release(wave * 2 + 1); await Promise.resolve(); f.release(wave * 2);
      }
      const result = await observed; if ('error' in result) throw result.error;
      const output = result.output; expect(f.maxActive()).toBe(2);
      expect(output.buffers.map(bytes => [...bytes])).toEqual(Array.from({ length: 10 }, (_, index) => [index]));
      // Equal controlled5ms reads model25ms in5waves, versus50ms serial.
      expect(Math.ceil(f.pending.length / f.maxActive()) * 5).toBe(25);
    } finally { f.parent.abort(new Error('test cleanup')); await observed; }
  });
  it('preserves first refusal, aborts its sibling, observes late rejection and starts no later wave', async () => {
    const f = fixture(); const error = new Error('Read refused'); const result = f.start(); const refused = expect(result).rejects.toBe(error);
    await vi.waitFor(() => expect(f.pending).toHaveLength(2)); f.pending[0].reject(error); await refused;
    expect(f.pending[1].signal.aborted).toBe(true); expect(f.pending[1].signal.reason).toBe(error); expect(f.pending).toHaveLength(2);
    f.pending[1].reject(new Error('Late transport refusal')); await Promise.resolve();
  });
  it.each(['cancel', 'owner'] as const)('refuses %s retirement, aborts in-flight siblings and starts no later wave', async mode => {
    const f = fixture(); const result = f.start(); const refused = expect(result).rejects.toBe(f.retired);
    await vi.waitFor(() => expect(f.pending).toHaveLength(2));
    if (mode === 'cancel') f.parent.abort(f.retired); else { f.retire(); f.release(0); }
    await refused; expect(f.pending[1].signal.aborted).toBe(true); expect(f.pending).toHaveLength(2);
    f.pending[1].reject(new Error('Late transport refusal')); await Promise.resolve();
  });
  it('validates the complete index order before any object dispatch', async () => {
    const f = fixture(); f.indexed.objects[9].objectKey = f.indexed.objects[0].objectKey;
    f.indexed.proofIndex.buffers[9].key = f.indexed.objects[0].objectKey;
    await expect(f.start()).rejects.toThrow('aggregate or ordering differs'); expect(f.pending).toHaveLength(0);
  });
});
