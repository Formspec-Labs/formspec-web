import { initFormspecEngine } from '@formspec-org/engine';
import {
  createDocumentResourceDataSourceLoader,
  type DataSourceActiveContext,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
  type ResolvedBundle,
} from '@formspec-org/surface';
import type { MappingDocument } from '@formspec-org/types';
import type { RespondentReceiptReadResult } from '../../adapters/http/response-receipt.ts';
import { createSurfaceDataSourcePayloadValidator } from '../../adapters/schema/index.ts';
import { isAcceptanceTime } from '../../shared/acceptance-time.ts';
import {
  materializeRespondentReceiptPanel,
  RESPONDENT_RECEIPT_MAPPING_DOCUMENT,
} from './receipt-mapping.ts';
import {
  receiptRecordFromConfirmation,
  type RespondentReceiptSessionStore,
} from './session-store.ts';

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
  /** Optional respondent-scoped server receipt reader (`GET /responses/{id}/receipt`) for fresh-device hydration. */
  readonly readServerReceipt?: (caseRef: string) => Promise<RespondentReceiptReadResult>;
  /** Optional declarative Mapping override; defaults to `RESPONDENT_RECEIPT_MAPPING_DOCUMENT`. */
  readonly receiptMapping?: MappingDocument;
}

export function createRespondentDataSourceRuntime(
  input: RespondentDataSourceRuntimeInput,
): RespondentDataSourceRuntime {
  const mappingDocument = input.receiptMapping ?? RESPONDENT_RECEIPT_MAPPING_DOCUMENT;
  const dataSourceLoader = createDocumentResourceDataSourceLoader(async (request) => {
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
    let record = input.sessionStore.read(input.appId, input.releaseIdentity, caseRef);
    if (!record && input.readServerReceipt) {
      const serverRead = await input.readServerReceipt(caseRef);
      if (serverRead.status !== 'loaded') {
        return {
          status: 'unavailable',
          reason: serverRead.reason || 'receipt unavailable',
        };
      }
      const receipt = serverRead.receipt;
      const normalizedStatus = receipt.status === 'queued' || receipt.status === 'rejected'
        ? receipt.status
        : 'accepted';
      const persisted = receiptRecordFromConfirmation(input.appId, input.releaseIdentity, {
        referenceNumber: receipt.case_ref ?? caseRef,
        receiptId: receipt.receipt_id,
        responseHash: receipt.response_hash,
        status: normalizedStatus,
        ...(isAcceptanceTime(receipt.accepted_at) ? { acceptedAt: receipt.accepted_at } : {}),
        ...(receipt.tracking_uri ? { trackingUri: receipt.tracking_uri } : {}),
      });
      input.sessionStore.write(persisted);
      record = persisted;
    }
    if (!record) {
      return {
        status: 'unavailable',
        reason: 'no receipt from this authenticated release is available in this session',
      };
    }
    await initFormspecEngine();
    const mapped = materializeRespondentReceiptPanel({
      case_ref: record.caseRef,
      ...(record.confirmation.receiptId !== undefined ? { receipt_id: record.confirmation.receiptId } : {}),
      ...(record.confirmation.acceptedAt !== undefined ? { accepted_at: record.confirmation.acceptedAt } : {}),
      ...(record.confirmation.responseHash !== undefined ? { response_hash: record.confirmation.responseHash } : {}),
      status: record.confirmation.status,
      ...(record.confirmation.trackingUri !== undefined ? { tracking_uri: record.confirmation.trackingUri } : {}),
    }, mappingDocument);
    return {
      status: 'loaded',
      freshness: 'fresh',
      value: mapped,
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
