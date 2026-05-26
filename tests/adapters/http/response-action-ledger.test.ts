import { describe, expect, it } from 'vitest';
import {
  createHttpResponseActionLedgerCapabilityProvider,
  type ResponseActionSessionOpBatchAppendCommand,
} from '../../../src/adapters/http/response-action-ledger.ts';
import { demoSampleForm } from '../../../src/demo/index.ts';
import type { ResponseActionRuntimeContext } from '../../../src/ports/response-action-ledger.ts';
import { publicPortalProfile } from '../../../src/profiles/profiles.ts';
import { tenantScopeHeaders } from '../../../src/profiles/tenant-headers.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';

describe('Response Actions Ledger HTTP adapter', () => {
  it('requests a BFF-issued capability with tenant headers and bearer auth', async () => {
    const { fetch, requests } = recordingFetch((request) => {
      expect(request.method).toBe('POST');
      return jsonResponse({
        ledgerScope: appendCommand.ledgerScope,
        capability: 'bff-issued-ledger-capability',
      });
    });
    const provider = createHttpResponseActionLedgerCapabilityProvider({
      endpoint: 'https://formspec-bff.example.test/response-actions/ledger/capability',
      tenantBinding: publicPortalProfile.tenantBinding,
      accessToken: async () => 'oidc-access-token',
      fetchImpl: fetch,
    });

    const capability = await provider({
      context: runtimeContext,
      formId: 'demo-intake',
      anonymousSession,
      appendCommand,
    });

    expect(capability).toBe('bff-issued-ledger-capability');
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(
      'https://formspec-bff.example.test/response-actions/ledger/capability',
    );
    expect(request?.headers.get('accept')).toBe('application/json');
    expect(request?.headers.get('content-type')).toBe('application/json');
    expect(request?.headers.get('authorization')).toBe('Bearer oidc-access-token');
    for (const [name, value] of Object.entries(tenantScopeHeaders(publicPortalProfile.tenantBinding))) {
      expect(request?.headers.get(name)).toBe(value);
    }
    expect(request?.body).toMatchObject({
      formId: 'demo-intake',
      runtimeDefinitionUrl: runtimeContext.runtimeDefinitionUrl,
      definitionVersion: demoSampleForm.version,
      anonymousSessionToken: anonymousSession.sessionToken,
      appendCommand,
    });
    expect(JSON.stringify(request?.body)).not.toContain('mint-authority');
    expect(JSON.stringify(request?.body)).not.toContain('hmac');
  });

  it('rejects a capability response for a different ledger scope', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        ledgerScope: 'urn:formspec:session:other',
        capability: 'bff-issued-ledger-capability',
      }),
    );
    const provider = createHttpResponseActionLedgerCapabilityProvider({
      endpoint: 'https://formspec-bff.example.test/response-actions/ledger/capability',
      fetchImpl: fetch,
    });

    await expect(provider({
      context: runtimeContext,
      formId: 'demo-intake',
      anonymousSession,
      appendCommand,
    })).rejects.toThrow(/ledgerScope mismatch/);
  });

  it('rejects blank or padded capabilities', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        ledgerScope: appendCommand.ledgerScope,
        capability: ' padded-capability ',
      }),
    );
    const provider = createHttpResponseActionLedgerCapabilityProvider({
      endpoint: 'https://formspec-bff.example.test/response-actions/ledger/capability',
      fetchImpl: fetch,
    });

    await expect(provider({
      context: runtimeContext,
      formId: 'demo-intake',
      anonymousSession,
      appendCommand,
    })).rejects.toThrow(/non-empty trimmed string/);
  });
});

const runtimeContext: ResponseActionRuntimeContext = {
  runtimeDefinitionUrl: 'https://formspec-server.example.test/runtime/forms/demo-intake',
  definition: demoSampleForm,
  draftKey: {
    formUrl: demoSampleForm.url,
    formVersion: demoSampleForm.version,
    subjectRef: 'anon:server-subject',
  },
  claim: null,
};

const anonymousSession = {
  sessionId: 'anon-session-1',
  sessionToken: 'anonymous-session-token',
  subjectRef: 'anon:server-subject',
  formId: 'demo-intake',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const ledgerScope = 'urn:formspec:session:anon-session-1';
const appendCommand: ResponseActionSessionOpBatchAppendCommand = {
  ledgerScope,
  sessionRef: {
    id: ledgerScope,
    openedAt: '2026-05-26T00:00:00.000Z',
    actors: ['urn:formspec:actor:human:anon:server-subject'],
  },
  branchId: 'branch-main',
  opBatch: {
    version: '1.0.0',
    sessionRef: {
      id: ledgerScope,
      openedAt: '2026-05-26T00:00:00.000Z',
      actors: ['urn:formspec:actor:human:anon:server-subject'],
    },
    branchId: 'branch-main',
    actor: {
      id: 'urn:formspec:actor:human:anon:server-subject',
      kind: 'human',
      actChannel: 'human',
    },
    artifactRefs: ['formspec-definition:https://formspec.example.test/forms/demo-intake'],
    previousHeads: [],
    newHeads: [],
    semanticOps: [],
    changeHashes: [],
  },
  opBatchHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  idempotencyKey: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  mode: 'require-anchored',
};
