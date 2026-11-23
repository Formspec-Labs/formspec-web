import type { BundleExport } from '@formspec-org/surface';
import type { ResponseActionsDocument } from '@formspec-org/types';

/** Build a current test package from a historical export without changing the export bytes. */
export function declarePassportSigningOperations(bundle: BundleExport): BundleExport {
  const actionDocument = bundle.documents['urn:formspec:demo:d1:signing-app:response-actions'] as ResponseActionsDocument;
  const requests = actionDocument['x-formspec-runtime']?.requests;
  for (const [id, operation, method, pathTemplate] of [
    ['sign-draft', 'sign', 'POST', '/drafts/{draftId}/sign'],
    ['prepare-signing', 'prepare', 'PATCH', '/drafts/{draftId}'],
  ] as const) {
    const request = requests?.find(candidate => candidate.id === id);
    if (!request || request.request.method !== method || request.request.pathTemplate !== pathTemplate
      || (request.operation !== undefined && request.operation !== operation)) {
      throw new Error(`Historical passport fixture has an unexpected ${id} request`);
    }
    request.operation = operation;
  }
  return bundle;
}
