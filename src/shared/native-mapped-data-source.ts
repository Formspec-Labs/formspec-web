import { createMappingEngine, type IRuntimeMappingEngine } from '@formspec-org/engine';
import { canonicalFiniteJson, snapshotFiniteJson, dataSourceAvailableToWidget, resolveDataSourceDescriptor,
  type DataSourceDescriptor, type DataSourceLoadRequest, type DataSourceLoader,
  type DataSourceAuthorizer, type DataSourcePayloadValidator, type MappingDocumentHandle } from '@formspec-org/surface';
import { assertSynchronousGuard } from './synchronous-guard.ts';

type Loaded = Extract<Awaited<ReturnType<DataSourceLoader>>, { status: 'loaded' }>;
export interface NativeMappedDataSourceInput {
  /** Exact descriptor and Mapping handle selected after bundle admission. */
  readonly descriptor: DataSourceDescriptor;
  readonly mapping: MappingDocumentHandle;
  readonly direction: 'forward' | 'reverse';
  /** Rechecks admitted artifact pins, current owner, selected workflow and visit. */
  readonly assertCurrent: (request: DataSourceLoadRequest) => void;
  readonly authorize: DataSourceAuthorizer;
  /** Protected owner read. Applicant owners must already remove unauthorized staff fields. */
  readonly read: (request: DataSourceLoadRequest) => Promise<{ result: Loaded; assertCurrent: () => void }>;
  readonly validateInput: (value: unknown) => boolean | Promise<boolean>;
  readonly validateOutput: DataSourcePayloadValidator;
  /** Dependency injection of the maintained native engine, never business rules. */
  readonly createEngine?: (document: MappingDocumentHandle['document']) => IRuntimeMappingEngine;
}
const canonical = (value: unknown) => canonicalFiniteJson(snapshotFiniteJson(value));

/** Protected read -> native Mapping -> exact output schema. No business-state interpretation. */
export function createNativeMappedDataSource(input: NativeMappedDataSourceInput): {
  dataSourceLoader: DataSourceLoader; authorizeDataSource: DataSourceAuthorizer; validateDataSourcePayload: DataSourcePayloadValidator;
} {
  const descriptor = snapshotFiniteJson(input.descriptor) as unknown as DataSourceDescriptor;
  const mapping = snapshotFiniteJson(input.mapping) as unknown as MappingDocumentHandle;
  const resolved = resolveDataSourceDescriptor([{ catalogRef: descriptor.catalogRef, document: descriptor.catalog }], descriptor);
  if (!resolved || canonical(resolved) !== canonical(descriptor) || !descriptor.source.schema || !mapping.mappingRef || !mapping.artifactRef
    || !['both', input.direction].includes(mapping.document.direction ?? 'forward')) throw new Error('Native mapped source selection unavailable');
  const engine = (input.createEngine ?? createMappingEngine)(mapping.document);
  const direction = input.direction;
  const schema = descriptor.source.schema!;
  const capture = <T extends DataSourceLoadRequest>(request: T): T => snapshotFiniteJson({ ...request, context: Object.fromEntries(Object.entries(request.context).filter(([, value]) => value !== undefined)) }, true) as unknown as T;
  const current = input.assertCurrent.bind(input);
  const authorize = input.authorize.bind(input);
  const read = input.read.bind(input);
  const validateInput = input.validateInput.bind(input);
  const validateOutput = input.validateOutput.bind(input);
  function check(request: DataSourceLoadRequest) {
    assertSynchronousGuard(() => current(request));
    if (canonical(request.descriptor) !== canonical(descriptor) || !dataSourceAvailableToWidget(descriptor, request.context))
      throw new Error('Native mapped source outside admitted use site');
  }
  const authorizeDataSource: DataSourceAuthorizer = async request => {
    try { request = capture(request); check(request); const result = await authorize(request); check(request); return result; }
    catch { return { status: 'refused', reason: 'Native mapped source access unavailable' }; }
  };
  const dataSourceLoader: DataSourceLoader = async request => {
    try {
      request = capture(request); check(request);
      if ((await authorizeDataSource(request)).status !== 'authorized') throw new Error('Protected source access refused');
      check(request); const owned = await read(request); check(request);
      const assertRead = owned.assertCurrent.bind(owned);
      const qualified = () => { check(request); assertSynchronousGuard(assertRead); };
      qualified();
      const result = snapshotFiniteJson(owned.result) as unknown as Loaded;
      if (result.freshness !== 'fresh' || result.recordId === undefined) throw new Error('Protected source freshness unavailable');
      if (!await validateInput(result.value)) throw new Error('Protected input schema refused');
      qualified();
      const mapped = engine[direction](snapshotFiniteJson(result.value) as Parameters<IRuntimeMappingEngine['reverse']>[0]);
      if (mapped.direction !== direction || mapped.diagnostics.length) throw new Error('Native Mapping refused');
      const value = snapshotFiniteJson(mapped.output);
      qualified();
      const validation = await validateOutput({ ...request, schema, value });
      qualified();
      if (!validation.valid) throw new Error('Mapped output schema refused');
      // Keep the reader's record identity, timestamp/revision and freshness unchanged.
      return { ...result, value };
    } catch { return { status: 'unavailable', reason: 'Native mapped source data unavailable' }; }
  };
  const validateDataSourcePayload: DataSourcePayloadValidator = async request => {
    try {
      request = capture(request); check(request);
      if (canonical(request.schema) !== canonical(descriptor.source.schema)) throw new Error('Mapped source schema changed');
      const result = await validateOutput(request); check(request); return result;
    } catch { return { valid: false, reason: 'Native mapped source payload unavailable' }; }
  };
  return Object.freeze({ dataSourceLoader, authorizeDataSource, validateDataSourcePayload });
}
