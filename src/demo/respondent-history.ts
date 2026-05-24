import type { HistorySnapshot } from '../ports/respondent-history-source.ts';

/**
 * Demo cross-issuer history fixture (FW-0057 slice 1).
 *
 * Four entries across two senders (Example Department of Benefits, Example
 * Tax Office), spanning the three closed kinds (draft / submission /
 * signed-record). Timestamps span ~30 days so the timeline sort order is
 * visible. The submission for the benefits intake cross-links to the demo
 * applicant-status URN (urn:wos:case_demo_0001) so the /history → /status
 * link contract demos honestly; the signed-record cross-links to the demo
 * receipt URI + document ref so the /history → /documents line demos too.
 *
 * Honesty caveat: real cross-issuer aggregation requires XS-2 (multi-issuer
 * token bag per stack-root ADR-0068 D-1 + D-3). This fixture presents
 * pre-aggregated entries from two fake issuers — there is no multi-issuer
 * auth ceremony in the demo flow. The /history dashboard's deferred copy
 * names the gap.
 */
export function demoHistorySnapshot(): HistorySnapshot {
  return {
    $formspecRespondentHistory: '1.0',
    aggregationMode: 'client-wallet',
    subjectRef: 'respondent:demo',
    entries: [
      {
        id: 'hist-draft-tax-q2',
        kind: 'draft',
        issuer: {
          name: 'Example Tax Office',
          url: 'https://tax.example.gov',
        },
        timestamp: '2026-05-18T16:42:00.000Z',
        title: 'Q2 tax filing draft',
        definitionRef: {
          url: 'https://tax.example.gov/forms/q2-filing',
          version: '2026.2',
        },
      },
      {
        id: 'hist-submission-benefits-intake',
        kind: 'submission',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        timestamp: '2026-05-23T12:00:00.000Z',
        title: 'Benefits intake',
        applicantStatusRef: 'urn:wos:case_demo_0001',
        definitionRef: {
          url: 'https://formspec.example.test/forms/demo-benefits-intake',
          version: '1.0.0',
        },
      },
      {
        id: 'hist-submission-housing-application',
        kind: 'submission',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        timestamp: '2026-04-12T09:15:00.000Z',
        title: 'Housing assistance application',
        definitionRef: {
          url: 'https://benefits.example.gov/forms/housing-assistance',
          version: '2025.4',
        },
      },
      {
        id: 'hist-signed-benefits-receipt',
        kind: 'signed-record',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        timestamp: '2026-05-23T12:05:00.000Z',
        title: 'Benefits intake receipt',
        receiptRef: 'urn:formspec:receipt:demo-intake',
        documentRefs: ['doc-receipt-benefits'],
      },
    ],
  };
}
