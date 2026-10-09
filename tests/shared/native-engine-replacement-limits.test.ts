import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { createFormEngine } from '@formspec-org/engine/render';
import type { FormDefinition } from '@formspec-org/types';
import { replaceNativeFormEngine, type NativeEngineReplacementInput } from '../../src/shared/native-engine-replacement.ts';

beforeAll(() => initFormspecEngine());
const definition = (): FormDefinition => ({ $formspec: '1.0', url: 'urn:test:replacement-limits', version: '1', title: 'Limits',
  items: [{ type: 'field', key: 'parent', label: 'Parent', dataType: 'string' }] });
const resolver: NativeEngineReplacementInput['engineOptions']['instanceSourceResolver'] = () => ({ status: 'unavailable' });

describe('native replacement capability and abort limits', () => {
  it('refuses dependent field children before construction without losing their current values or attribution', async () => {
    const form = definition();
    form.items[0].children = [{ type: 'field', key: 'child', label: 'Child', dataType: 'boolean' }];
    const old = createFormEngine(form);
    old.setValue('parent.child', false, { source: 'assist' });
    expect(old.signals['parent.child'].value).toBe(false);
    expect(old.getFieldVM('parent.child')!.writeSource.value).toBe('assist');
    const createEngine = vi.fn(createFormEngine);
    let result: Awaited<ReturnType<typeof replaceNativeFormEngine>> | undefined;
    try {
      result = await replaceNativeFormEngine({ currentEngine: old, engineOptions: { instanceSourceResolver: resolver },
        localeDocuments: [], signal: new AbortController().signal, assertCurrent() {}, createEngine });
      expect(result).toEqual({ status: 'unsupported', reason: 'dependent-field-children' });
      expect(createEngine).not.toHaveBeenCalled();
      expect(old.signals['parent.child'].value).toBe(false);
    } finally { if (result?.status === 'replaced') result.dispose(); old.dispose(); }
  });

  it('releases host abort while a real remote-options fetch remains pending and observes its late completion', async () => {
    const form = definition();
    // Existing public engine remote-options behavior is not included in generated FormBind types.
    const bind: NonNullable<FormDefinition['binds']>[number] & { remoteOptions: string } = { path: 'parent', remoteOptions: 'https://options.example/values' };
    form.binds = [bind];
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockResolvedValueOnce(new Response('[]')).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const old = createFormEngine(form);
    await old.waitForRemoteOptions();
    const host = new AbortController();
    const disposed = vi.fn();
    const remoteWaitEntered = vi.fn();
    const pending = replaceNativeFormEngine({ currentEngine: old, engineOptions: { instanceSourceResolver: resolver },
      localeDocuments: [], signal: host.signal, assertCurrent() {}, createEngine: (definition, options) => {
        const engine = createFormEngine(definition, options);
        const wait = engine.waitForRemoteOptions.bind(engine);
        vi.spyOn(engine, 'waitForRemoteOptions').mockImplementation(() => { remoteWaitEntered(); return wait(); });
        const dispose = engine.dispose.bind(engine);
        engine.dispose = () => { disposed(); dispose(); };
        return engine;
      } });
    const settled = vi.fn();
    const observed = pending.then(settled, error => { settled(error); });
    try {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(remoteWaitEntered).toHaveBeenCalledOnce());
      host.abort(new Error('owner retired during remote options'));
      expect(disposed).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce());
      expect(settled.mock.calls[0][0]).toMatchObject({ message: 'owner retired during remote options' });
      old.setValue('parent', 'still editable');
      expect(old.signals.parent.value).toBe('still editable');
    } finally {
      finish(new Response('[]'));
      await observed;
      expect(disposed).toHaveBeenCalledOnce();
      old.dispose(); vi.unstubAllGlobals();
    }
  });
  it('transfers disposal ownership once before Runtime commits the adopted engine', async () => {
    const old = createFormEngine(definition()); const host = new AbortController();
    const result = await replaceNativeFormEngine({ currentEngine: old, engineOptions: { instanceSourceResolver: resolver },
      localeDocuments: [], signal: host.signal, assertCurrent() {} });
    expect(result.status).toBe('replaced'); if (result.status !== 'replaced') throw new Error('expected replacement');
    const disposed = vi.spyOn(result.engine, 'dispose');
    result.adopt(); expect(() => result.adopt()).toThrow();
    host.abort(); result.dispose();
    expect(disposed).not.toHaveBeenCalled();
    result.engine.setValue('parent', 'Runtime owns this'); expect(result.engine.signals.parent.value).toBe('Runtime owns this');
    result.engine.dispose(); expect(disposed).toHaveBeenCalledOnce(); old.dispose();
  });

});
