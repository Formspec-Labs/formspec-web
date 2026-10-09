import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { createFormEngine, type IFormEngine } from '@formspec-org/engine/render';
import type { FormDefinition, LocaleDocument } from '@formspec-org/types';
import { replaceNativeFormEngine, type NativeEngineReplacementInput } from '../../src/shared/native-engine-replacement.ts';

beforeAll(() => initFormspecEngine());
function definition(): FormDefinition {
  return { $formspec: '1.0', url: 'urn:test:replacement', version: '1.0.0', title: 'Replacement',
    items: [
      { type: 'field', key: 'quantity', dataType: 'decimal', label: 'Quantity', initialValue: 3 },
      { type: 'field', key: 'derived', label: 'derived', dataType: 'decimal' },
      { type: 'field', key: 'hidden', label: 'hidden', dataType: 'string' },
      { type: 'field', key: 'flag', label: 'flag', dataType: 'boolean' },
      { type: 'field', key: 'nullable', label: 'nullable', dataType: 'decimal' },
      { type: 'field', key: 'photo', label: 'photo', dataType: 'attachment' },
      { type: 'field', key: 'cleared', label: 'cleared', dataType: 'string', initialValue: 'default value' },
      { type: 'field', key: 'untouched', label: 'untouched', dataType: 'string', initialValue: 'untouched default' },
    ], binds: [{ path: 'hidden', relevant: 'false' }, { path: 'derived', calculate: "$quantity * @instance('facts').rate" }],
    instances: { facts: { source: 'urn:test:facts', readonly: true, schema: { rate: 'decimal' } } } };
}
function current(form = definition()) {
  return createFormEngine(form, { instanceSourceResolver: () => ({ status: 'loaded', value: { rate: 2 } }) });
}
function input(engine: IFormEngine, overrides: Partial<NativeEngineReplacementInput> = {}): NativeEngineReplacementInput {
  return { currentEngine: engine, engineOptions: { instanceSourceResolver: () => ({ status: 'loaded', value: { rate: 7 } }) },
    localeDocuments: [], signal: new AbortController().signal, assertCurrent: vi.fn(), ...overrides };
}

