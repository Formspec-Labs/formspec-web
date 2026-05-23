import { describe, expect, it } from 'vitest';
import {
  AnonymousSessionBridge,
  HttpAnonymousIdentityProvider,
} from '../../../src/adapters/http/anonymous-session.ts';
import { sampleFormDefinition, sampleIntakeHandoff } from '../../../src/adapter-conformance/fixtures.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';

describe('AnonymousSessionBridge', () => {
  it('issues anonymous sessions through POST /runtime/forms/{form_id}/sessions/anonymous', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({
        session_token: 'anonymous-token-1',
        subject_ref: 'anon:server-subject',
        form_id: 'conformance',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    const bridge = new AnonymousSessionBridge({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      sessionIdFactory: () => 'web-session-1',
    });

    await expect(bridge.sessionForForm(sampleFormDefinition.url, sampleFormDefinition.version))
      .resolves.toMatchObject({
        sessionToken: 'anonymous-token-1',
        subjectRef: 'anon:server-subject',
      });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toBe(
      'https://formspec-server.example.test/runtime/forms/conformance/sessions/anonymous',
    );
    expect(requests[0]?.body).toEqual({ session_id: 'web-session-1' });
  });

  it('caches and coalesces same-form session issuance', async () => {
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const { fetch, requests } = recordingFetch(async () => {
      await responseGate;
      return jsonResponse({
        session_token: 'anonymous-token-1',
        subject_ref: 'anon:server-subject',
        form_id: 'conformance',
        expires_at: '2099-01-01T00:00:00.000Z',
      });
    });
    const bridge = new AnonymousSessionBridge({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      sessionIdFactory: () => 'web-session-1',
    });

    const first = bridge.sessionForForm(sampleFormDefinition.url, sampleFormDefinition.version);
    const second = bridge.sessionForForm(sampleFormDefinition.url, sampleFormDefinition.version);
    await waitForRequests(requests, 1);
    expect(requests).toHaveLength(1);

    releaseResponse?.();
    const [firstSession, secondSession] = await Promise.all([first, second]);
    expect(secondSession).toEqual(firstSession);

    await expect(bridge.sessionForForm(sampleFormDefinition.url, sampleFormDefinition.version))
      .resolves.toEqual(firstSession);
    expect(requests).toHaveLength(1);
  });

  it('resolves tokens for anonymous draft keys and handoffs only when subjects match', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        session_token: 'anonymous-token-1',
        subject_ref: 'anon:server-subject',
        form_id: 'conformance',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    const bridge = new AnonymousSessionBridge({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(
      bridge.tokenForDraftKey({
        formUrl: sampleFormDefinition.url,
        formVersion: sampleFormDefinition.version,
        subjectRef: 'anon:server-subject',
      }),
    ).resolves.toBe('anonymous-token-1');
    await expect(
      bridge.tokenForHandoff({
        ...sampleIntakeHandoff,
        subjectRef: 'anon:server-subject',
      }),
    ).resolves.toBe('anonymous-token-1');
    await expect(
      bridge.tokenForDraftKey({
        formUrl: sampleFormDefinition.url,
        formVersion: sampleFormDefinition.version,
        subjectRef: 'respondent:known-subject',
      }),
    ).resolves.toBeUndefined();
    await expect(
      bridge.tokenForDraftKey({
        formUrl: sampleFormDefinition.url,
        formVersion: sampleFormDefinition.version,
        subjectRef: 'anon:different-subject',
      }),
    ).rejects.toThrow(/subject does not match/);
  });
});

describe('HttpAnonymousIdentityProvider', () => {
  it('normalizes server-issued anonymous sessions into canonical identity claims', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        session_token: 'anonymous-token-1',
        subject_ref: 'anon:server-subject',
        form_id: 'conformance',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    const bridge = new AnonymousSessionBridge({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });
    const adapter = new HttpAnonymousIdentityProvider({
      bridge,
      formUrl: sampleFormDefinition.url,
      formVersion: sampleFormDefinition.version,
    });

    const [option] = await adapter.discover();
    if (!option) throw new Error('expected anonymous option');
    await expect(adapter.authenticate(option)).resolves.toMatchObject({
      provider: 'formspec-server-anonymous-session',
      adapter: 'formspec-server-anonymous-session@0',
      subjectRef: 'anon:server-subject',
      credentialType: 'provider-assertion',
      credentialRef: 'anonymous-session:conformance',
      assuranceLevel: 'L1',
      privacyTier: 'anonymous',
    });
  });
});

async function waitForRequests(requests: unknown[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (requests.length >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
