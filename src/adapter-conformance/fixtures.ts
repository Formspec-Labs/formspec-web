import type { FormDefinition, FormResponse, IntakeHandoff } from '@formspec-org/types';
import type { NotificationMessage } from '../ports/notification-delivery.ts';
import type {
  ApplicantStatusProjection,
  ApplicantStatusResource,
  EmbedMessage,
  HistorySnapshot,
  Money,
  RespondentPlaceSnapshot,
} from '../ports/index.ts';
import { WOS_APPLICANT_SCHEMA_ID } from '../ports/index.ts';

export const sampleFormDefinition: FormDefinition = {
  $formspec: '1.0',
  url: 'https://formspec.example.test/forms/conformance',
  version: '1.0.0',
  title: 'Conformance Test Form',
  items: [
    {
      key: 'fullName',
      type: 'field',
      label: 'Full name',
      dataType: 'string',
    },
  ],
};

export const sampleFormResponse: FormResponse = {
  $formspecResponse: '1.0',
  definitionUrl: sampleFormDefinition.url,
  definitionVersion: sampleFormDefinition.version,
  status: 'completed',
  data: {
    fullName: 'Ada Lovelace',
  },
  authored: '2026-05-22T00:00:00.000Z',
};

export const sampleIntakeHandoff: IntakeHandoff = {
  $formspecIntakeHandoff: '1.0',
  handoffId: 'handoff-conformance-1',
  initiationMode: 'publicIntake',
  definitionRef: {
    url: sampleFormDefinition.url,
    version: sampleFormDefinition.version,
  },
  responseRef: 'response:conformance:1',
  responseHash: 'sha256:conformance-response',
  validationReportRef: 'validation:conformance:1',
  intakeSessionId: 'intake-session-conformance-1',
  ledgerHeadRef: 'ledger:conformance:head',
  occurredAt: '2026-05-22T00:00:00.000Z',
};

export const sampleNotificationMessage: NotificationMessage = {
  channel: 'email',
  to: 'respondent@example.test',
  subject: 'Conformance message',
  body: 'This message exercises NotificationDelivery conformance.',
};

export const sampleApplicantStatusProjection: ApplicantStatusProjection = {
  sourceSchema: WOS_APPLICANT_SCHEMA_ID,
  projectionKind: 'ApplicantStatusTimelineEntry',
  resourceRef: 'urn:wos:case_conformance_0001',
  updatedAt: '2026-05-23T00:00:00.000Z',
  headline: 'Received',
  summary: 'The applicant projection is sourced from the WOS applicant API.',
};

export const sampleApplicantStatusResource: ApplicantStatusResource = {
  event: 'applicant-task-submitted',
  occurredAt: '2026-05-23T00:00:00.000Z',
  summary: 'The applicant projection is sourced from the WOS applicant API.',
};

export const sampleRespondentPlaceSnapshot: RespondentPlaceSnapshot = {
  $formspecRespondentLibrary: '1.0',
  version: '1.0.0',
  libraryId: 'urn:formspec:respondent-library:conformance',
  subject: {
    subjectRef: 'respondent:conformance',
    privacyTier: 'pseudonymous',
  },
  aggregationMode: 'client-wallet',
  trustModel: {
    storagePosture: 'client-local-only',
    issuerIsolation: 'per-issuer',
    serverAggregation: 'forbidden',
    presentationDefault: 'explicit-consent',
  },
  obligations: [
    {
      id: 'renew-benefits',
      issuer: {
        name: 'Example Department of Benefits',
        url: 'https://benefits.example.gov',
      },
      title: 'Renew household benefits',
      state: 'due',
      dueAt: '2026-06-30T23:59:59.000Z',
    },
  ],
  documents: [
    {
      id: 'doc-proof-address',
      kind: 'proof-of-address',
      displayName: 'Utility bill',
      capturedAt: '2026-05-01T12:00:00.000Z',
      contentRef: {
        uri: 'urn:formspec:blob:sha256:abc123',
        mediaType: 'application/pdf',
        sha256: 'abc123',
      },
      presentationPolicyRef: 'address-only',
    },
  ],
  submissions: [
    {
      id: 'sub-conformance-0001',
      issuer: {
        name: 'Example Department of Benefits',
        url: 'https://benefits.example.gov',
      },
      definitionRef: {
        url: sampleFormDefinition.url,
        version: sampleFormDefinition.version,
      },
      submittedAt: '2026-05-23T00:00:00.000Z',
      applicantStatus: sampleApplicantStatusProjection,
      documentRefs: ['doc-proof-address'],
    },
  ],
  presentationPolicies: [
    {
      id: 'address-only',
      scope: 'selected-documents',
      documentRefs: ['doc-proof-address'],
      allowedPurposes: ['eligibility'],
    },
  ],
};

