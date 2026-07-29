import {
  createDocumentResourceDataSourceLoader,
  type DataSourceActiveContext,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
  type ResolvedBundle,
} from '@formspec-org/surface';
import { createSurfaceDataSourcePayloadValidator } from '../../adapters/schema/index.ts';
import type { RespondentReceiptSessionStore } from './session-store.ts';

export interface RespondentDataSourceRuntime {
  readonly dataSourceLoader: DataSourceLoader;
  readonly authorizeDataSource: DataSourceAuthorizer;
  readonly validateDataSourcePayload: DataSourcePayloadValidator;
}

export interface RespondentDataSourceRuntimeInput {
  readonly appId: string;
  readonly releaseIdentity: string;
  readonly receiptResourceUrl: string;
  readonly proofRoutes: ReadonlySet<string>;
  readonly sessionStore: RespondentReceiptSessionStore;
}

export function createRespondentDataSourceRuntime(
  input: RespondentDataSourceRuntimeInput,
): RespondentDataSourceRuntime {
  const dataSourceLoader = createDocumentResourceDataSourceLoader((request) => {
    if (request.url !== input.receiptResourceUrl) {
      return { status: 'unavailable', reason: 'resource is outside the respondent receipt boundary' };
    }
    if (!isProofRoute(request.context, input.proofRoutes)) {
      return { status: 'unavailable', reason: 'receipt data is available only on a proof route' };
    }
    const caseRef = request.context.params.caseRef;
    if (!caseRef) {
      return { status: 'unavailable', reason: 'the receipt route has no confirmed case reference' };
    }
    const record = input.sessionStore.read(input.appId, input.releaseIdentity, caseRef);
    if (!record) {
      return {
        status: 'unavailable',
        reason: 'no receipt from this authenticated release is available in this session',
      };
    }
    return {
      status: 'loaded',
      freshness: 'fresh',
      value: Object.freeze({
        caseRef: record.caseRef,
        submittedAt: record.submittedAt,
        facts: Object.freeze([
          Object.freeze({
            label: 'Submission status',
            value: record.confirmation.status,
          }),
          ...(record.confirmation.trackingUri
            ? [Object.freeze({
                label: 'Tracking link',
                value: record.confirmation.trackingUri,
              })]
            : []),
        ]),
      }),
    };
  });

  const authorizeDataSource: DataSourceAuthorizer = (request) => {
    const source = request.descriptor.source;
    const authorized = (
      request.descriptor.catalogRef === request.descriptor.catalog.id
      && source.kind === 'document-resource'
      && source.owner === 'host'
      && source.runtime.authorizationBoundary === 'host'
      && source.runtime.provenance.kind === 'document-resource'
      && source.runtime.provenance.source === input.receiptResourceUrl
      && isProofRoute(request.context, input.proofRoutes)
    );
    return authorized
      ? { status: 'authorized' }
      : { status: 'refused', reason: 'source is outside the public respondent receipt boundary' };
  };

  return {
    dataSourceLoader,
    authorizeDataSource,
    validateDataSourcePayload: createSurfaceDataSourcePayloadValidator(),
  };
}

export function proofRouteAddresses(bundle: ResolvedBundle): ReadonlySet<string> {
  const addresses = new Set<string>();
  for (const surface of bundle.surfaces) {
    const surfaceRef = bundle.surfaceRefs?.get(surface);
    if (!surfaceRef) continue;
    for (const route of surface.routes) {
      if (route.routeClass === 'proof') {
        addresses.add(routeAddress(surfaceRef, route.id));
      }
    }
  }
  return addresses;
}

function isProofRoute(
  context: DataSourceActiveContext,
  proofRoutes: ReadonlySet<string>,
): boolean {
  return (
    typeof context.surfaceRef === 'string'
    && proofRoutes.has(routeAddress(context.surfaceRef, context.routeId))
  );
}

function routeAddress(surfaceRef: string, routeId: string): string {
  return `${surfaceRef}\0${routeId}`;
}
