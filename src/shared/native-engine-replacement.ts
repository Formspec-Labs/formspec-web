import { createFormEngine, type FormEngineOptions, type IFormEngine, type InstanceSourceLoadOutcome, type InstanceSourceResolver, type WriteSource } from '@formspec-org/engine/render';
import type { FormDefinition, FormItem, LocaleDocument } from '@formspec-org/types';

type JsonRecord = Parameters<IFormEngine['loadResponseData']>[0];
type FormFieldValue = Parameters<IFormEngine['setValue']>[1];

export interface NativeEngineReplacementInput {
  readonly currentEngine: IFormEngine;
  readonly engineOptions: Omit<FormEngineOptions, 'responseData'> & { instanceSourceResolver: InstanceSourceResolver };
  readonly localeDocuments: readonly LocaleDocument[];
  /** Host owns the bounded deadline and retires this signal on owner, edit or publication changes. */
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
  readonly createEngine?: (definition: FormDefinition, options: FormEngineOptions) => IFormEngine;
}
export type NativeEngineReplacement = Readonly<{
  status: 'unsupported';
  reason: 'creation-time-source-seeding' | 'dependent-field-children';
}> | Readonly<{
  status: 'replaced';
  engine: IFormEngine;
  /** Unavailable is explicit and grants no readiness. Caller still qualifies every required source. */
  sourceOutcomes: Readonly<Record<string, InstanceSourceLoadOutcome>>;
  /** Transfer once to Runtime before enqueue; staging abort/dispose relinquishes ownership. */
  adopt: () => void;
  /** Releases the host abort subscription and disposes only an unadopted replacement. */
  dispose: () => void;
}>;

/** Same Definition only. Full Response metadata, identity, assent and installation remain host-owned. */
export async function replaceNativeFormEngine(input: NativeEngineReplacementInput): Promise<NativeEngineReplacement> {
  const { currentEngine, signal, assertCurrent } = input;
  signal.throwIfAborted(); assertCurrent();
  // Public values cannot recover original prePopulate/seedFrom lifecycle protection.
  // Check templates, including hidden and zero-row groups, before creating anything.
  if (hasCreationTimeSeeding(currentEngine.definition.items)) {
    return Object.freeze({ status: 'unsupported', reason: 'creation-time-source-seeding' });
  }
  if (hasDependentFieldChildren(currentEngine.definition.items)) {
    return Object.freeze({ status: 'unsupported', reason: 'dependent-field-children' });
  }
  const writes: { path: string; value: FormFieldValue; source: WriteSource }[] = [];
  const responseData = capture(currentEngine.definition.items, '', currentEngine, writes);
  const definition = structuredClone(currentEngine.definition);
  const locales = structuredClone(input.localeDocuments);
  const locale = currentEngine.getActiveLocale();
  const options: FormEngineOptions = { ...input.engineOptions,
    registryEntries: input.engineOptions.registryEntries ? structuredClone(input.engineOptions.registryEntries) : undefined,
    runtimeContext: { ...input.engineOptions.runtimeContext, locale }, responseData };
  const engine = (input.createEngine ?? createFormEngine)(definition, options);
  let disposed = false;
  let adopted = false;
  const dispose = () => {
    if (disposed || adopted) return;
    disposed = true; signal.removeEventListener('abort', dispose); engine.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  const check = () => { signal.throwIfAborted(); assertCurrent(); if (disposed) throw new Error('Native source replacement retired'); };
  try {
    check();
    for (const document of locales) engine.loadLocale(document);
    engine.setLocale(locale);
    // Public source tasks are deferred: replay genuine writes before the first await.
    for (const write of writes) engine.setValue(write.path, write.value, { source: write.source });
    const sourceOutcomes = await waitForHost(signal, () => engine.waitForInstanceSources());
    check();
    if (Object.values(sourceOutcomes).some(outcome => outcome.status === 'failed' || outcome.status === 'aborted')) {
      throw new Error('Native source replacement failed or aborted');
    }
    await waitForHost(signal, () => engine.waitForRemoteOptions());
    check();
    return Object.freeze({ status: 'replaced', engine, sourceOutcomes, dispose, adopt: () => {
      check(); if (adopted) throw new Error('Native replacement already adopted');
      adopted = true; signal.removeEventListener('abort', dispose);
    } });
  } catch (error) { dispose(); throw error; }
}

function hasCreationTimeSeeding(items: readonly FormItem[]): boolean {
  return items.some(item => Object.hasOwn(item, 'prePopulate') || Object.hasOwn(item, 'seedFrom')
    || hasCreationTimeSeeding(item.children ?? []));
}
function capture(items: readonly FormItem[], prefix: string, engine: IFormEngine,
  writes: { path: string; value: FormFieldValue; source: WriteSource }[]): JsonRecord {
  const data: JsonRecord = {};
  const put = (key: string, value: JsonRecord[string]) => Object.defineProperty(data, key,
    { value, enumerable: true, writable: true, configurable: true });
  for (const item of items) {
    const path = prefix ? `${prefix}.${item.key}` : item.key;
    if (item.type === 'field') {
      if (!engine.signals[path]) throw new Error('Native replacement field state unavailable');
      const value = structuredClone(engine.signals[path].value);
      if (value !== undefined) put(item.key, value);
      const source = engine.getFieldVM(path)?.writeSource.value;
      if (source === 'user' || source === 'assist') writes.push({ path, value, source });
    } else if (item.type === 'group') {
      if (item.repeatable) {
        const count = engine.repeats[path]?.value;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Native replacement repeat state unavailable');
        put(item.key, Array.from({ length: count }, (_, index) => capture(item.children ?? [], `${path}[${index}]`, engine, writes)));
      } else put(item.key, capture(item.children ?? [], path, engine, writes));
    }
  }
  return data;
}

function hasDependentFieldChildren(items: readonly FormItem[]): boolean {
  return items.some(item => item.type === 'field' && !!item.children?.length
    || hasDependentFieldChildren(item.children ?? []));
}

/** Release the host wait even when a public engine task ignores abort; observe late settlement. */
function waitForHost<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      task().then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    } catch (error) { cleanup(); reject(error); }
  });
}
