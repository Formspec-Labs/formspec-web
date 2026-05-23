import type {
  ApplicantStatusProjection,
  RespondentPlaceSnapshot,
} from '../ports/index.ts';
import { WOS_APPLICANT_SCHEMA_ID } from '../ports/index.ts';

export function demoApplicantStatusProjection(): ApplicantStatusProjection {
  return {
    sourceSchema: WOS_APPLICANT_SCHEMA_ID,
    projectionKind: 'ApplicantStatusTimelineEntry',
    resourceRef: 'urn:wos:case_demo_0001',
    updatedAt: '2026-05-23T12:00:00.000Z',
    headline: 'Received',
    summary: 'Your demo intake was received and is waiting for review.',
  };
}

export function demoRespondentPlaceSnapshot(): RespondentPlaceSnapshot {
  return {
    $formspecRespondentLibrary: '1.0',
    version: '1.0.0',
    libraryId: 'urn:formspec:respondent-library:demo-wallet',
    subject: {
      subjectRef: 'respondent:demo',
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
        formRef: {
          url: 'https://benefits.example.gov/forms/renewal',
          version: '2026.1',
        },
      },
      {
        id: 'upload-address-proof',
        issuer: {
          name: 'Example Housing Office',
          url: 'https://housing.example.gov',
        },
        title: 'Upload proof of address',
        state: 'upcoming',
        dueAt: '2026-07-15T23:59:59.000Z',
      },
    ],
    documents: [
      {
        id: 'doc-proof-address',
        kind: 'proof-of-address',
        displayName: 'Utility bill',
        issuer: {
          name: 'Example Utility',
          url: 'https://utility.example.com',
        },
        capturedAt: '2026-05-01T12:00:00.000Z',
        contentRef: {
          uri: 'urn:formspec:blob:sha256:abc123',
          mediaType: 'application/pdf',
          sha256: 'abc123',
        },
        presentationPolicyRef: 'address-only',
      },
      {
        id: 'doc-receipt-benefits',
        kind: 'signed-receipt',
        displayName: 'Benefits intake receipt',
        capturedAt: '2026-05-23T12:05:00.000Z',
        contentRef: {
          uri: 'urn:formspec:receipt:demo-intake',
          mediaType: 'application/json',
        },
      },
    ],
    submissions: [
      {
        id: 'sub-demo-0001',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        definitionRef: {
          url: 'https://formspec.example.test/forms/demo-benefits-intake',
          version: '1.0.0',
        },
        submittedAt: '2026-05-23T12:00:00.000Z',
        applicantStatus: demoApplicantStatusProjection(),
        receiptRef: 'urn:formspec:receipt:demo-intake',
        documentRefs: ['doc-receipt-benefits'],
      },
    ],
    presentationPolicies: [
      {
        id: 'address-only',
        scope: 'selected-documents',
        documentRefs: ['doc-proof-address'],
        allowedPurposes: ['eligibility'],
        recipientIssuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        protocolHints: ['openid4vp', 'w3c-vc-data-model-2.0'],
      },
    ],
  };
}
