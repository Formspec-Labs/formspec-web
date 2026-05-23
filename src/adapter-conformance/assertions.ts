import type { FormDefinition, FormResponse, IntakeHandoff } from '@formspec-org/types';
import type { IdentityClaim } from '../ports/identity-provider.ts';
export {
  isApplicantStatusProjection,
  isRespondentPlaceSnapshot,
} from '../shared/respondent-place.ts';

export const providerNativeIdentityKeys = [
  'acr',
  'amr',
  'aud',
  'iss',
  'sub',
  'iat',
  'exp',
  'nbf',
  'vc',
  'vp',
  'proofType',
  'issuanceDate',
] as const;

export function isFormDefinition(value: unknown): value is FormDefinition {
  if (!isRecord(value)) return false;
  return (
    value.$formspec === '1.0' &&
    typeof value.url === 'string' &&
    typeof value.version === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.items)
  );
}

export function isFormResponse(value: unknown): value is FormResponse {
  if (!isRecord(value)) return false;
  return (
    value.$formspecResponse === '1.0' &&
    typeof value.definitionUrl === 'string' &&
    typeof value.definitionVersion === 'string' &&
    typeof value.authored === 'string' &&
    isRecord(value.data)
  );
}

export function isIntakeHandoff(value: unknown): value is IntakeHandoff {
  if (!isRecord(value) || !isRecord(value.definitionRef)) return false;
  return (
    value.$formspecIntakeHandoff === '1.0' &&
    typeof value.handoffId === 'string' &&
    value.initiationMode === 'publicIntake' &&
    typeof value.definitionRef.url === 'string' &&
    typeof value.definitionRef.version === 'string' &&
    typeof value.responseRef === 'string' &&
    typeof value.responseHash === 'string' &&
    typeof value.validationReportRef === 'string' &&
    typeof value.intakeSessionId === 'string' &&
    typeof value.ledgerHeadRef === 'string' &&
    typeof value.occurredAt === 'string'
  );
}

export function leakedProviderNativeIdentityKeys(claim: IdentityClaim): string[] {
  const candidate = claim as unknown as Record<string, unknown>;
  return providerNativeIdentityKeys.filter((key) => key in candidate);
}

export function isCanonicalIdentityClaim(value: unknown): value is IdentityClaim {
  if (!isRecord(value)) return false;
  return (
    typeof value.provider === 'string' &&
    typeof value.adapter === 'string' &&
    typeof value.subjectRef === 'string' &&
    typeof value.credentialType === 'string' &&
    typeof value.subjectBinding === 'string' &&
    typeof value.assuranceLevel === 'string' &&
    leakedProviderNativeIdentityKeys(value as unknown as IdentityClaim).length === 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
