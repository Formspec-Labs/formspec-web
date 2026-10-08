import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserScopedMetadataStore, type ScopedMetadataStore } from '../../src/shared/index.ts';

function tabStorage() {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }) };
}
const config = { namespace: 'caller:metadata.v1', context: { actor: 'actor-1', deployment: 'deployment-1' } };

afterEach(() => { vi.restoreAllMocks(); });

describe('public browser scoped metadata', () => {
  it('retains exact original key and body strings through a same-tab reload', () => {
    const storage = tabStorage();
    const original = { key: '  original-key:α  ', body: '{ "reason": "  café \\"quoted\\" \\n \\\\ path  " }' };
    const store: ScopedMetadataStore = createBrowserScopedMetadataStore(config, storage);
    expect(store.read('pending:operation')).toBeUndefined();
    store.write('pending:operation', original);
    const reload = createBrowserScopedMetadataStore(config, storage);
    const parsed = reload.read('pending:operation') as typeof original;
    expect(parsed).toEqual(original);
    parsed.body = 'changed after read';
    expect(reload.read('pending:operation')).toEqual(original);
    reload.remove('pending:operation');
    expect(store.read('pending:operation')).toBeUndefined();
  });

  it('captures context and namespace once without sorting, trimming or caller mutation', () => {
    const storage = tabStorage();
    const context = { z: { actor: 'first' }, a: 'second' };
    const options = { namespace: 'caller:metadata', context };
    const store = createBrowserScopedMetadataStore(options, storage);
    context.z.actor = 'changed';
    options.namespace = 'changed';
    store.write(' slot: {"quoted":1} ', 'value');
    const captured = '{"z":{"actor":"first"},"a":"second"}';
    expect([...storage.values]).toEqual([
      [`caller:metadata:${captured}: slot: {"quoted":1} `,
        JSON.stringify({ context: captured, slot: ' slot: {"quoted":1} ', value: 'value' })],
    ]);
    expect(createBrowserScopedMetadataStore({ namespace: 'caller:metadata',
      context: { z: { actor: 'first' }, a: 'second' } }, storage).read(' slot: {"quoted":1} ')).toBe('value');
  });

  it('isolates namespace, serialized context order and colon-containing slots', () => {
    const storage = tabStorage();
    const store = createBrowserScopedMetadataStore(config, storage);
    store.write('slot:tail', 'first');
    store.write('slot', 'second');
    const other = createBrowserScopedMetadataStore({ ...config, namespace: `${config.namespace}:other` }, storage);
    const changed = createBrowserScopedMetadataStore({ ...config, context: { ...config.context, actor: 'actor-2' } }, storage);
    const reordered = createBrowserScopedMetadataStore({ ...config, context: { deployment: 'deployment-1', actor: 'actor-1' } }, storage);
    expect(other.read('slot:tail')).toBeUndefined();
    expect(changed.read('slot:tail')).toBeUndefined();
    expect(reordered.read('slot:tail')).toBeUndefined();
    expect(store.read('slot')).toBe('second');
    expect(store.read('slot:tail')).toBe('first');
  });

  it.each(['', ' whitespace ', 'namespace/{', 'namespace"', 'namespace}', 'namespace\n'])('refuses invalid namespace %j', namespace => {
    expect(() => createBrowserScopedMetadataStore({ ...config, namespace }, tabStorage())).toThrow(/namespace/);
  });

  it.each([null, [], 'context', undefined, { toJSON: () => null }])('refuses nonobject serialized context %j', context => {
    expect(() => createBrowserScopedMetadataStore({ namespace: config.namespace,
      context: context as unknown as Record<string, unknown> }, tabStorage())).toThrow(/context/);
  });

  it('reports context serialization failures with their cause', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => createBrowserScopedMetadataStore({ ...config, context: circular }, tabStorage())).toThrow(/context/);
    expect(() => createBrowserScopedMetadataStore({ ...config, context: { large: 1n } }, tabStorage())).toThrow(/context/);
  });

  it.each(['read', 'write', 'remove'] as const)('refuses an empty slot before storage during %s', operation => {
    const storage = tabStorage();
    const store = createBrowserScopedMetadataStore(config, storage);
    expect(() => store[operation]('', 'value')).toThrow(/unavailable or invalid/);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([
    'not JSON', 'null', '[]', '1',
    JSON.stringify({ slot: 'slot', value: 'value' }),
    JSON.stringify({ context: JSON.stringify(config.context), value: 'value' }),
    JSON.stringify({ context: JSON.stringify(config.context), slot: 'slot' }),
    JSON.stringify({ context: 'copied-context', slot: 'slot', value: 'value' }),
    JSON.stringify({ context: JSON.stringify(config.context), slot: 'copied-slot', value: 'value' }),
    JSON.stringify({ context: JSON.stringify(config.context), slot: 'slot', ['__proto__']: { value: 'inherited' } }),
  ])('refuses malformed or copied record %j without altering it', raw => {
    const storage = tabStorage();
    const address = `${config.namespace}:${JSON.stringify(config.context)}:slot`;
    storage.values.set(address, raw);
    expect(() => createBrowserScopedMetadataStore(config, storage).read('slot')).toThrow(/unavailable or invalid/);
    expect(storage.values.get(address)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([undefined, () => 'value', Symbol('value'), 1n])('refuses omitted or unserializable top-level values before storage', value => {
    const storage = tabStorage();
    expect(() => createBrowserScopedMetadataStore(config, storage).write('slot', value)).toThrow(/unavailable or invalid/);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('refuses circular values and preserves existing nested JSON.stringify behavior', () => {
    const storage = tabStorage();
    const store = createBrowserScopedMetadataStore(config, storage);
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(() => store.write('slot', circular)).toThrow(/unavailable or invalid/);
    expect(storage.setItem).not.toHaveBeenCalled();
    store.write('slot', { optional: undefined, list: [undefined], number: NaN });
    expect(store.read('slot')).toEqual({ list: [null], number: null });
    store.write('slot', null);
    expect(store.read('slot')).toBeNull();
  });

  it.each(['read', 'write', 'remove'] as const)('reports injected %s failure with cause', operation => {
    const failure = new Error('storage denied');
    const storage = tabStorage();
    storage[operation === 'read' ? 'getItem' : operation === 'write' ? 'setItem' : 'removeItem']
      .mockImplementation(() => { throw failure; });
    const store = createBrowserScopedMetadataStore(config, storage);
    expect(() => store[operation]('slot', 'value')).toThrow(expect.objectContaining({ cause: failure }));
  });

  it.each([null, 'different bytes'])('refuses missing or changed write readback %j', readback => {
    const storage = tabStorage();
    storage.getItem.mockReturnValue(readback);
    expect(() => createBrowserScopedMetadataStore(config, storage).write('slot', 'value')).toThrow(/unavailable or invalid/);
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it.each(['write', 'remove'] as const)('reports %s readback failure with cause', operation => {
    const failure = new Error('readback denied');
    const storage = tabStorage();
    storage.getItem.mockImplementation(() => { throw failure; });
    expect(() => createBrowserScopedMetadataStore(config, storage)[operation]('slot', 'value'))
      .toThrow(expect.objectContaining({ cause: failure }));
  });

  it('refuses ineffective removal without deleting another slot or replacing retained data', () => {
    const storage = tabStorage();
    const store = createBrowserScopedMetadataStore(config, storage);
    store.write('first', 'value'); store.write('second', 'other');
    storage.removeItem.mockImplementation(() => {});
    expect(() => store.remove('first')).toThrow(/unavailable or invalid/);
    expect(store.read('first')).toBe('value'); expect(store.read('second')).toBe('other');
  });

  it('keeps public import and factory lazy, and injected operations avoid browser storage', async () => {
    const failure = new Error('browser storage denied');
    const getter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw failure; });
    vi.resetModules();
    const { createBrowserScopedMetadataStore: createPublicStore } = await import('../../src/shared/index.ts');
    const fallback = createPublicStore(config);
    const injected = createPublicStore(config, tabStorage());
    injected.write('slot', 'value'); expect(injected.read('slot')).toBe('value'); injected.remove('slot');
    expect(getter).not.toHaveBeenCalled();
    expect(() => fallback.read('slot')).toThrow(expect.objectContaining({ cause: failure }));
    expect(() => fallback.write('slot', undefined)).toThrow(/unavailable or invalid/);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(() => fallback.write('slot', 'value')).toThrow(expect.objectContaining({ cause: failure }));
    expect(() => fallback.remove('slot')).toThrow(expect.objectContaining({ cause: failure }));
  });
});
