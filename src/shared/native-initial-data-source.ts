import { snapshotFiniteJson, canonicalFiniteJson, dataSourceAvailableToDefinitionForm, resolveDataSourceDescriptor,
  type DataSourceLoadRequest, type DataSourceDescriptor, type DataSourceActiveContext,
  type DataSourceAuthorizer, type DataSourceLoader, type DataSourcePayloadValidator } from '@formspec-org/surface';
import { assertSynchronousGuard } from './synchronous-guard.ts';
export interface NativeInitialDataSourcePorts {
  readonly authorizeDataSource: DataSourceAuthorizer;
  readonly dataSourceLoader: DataSourceLoader;
  readonly validateDataSourcePayload: DataSourcePayloadValidator;
}
export interface NativeInitialDataSite {
  readonly descriptor: DataSourceDescriptor;
  readonly context: Pick<DataSourceActiveContext, 'surfaceId' | 'surfaceRef' | 'routeId' | 'slotId' | 'definitionRef'>;
}
const canonical = (value: unknown) => canonicalFiniteJson(snapshotFiniteJson(value));
const normalized = (value: object) => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
/** Initial-data sources own their branch before a respondent signing runtime exists. */
export function createNativeInitialDataSourceRuntime(input: {
  readonly sites: readonly NativeInitialDataSite[];
  readonly sessionGeneration: string;
  readonly assertCurrent: () => void;
  readonly createPorts?: () => NativeInitialDataSourcePorts;
}): NativeInitialDataSourcePorts & { owns(request: DataSourceLoadRequest): boolean } {
  if (input.sites.length && typeof input.createPorts !== 'function') throw new Error('native-initial-data-source-capability-unavailable');
  const sites = input.sites.map(site => ({ descriptor: snapshotFiniteJson(site.descriptor, true) as unknown as DataSourceDescriptor,
    context: snapshotFiniteJson(normalized(site.context), true) }));
  for (const site of sites) {
    const resolved = resolveDataSourceDescriptor([{ catalogRef: site.descriptor.catalogRef, document: site.descriptor.catalog }], site.descriptor);
    if (!resolved || canonical(resolved) !== canonical(site.descriptor) || !site.descriptor.source.schema) throw new Error('native-initial-data-binding-unavailable');
  }
  const generation = input.sessionGeneration; const current = input.assertCurrent.bind(input);
  const createPorts = input.createPorts?.bind(input);
  let ports: NativeInitialDataSourcePorts | undefined;
  const capture = <T extends DataSourceLoadRequest>(request: T): T => snapshotFiniteJson({ ...request, context: normalized(request.context) }, true) as unknown as T;
  const owns = (request: DataSourceLoadRequest) => sites.some(site => site.descriptor.catalogRef === request.descriptor.catalogRef && site.descriptor.sourceRef === request.descriptor.sourceRef);
  function check(request: DataSourceLoadRequest) {
    assertSynchronousGuard(current);
    const site = sites.find(site => canonical(site.descriptor) === canonical(request.descriptor)
      && (['surfaceId', 'surfaceRef', 'routeId', 'slotId', 'definitionRef'] as const).every(key => request.context[key] === (site.context as Record<string, unknown>)[key]));
    if (!site || request.context.sessionGeneration !== generation || !request.context.definitionRef || !dataSourceAvailableToDefinitionForm(request.descriptor, { ...request.context, definitionRef: request.context.definitionRef }))
      throw new Error('native-initial-data-site-unadmitted');
    // bindRuntime precedes layout activation. Construct the provider on first qualified operation.
    if (!ports) {
      const selected = createPorts!();
      ports = Object.freeze({ authorizeDataSource: selected.authorizeDataSource.bind(selected),
        dataSourceLoader: selected.dataSourceLoader.bind(selected), validateDataSourcePayload: selected.validateDataSourcePayload.bind(selected) });
    }
    assertSynchronousGuard(current);
    return ports;
  }
  const authorizeDataSource: DataSourceAuthorizer = async request => {
    try { request = capture(request); const owner = check(request); const result = await owner.authorizeDataSource(request); check(request); return result; }
    catch { return { status: 'refused', reason: 'native-initial-data-access-unavailable' }; }
  };
  const dataSourceLoader: DataSourceLoader = async request => {
    try {
      request = capture(request); const owner = check(request);
      if ((await authorizeDataSource(request)).status !== 'authorized') throw new Error('native-initial-data-access-refused');
      check(request); const result = await owner.dataSourceLoader(request); check(request);
      return snapshotFiniteJson(result, true) as typeof result;
    } catch { return { status: 'unavailable', reason: 'native-initial-data-source-unavailable' }; }
  };
  const validateDataSourcePayload: DataSourcePayloadValidator = async request => {
    try {
      request = capture(request); const owner = check(request);
      if (canonical(request.schema) !== canonical(request.descriptor.source.schema)) throw new Error('native-initial-data-schema-unadmitted');
      const result = await owner.validateDataSourcePayload(request); check(request); return result;
    } catch { return { valid: false, reason: 'native-initial-data-payload-unavailable' }; }
  };
  return Object.freeze({ owns, authorizeDataSource, dataSourceLoader, validateDataSourcePayload });
}
