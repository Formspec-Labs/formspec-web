import { describe, expect, it } from 'vitest';
import type {
  DataSourceActiveContext,
  DataSourceDescriptor,
} from '@formspec-org/surface';
import type { DataSourcesDocument } from '@formspec-org/types';
import {
  createRespondentDataSourceRuntime,
} from '../../src/verifying-surface/respondent/data-sources.ts';
import {
  createMemoryRespondentReceiptSessionStore,
  receiptRecordFromConfirmation,
} from '../../src/verifying-surface/respondent/session-store.ts';

const APP_ID = 'https://example.gov/apps/respondent';
const RELEASE = 'sha256:respondent-release';
const SURFACE = 'https://example.gov/surfaces/respondent';
const CATALOG = 'https://example.gov/data/respondent';
const RESOURCE = 'https://runtime.example.gov/respondent/receipt';

describe('respondent receipt Data Sources runtime', () => {
  it('loads the named receipt through the canonical loader, authorization, and schema bridge', async () => {
    const store = createMemoryRespondentReceiptSessionStore([
      receiptRecordFromConfirmation(
        APP_ID,
        RELEASE,
        {
          referenceNumber: 'CASE-301',
          status: 'accepted',
          trackingUri: 'https://status.example.gov/CASE-301',
        },
        '2026-07-28T20:30:00.000Z',
      ),
    ]);
    const runtime = createRespondentDataSourceRuntime({
      appId: APP_ID,
      releaseIdentity: RELEASE,
      receiptResourceUrl: RESOURCE,
      proofRoutes: new Set([`${SURFACE}\0receipt`]),
      sessionStore: store,
    });
    const descriptor = receiptDescriptor();
    const context = receiptContext('CASE-301');

    expect(await runtime.authorizeDataSource({ descriptor, context })).toEqual({
      status: 'authorized',
    });
    const loaded = await runtime.dataSourceLoader({ descriptor, context });
    expect(loaded).toMatchObject({
      status: 'loaded',
      freshness: 'fresh',
      value: {
        caseRef: 'CASE-301',
        submittedAt: '2026-07-28T20:30:00.000Z',
        facts: [
          { label: 'Submission status', value: 'accepted' },
          { label: 'Tracking link', value: 'https://status.example.gov/CASE-301' },
        ],
      },
    });
    expect(JSON.stringify(loaded)).not.toContain('Publisher');
    expect(JSON.stringify(loaded)).not.toContain('issuer');
    if (loaded.status !== 'loaded') return;
    expect(await runtime.validateDataSourcePayload({
      descriptor,
      context,
      schema: descriptor.source.schema as object,
      value: loaded.value,
    })).toEqual({ valid: true });
  });

  it('makes a refresh/deep link with no matching release record explicitly unavailable', async () => {
    const runtime = createRespondentDataSourceRuntime({
      appId: APP_ID,
      releaseIdentity: RELEASE,
      receiptResourceUrl: RESOURCE,
      proofRoutes: new Set([`${SURFACE}\0receipt`]),
      sessionStore: createMemoryRespondentReceiptSessionStore(),
    });

    await expect(runtime.dataSourceLoader({
      descriptor: receiptDescriptor(),
      context: receiptContext('CASE-NOT-IN-SESSION'),
    })).resolves.toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('no receipt'),
    });
  });

  it('refuses staff routes and non-receipt source families before loading', async () => {
    const runtime = createRespondentDataSourceRuntime({
      appId: APP_ID,
      releaseIdentity: RELEASE,
      receiptResourceUrl: RESOURCE,
      proofRoutes: new Set([`${SURFACE}\0receipt`]),
      sessionStore: createMemoryRespondentReceiptSessionStore(),
    });
    const staffContext = {
      ...receiptContext('CASE-302'),
      surfaceRef: 'https://example.gov/surfaces/staff',
      routeId: 'queue',
    };
    const queueDescriptor = {
      ...receiptDescriptor(),
      sourceRef: 'query:queue',
      source: {
        ...receiptDescriptor().source,
        id: 'query:queue',
        kind: 'query-result' as const,
      },
    };

    expect(await runtime.authorizeDataSource({
      descriptor: receiptDescriptor(),
      context: staffContext,
    })).toMatchObject({ status: 'refused' });
    expect(await runtime.authorizeDataSource({
      descriptor: queueDescriptor,
      context: receiptContext('CASE-302'),
    })).toMatchObject({ status: 'refused' });
  });
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
      availability: {
        level: 'route',
        surfaceRef: SURFACE,
        routeRef: 'receipt',
      },
      runtime: {
        delivery: 'snapshot',
        cache: { mode: 'none' },
        authorizationBoundary: 'host',
        failureMode: 'block-render',
        provenance: {
          kind: 'document-resource',
          source: RESOURCE,
        },
      },
      schema: {
        type: 'object',
        required: ['caseRef', 'submittedAt', 'facts'],
        additionalProperties: false,
        properties: {
          caseRef: { type: 'string' },
          submittedAt: { type: 'string' },
          facts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['label', 'value'],
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                value: { type: 'string' },
              },
            },
          },
        },
      },
    }],
  };
  return {
    catalogRef: CATALOG,
    sourceRef: 'resource:receipt',
    catalog,
    source: catalog.sources[0],
  };
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