describe('bounded public native engine replacement', () => {
  it('preserves hidden answers, false/null/attachments, explicit default clear, untouched attribution and recomputes new facts', async () => {
    const old = current();
    await old.waitForInstanceSources();
    const photo = { kind: 'attachment-ref', uri: 'urn:formspec:attachment:one', hash: 'opaque', metadata: { approved: false } };
    old.loadResponseData({ hidden: 'keep while hidden', flag: false, nullable: null, photo });
    old.setValue('cleared', undefined, { source: 'user' });
    old.setValue('flag', false, { source: 'assist' });
    expect(old.getResponse({ profile: 'off' }).data).not.toHaveProperty('hidden');
    expect(old.signals.derived.value).toBe(6);
    expect(old.signals.hidden.value).toBe('keep while hidden');
    const result = await replaceNativeFormEngine(input(old));
    try {
      expect(result.status).toBe('replaced');
      if (result.status !== 'replaced') throw new Error('replacement unavailable');
      expect(result.engine.signals.hidden.value).toBe('keep while hidden');
      expect(result.engine.signals.flag.value).toBe(false);
      expect(result.engine.signals.nullable.value).toBeNull();
      expect(result.engine.signals.photo.value).toEqual(photo);
      expect(result.engine.signals.cleared.value).toBeUndefined();
      expect(result.engine.getFieldVM('cleared')!.writeSource.value).toBe('user');
      expect(result.engine.getFieldVM('flag')!.writeSource.value).toBe('assist');
      expect(result.engine.signals.untouched.value).toBe('untouched default');
      expect(result.engine.getFieldVM('untouched')!.writeSource.value).toBeNull();
      expect(result.engine.signals.derived.value).toBe(21);
      expect(result.engine.getInstanceData('facts')).toEqual({ rate: 7 });
      expect(result.sourceOutcomes.facts.status).toBe('loaded');
      result.engine.setValue('hidden', 'new');
      expect(old.signals.hidden.value).toBe('keep while hidden');
    } finally { if (result.status === 'replaced') result.dispose(); old.dispose(); }
  });

  it('preserves removed, nested, zero and over-maximum repeat shape and reindexed write attribution', async () => {
    const form = definition();
    form.items.push({ key: 'rows', label: 'rows', type: 'group', repeatable: true, minRepeat: 1, maxRepeat: 1, children: [
      { key: 'name', label: 'name', type: 'field', dataType: 'string' },
      { key: 'children', label: 'children', type: 'group', repeatable: true, minRepeat: 0, maxRepeat: 1,
        children: [{ key: 'flag', label: 'flag', type: 'field', dataType: 'boolean' }] },
    ] }, { key: 'zero', label: 'zero', type: 'group', repeatable: true, minRepeat: 1, children: [{ key: 'name', label: 'name', type: 'field', dataType: 'string' }] });
    const old = current(form);
    old.loadResponseData({ rows: [{ name: 'first', children: [{ flag: false }, { flag: true }] },
      { name: 'remove me', children: [] }, { name: 'third', children: [] }], zero: [] });
    old.setValue('rows[2].name', 'third edited', { source: 'assist' });
    expect(old.repeats['rows[0].children'].value).toBe(2);
    old.removeRepeatInstance('rows', 1);
    expect(old.repeats['rows[0].children'].value).toBe(2);
    const result = await replaceNativeFormEngine(input(old));
    try {
      if (result.status !== 'replaced') throw new Error('replacement unavailable');
      expect(result.engine.repeats.rows.value).toBe(2);
      expect(result.engine.repeats['rows[0].children'].value).toBe(2);
      expect(result.engine.repeats['rows[1].children'].value).toBe(0);
      expect(result.engine.repeats.zero.value).toBe(0);
      expect(result.engine.signals['rows[0].children[0].flag'].value).toBe(false);
      expect(result.engine.signals['rows[1].name'].value).toBe('third edited');
      expect(result.engine.getFieldVM('rows[1].name')!.writeSource.value).toBe('assist');
      expect(result.engine.getFieldPaths()).not.toContain('rows[2].name');
      expect(result.engine.getFieldPaths()).not.toContain('rows[1].children[0].flag');
    } finally { if (result.status === 'replaced') result.dispose(); old.dispose(); }
  });

  it.each(['prePopulate', 'seedFrom'] as const)('refuses %s even inside a zero-row template before constructing or resolving anything', async property => {
    const form = definition();
    form.items.push({ key: 'rows', label: 'rows', type: 'group', repeatable: true, minRepeat: 0,
      children: [{ key: 'value', label: 'value', type: 'field', dataType: 'decimal', [property]: { instance: 'facts', path: 'rate' } }] });
    const old = current(form);
    const createEngine = vi.fn(createFormEngine);
    const resolver = vi.fn(() => ({ status: 'loaded' as const, value: { rate: 9 } }));
    try {
      const result = await replaceNativeFormEngine(input(old, { createEngine, engineOptions: { instanceSourceResolver: resolver } }));
      expect(result).toEqual({ status: 'unsupported', reason: 'creation-time-source-seeding' });
      expect(createEngine).not.toHaveBeenCalled();
      expect(resolver).not.toHaveBeenCalled();
    } finally { old.dispose(); }
  });

  it('preserves the current selected Locale using admitted documents', async () => {
    const old = current();
    const locale: LocaleDocument = { $formspecLocale: '2.1', url: 'urn:test:locale:es', version: '1.0.0', locale: 'es',
      target: { kind: 'definition', url: old.definition.url }, strings: { 'quantity.label': 'Cantidad' } };
    old.loadLocale(locale); old.setLocale('es');
    const result = await replaceNativeFormEngine(input(old, { localeDocuments: [locale] }));
    try {
      if (result.status !== 'replaced') throw new Error('replacement unavailable');
      expect(result.engine.getActiveLocale()).toBe('es');
      expect(result.engine.getFieldVM('quantity')!.label.value).toBe('Cantidad');
    } finally { if (result.status === 'replaced') result.dispose(); old.dispose(); }
  });

  it('disposes immediately on host abort and releases an abort-ignoring pending resolver without retiring the old engine', async () => {
    const old = current();
    const host = new AbortController();
    let sourceSignal: AbortSignal | undefined;
    const resolver = vi.fn((_request, options) => { sourceSignal = options.signal; return new Promise<never>(() => {}); });
    const pending = replaceNativeFormEngine(input(old, { signal: host.signal, engineOptions: { instanceSourceResolver: resolver } }));
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledOnce());
    host.abort(new Error('owner retired'));
    await expect(pending).rejects.toThrow('owner retired');
    expect(sourceSignal?.aborted).toBe(true);
    old.setValue('quantity', 5);
    expect(old.signals.quantity.value).toBe(5);
    old.dispose();
  });

  it('refuses stale generation after source resolution and disposes only the candidate replacement', async () => {
    const old = current();
    let resolve!: (value: { status: 'loaded'; value: { rate: number } }) => void;
    let sourceSignal: AbortSignal | undefined;
    let active = true;
    const assertCurrent = () => { if (!active) throw new Error('generation retired'); };
    const pending = replaceNativeFormEngine(input(old, { assertCurrent, engineOptions: {
      instanceSourceResolver: (_request, options) => { sourceSignal = options.signal; return new Promise(yes => { resolve = yes; }); },
    } }));
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    active = false; resolve({ status: 'loaded', value: { rate: 9 } });
    await expect(pending).rejects.toThrow('generation retired');
    expect(sourceSignal?.aborted).toBe(true);
    expect(old.signals.quantity.value).toBe(3);
    old.dispose();
  });

  it('returns unavailable outcomes explicitly without granting readiness', async () => {
    const old = current();
    const result = await replaceNativeFormEngine(input(old, { engineOptions: { instanceSourceResolver: () => ({ status: 'unavailable', reason: 'unqualified' }) } }));
    try {
      if (result.status !== 'replaced') throw new Error('replacement unavailable');
      expect(result.sourceOutcomes.facts).toEqual({ status: 'unavailable', reason: 'unqualified' });
      expect(result.engine.getInstanceData('facts')).toBeUndefined();
    } finally { if (result.status === 'replaced') result.dispose(); old.dispose(); }
  });

  it.each(['failed', 'aborted'] as const)('refuses %s settled source outcomes instead of returning a retired engine', async status => {
    const old = current();
    let release!: ReturnType<typeof vi.spyOn>;
    const createEngine: NativeEngineReplacementInput['createEngine'] = (form, options) => {
      const engine = createFormEngine(form, options);
      vi.spyOn(engine, 'waitForInstanceSources').mockResolvedValue({ facts: { status } });
      release = vi.spyOn(engine, 'dispose'); return engine;
    };
    try {
      await expect(replaceNativeFormEngine(input(old, { createEngine }))).rejects.toThrow('source replacement');
      expect(release).toHaveBeenCalledOnce();
    } finally { old.dispose(); }
  });
});
