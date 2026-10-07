import {
  canonicalFiniteJson,
  dataSourceAvailableToWidget,
  resolveDataSourceDescriptor,
  snapshotFiniteJson,
  type DataSourceAuthorizer,
  type DataSourceDescriptor,
  type DataSourceLoader,
  type DataSourceLoadRequest,
  type DataSourcePayloadValidator,
} from '@formspec-org/surface';

export interface FrozenHostStateDataInput {
  /** Exact resolved descriptors from the admitted bundle, paired with verified values. */
  entries: readonly { descriptor: DataSourceDescriptor; value: unknown }[];
  generation: string | number;
  recordId: string;
  revision: number;
  /** Checks the private owning session; generation alone is not authorization. */
  assertCurrent: () => void;
  validatePayload: DataSourcePayloadValidator;
}

/** One immutable delivery generation. Recreate it after verified state changes;
 * no getter can mix values from different draft revisions during a widget load.
 */
export function createFrozenHostStateDataSourceRuntime(input: FrozenHostStateDataInput): {
  authorizeDataSource: DataSourceAuthorizer;
  dataSourceLoader: DataSourceLoader;
  validateDataSourcePayload: DataSourcePayloadValidator;
} {
  if (!input.recordId.trim() || !Number.isSafeInteger(input.revision) || input.revision < 0
    || (typeof input.generation === 'string' ? !input.generation : !Number.isSafeInteger(input.generation))) {
    throw new Error('Host-state delivery requires an owned record, revision and generation');
  }
  const generation = input.generation;
  const recordId = input.recordId;
  const revision = input.revision;
  const assertCurrent = input.assertCurrent;
  const entries = snapshotFiniteJson(input.entries) as unknown as FrozenHostStateDataInput['entries'];
  const registered = new Map<string, { descriptor: string; value: unknown }>();
  for (const entry of entries) {
    const { descriptor } = entry;
    const source = descriptor.source;
    const resolved = resolveDataSourceDescriptor([{ catalogRef: descriptor.catalogRef, document: descriptor.catalog }], descriptor);
    if (descriptor.catalog.id !== descriptor.catalogRef || !resolved
      || canonical(resolved) !== canonical(descriptor) || source.kind !== 'host-state'
      || source.owner !== 'host' || source.runtime.authorizationBoundary !== 'host'
      || source.runtime.provenance.kind !== 'host-state') {
      throw new Error('Host-state delivery requires an exact admitted host source');
    }
    const key = sourceKey(descriptor);
    if (registered.has(key)) throw new Error('Host-state delivery has an ambiguous source binding');
    registered.set(key, { descriptor: canonical(descriptor), value: entry.value });
  }
  const admitted = (request: DataSourceLoadRequest) => {
    try {
      assertCurrent();
      const descriptor = snapshotFiniteJson(request.descriptor) as unknown as DataSourceDescriptor;
      const expected = registered.get(sourceKey(descriptor));
      if (request.context.sessionGeneration !== generation || !expected
        || expected.descriptor !== canonical(descriptor)
        || !dataSourceAvailableToWidget(descriptor, request.context)) return undefined;
      return expected;
    } catch { return undefined; }
  };
  return {
    authorizeDataSource: request => admitted(request)
      ? { status: 'authorized' }
      : { status: 'refused', reason: 'Host-state source is outside the current admitted session' },
    dataSourceLoader: request => {
      const entry = admitted(request);
      if (!entry) return { status: 'unavailable', reason: 'Host-state source is outside the current admitted session' };
      return { status: 'loaded', value: structuredClone(entry.value), freshness: 'fresh', recordId, revision };
    },
    validateDataSourcePayload: input.validatePayload,
  };
}

function sourceKey(descriptor: Pick<DataSourceDescriptor, 'catalogRef' | 'sourceRef'>): string {
  return JSON.stringify([descriptor.catalogRef, descriptor.sourceRef]);
}

function canonical(value: unknown): string { return canonicalFiniteJson(snapshotFiniteJson(value)); }
