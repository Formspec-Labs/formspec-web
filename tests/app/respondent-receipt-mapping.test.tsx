import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
import type { DataSourceActiveContext, DataSourceDescriptor } from '@formspec-org/surface';
import type { DataSourcesDocument } from '@formspec-org/types';
import {
  RESPONDENT_RECEIPT_MAPPING_DOCUMENT,
  materializeRespondentReceiptPanel,
} from '../../src/verifying-surface/respondent/receipt-mapping.ts';
import { createRespondentDataSourceRuntime } from '../../src/verifying-surface/respondent/data-sources.ts';
import { createMemoryRespondentReceiptSessionStore } from '../../src/verifying-surface/respondent/session-store.ts';

const APP_ID = 'https://example.gov/apps/respondent';
const RELEASE = 'sha256:respondent-release';
const SURFACE = 'https://example.gov/surfaces/respondent';
const CATALOG = 'https://example.gov/data/respondent';
const RESOURCE = 'https://runtime.example.gov/respondent/receipt';
const HASH_V1 = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HASH_V2 = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

beforeAll(async () => {
  await initFormspecEngine();
});

function receiptDescriptor(): DataSourceDescriptor {
  const catalog: DataSourcesDocument = {
    $formspecDataSources: '1.0',
    id: CATALOG,
    version: '1.0.0',
    sources: [{
      id: 'resource:receipt',
      kind: 'document-resource',
      owner: 'host',
      scope: 'route',
      availability: { level: 'route', surfaceRef: SURFACE, routeRef: 'receipt' },
      runtime: {
        delivery: 'snapshot',
        cache: { mode: 'none' },
        authorizationBoundary: 'host',
        failureMode: 'block-render',
        provenance: { kind: 'document-resource', source: RESOURCE },
      },
      schema: {
        type: 'object',
        required: ['caseRef', 'facts'],
        additionalProperties: false,
        properties: {
          caseRef: { type: 'string' },
          receiptId: { type: 'string' },
          submittedAt: { type: 'string' },
          fingerprint: { type: 'string' },
          facts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['label', 'value'],
              additionalProperties: false,
              properties: { label: { type: 'string' }, value: { type: 'string' } },
            },
          },
        },
      },
    }],
  };
  return { catalogRef: CATALOG, sourceRef: 'resource:receipt', catalog, source: catalog.sources[0] };
}

function receiptContext(caseRef: string): DataSourceActiveContext {
  return {
    surfaceId: 'respondent',
    surfaceRef: SURFACE,
    routeId: 'receipt',
    slotId: 'receipt-panel',
    moduleId: 'x-respondent',
    widgetName: 'ReceiptPanel',
    params: { caseRef },
    sessionGeneration: RELEASE,
  };
}

describe('Declarative Mapping feeding ReceiptPanel (fs-c0cc)', () => {
  it('materializes receiptId, server accepted_at, and fingerprint through RESPONDENT_RECEIPT_MAPPING_DOCUMENT', () => {
    expect(RESPONDENT_RECEIPT_MAPPING_DOCUMENT.$formspecMapping).toBe('1.0');
    const mapped = materializeRespondentReceiptPanel({
      case_ref: 'CASE-501',
      receipt_id: 'rcpt-v1-501',
      accepted_at: '2026-06-10T09:15:00Z',
      response_hash: HASH_V1,
      status: 'accepted',
      tracking_uri: 'https://status.example.test/CASE-501',
    });
    expect(mapped).toEqual({
      caseRef: 'CASE-501',
      receiptId: 'rcpt-v1-501',
      submittedAt: '2026-06-10T09:15:00Z',
      fingerprint: HASH_V1,
      facts: [
        { label: 'Submission status', value: 'accepted' },
        { label: 'Tracking link', value: 'https://status.example.test/CASE-501' },
      ],
    });
  });

  it('hydrates fresh-device server receipts across two versions, preserves server accepted_at across reload, and omits malformed time', async () => {
    const store = createMemoryRespondentReceiptSessionStore();
    const serverRecords = new Map([
      ['CASE-V1', {
        receipt_id: 'rcpt-v1',
        accepted_at: '2026-06-10T09:15:00Z',
        response_hash: HASH_V1,
        form_version_id: 'fv-1.0.0',
        status: 'accepted',
      }],
      ['CASE-V2', {
        receipt_id: 'rcpt-v2',
        accepted_at: 'not-a-timestamp',
        response_hash: HASH_V2,
        form_version_id: 'fv-2.0.0',
        status: 'accepted',
      }],
    ]);
    const readServerReceipt = vi.fn(async (caseRef: string) => {
      const found = serverRecords.get(caseRef);
      if (!found) return { status: 'unavailable' as const, reason: 'receipt unavailable' };
      return { status: 'loaded' as const, recordId: found.receipt_id, receipt: found };
    });

    const runtime = createRespondentDataSourceRuntime({
      appId: APP_ID,
      releaseIdentity: RELEASE,
      receiptResourceUrl: RESOURCE,
      proofRoutes: new Set([`${SURFACE}\0receipt`]),
      sessionStore: store,
      readServerReceipt,
    });

    const descriptor = receiptDescriptor();
    // 1. Fresh device read for version 1 -> fetches from server, maps via declarative Mapping, persists to sessionStore.
    const first = await runtime.dataSourceLoader({ descriptor, context: receiptContext('CASE-V1') });
    expect(first).toMatchObject({
      status: 'loaded',
      freshness: 'fresh',
      value: {
        caseRef: 'CASE-V1',
        receiptId: 'rcpt-v1',
        submittedAt: '2026-06-10T09:15:00Z',
        fingerprint: HASH_V1,
      },
    });
    expect(readServerReceipt).toHaveBeenCalledTimes(1);

    // 2. Reload on the same browser (no server call needed) preserves receiptId, server accepted_at, and fingerprint!
    const reloadedRuntime = createRespondentDataSourceRuntime({
      appId: APP_ID,
      releaseIdentity: RELEASE,
      receiptResourceUrl: RESOURCE,
      proofRoutes: new Set([`${SURFACE}\0receipt`]),
      sessionStore: store,
    });
    const reloaded = await reloadedRuntime.dataSourceLoader({ descriptor, context: receiptContext('CASE-V1') });
    expect(reloaded).toMatchObject({
      status: 'loaded',
      value: {
        caseRef: 'CASE-V1',
        receiptId: 'rcpt-v1',
        submittedAt: '2026-06-10T09:15:00Z',
        fingerprint: HASH_V1,
      },
    });

    // 3. Second version with malformed accepted_at omits submittedAt cleanly without fabricating client clock.
    const second = await runtime.dataSourceLoader({ descriptor, context: receiptContext('CASE-V2') });
    expect(second.status).toBe('loaded');
    if (second.status === 'loaded') {
      expect(second.value).toMatchObject({
        caseRef: 'CASE-V2',
        receiptId: 'rcpt-v2',
        fingerprint: HASH_V2,
      });
      expect(second.value).not.toHaveProperty('submittedAt');
    }

    // 4. Unknown/unauthorized caseRef remains unavailable.
    const missing = await runtime.dataSourceLoader({ descriptor, context: receiptContext('CASE-OTHER') });
    expect(missing.status).toBe('unavailable');
  });
});