export function roundTripJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// FW-0033: deterministic bytes so hash assertions are stable.
const SAMPLE_ATTACHMENT_BYTES = new Uint8Array([
  0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x46, 0x57, 0x2d, 0x30, 0x30, 0x33, 0x33, 0x0a,
]);
const DIFFERENT_ATTACHMENT_BYTES = new Uint8Array([0x44, 0x49, 0x46, 0x46, 0x45, 0x52]);

export function sampleAttachmentBlob(): Blob {
  return new Blob([SAMPLE_ATTACHMENT_BYTES], { type: 'application/octet-stream' });
}

export function differentAttachmentBlob(): Blob {
  return new Blob([DIFFERENT_ATTACHMENT_BYTES], { type: 'application/octet-stream' });
}

export const sampleAttachmentMetadata = {
  filename: 'lease-agreement.pdf',
  mimeType: 'application/pdf',
} as const;

// FW-0027: payment-rail conformance fixtures. Money amounts use the
// minor-units integer convention (cents for USD) to avoid floating-point
// drift; the methodToken is the opaque slice-1 placeholder real adapters
// replace with rail-vended ephemeral tokens (Stripe `pm_*`, Square nonce,
// W3C Payment Request API id, etc.).
export const samplePaymentAmount: Money = {
  amountMinorUnits: 1250,
  currency: 'USD',
};

export const samplePaymentMethodToken = 'demo-method-stub';

// FW-0040: embed-transport conformance fixtures. The host origin is a
// fixed test-domain string so adopter conformance assertions against the
// allow-list have a deterministic comparison value; the message is the
// slice-1 handshake variant.
export const sampleAllowedHostOrigin = 'https://allowed.example.test';

export const sampleEmbedMessage: EmbedMessage = {
  kind: 'host-handshake',
  hostOrigin: sampleAllowedHostOrigin,
};

// FW-0057: cross-issuer history conformance fixture — three entries across
// two issuers spanning all three closed kinds. Issuer names are display
// strings (no protocol vocabulary); timestamps span a few days so the
// round-trip preserves time ordering.
export const sampleHistorySnapshot: HistorySnapshot = {
  $formspecRespondentHistory: '1.0',
  aggregationMode: 'client-wallet',
  subjectRef: 'respondent:conformance',
  entries: [
    {
      id: 'sample-draft',
      kind: 'draft',
      issuer: { name: 'Example Agency A', url: 'https://agency-a.example' },
      timestamp: '2026-05-22T10:00:00.000Z',
      title: 'Sample draft',
    },
    {
      id: 'sample-submission',
      kind: 'submission',
      issuer: { name: 'Example Agency A', url: 'https://agency-a.example' },
      timestamp: '2026-05-20T12:00:00.000Z',
      title: 'Sample submission',
      applicantStatusRef: 'urn:wos:case_conformance_0001',
    },
    {
      id: 'sample-signed-record',
      kind: 'signed-record',
      issuer: { name: 'Example Agency B', url: 'https://agency-b.example' },
      timestamp: '2026-05-15T09:30:00.000Z',
      title: 'Sample signed record',
      receiptRef: 'urn:formspec:receipt:sample-conformance',
      documentRefs: ['doc-sample-0001'],
    },
  ],
};
