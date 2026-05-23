import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { createDemoComposition } from '../../src/composition/demo.ts';
import { applyBrandTheme, getUpstreamTokenRegistry } from '../../src/theme/theme.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import {
  sampleFormResponse,
  sampleIntakeHandoff,
} from '../../src/adapter-conformance/fixtures.ts';
import { buildIntakeHandoff } from '../../src/app/respondent-flow.ts';
import { departmentAppProfile, publicPortalProfile } from '../../src/profiles/profiles.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import { jsonResponse, recordingFetch } from '../adapters/http/test-fetch.ts';

describe('composition root smoke', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createStubComposition wires all 5 MVP ports', () => {
    const c = createStubComposition();
    expect(c.definitionSource).toBeDefined();
    expect(c.draftStore).toBeDefined();
    expect(c.submitTransport).toBeDefined();
    expect(c.identityProvider).toBeDefined();
    expect(c.notificationDelivery).toBeDefined();
  });

  it('createDemoComposition wires stubs and registers the sample form fixture', async () => {
    const c = createDemoComposition();
    const definition = await c.definitionSource.getDefinition(demoSampleForm.url, demoSampleForm.version);
    expect(c.mode).toBe('demo');
    expect(definition.title).toBe('Demo Benefits Intake');
  });

  it('createDefaultComposition falls back to demo mode without server env', () => {
    const c = createDefaultComposition();
    expect(c.definitionSource).toBeDefined();
    expect(c.identityProvider).toBeDefined();
    expect(c.mode).toBe('demo');
  });

  it('createDefaultComposition wires HTTP adapters when server env is present', () => {
    const c = createDefaultComposition({
      ...departmentAppProfile,
      referenceAdapters: {
        formspecStack: {
          ...departmentAppProfile.referenceAdapters?.formspecStack,
          tenantHeaderDialect: 'formspec',
          formspecServerUrl: 'https://formspec-server.example.test',
        },
      },
    });
    expect(c.mode).toBe('production');
    expect(c.initialDefinitionUrl).toBe(
      'https://formspec-server.example.test/runtime/forms/demo-intake',
    );
  });

  it('production publicPortal composition carries server anonymous sessions through draft submit', async () => {
    const { fetch, requests } = recordingFetch((request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/runtime/forms/demo-intake/sessions/anonymous') {
        return jsonResponse({
          session_token: 'anonymous-token-1',
          subject_ref: 'anon:server-subject',
          form_id: 'demo-intake',
          expires_at: '2099-01-01T00:00:00.000Z',
        });
      }
      if (request.method === 'GET' && path === '/runtime/forms/demo-intake') {
        return jsonResponse({ definition: demoSampleForm });
      }
      if (request.method === 'POST' && path === '/runtime/forms/demo-intake/drafts') {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: 1 });
      }
      if (request.method === 'POST' && path === '/drafts/draft-http-1/submit') {
        return jsonResponse({ response_id: 'response-http-1', status: 'accepted' });
      }
      return jsonResponse({ title: `unexpected ${request.method} ${path}` }, 500);
    });
    vi.stubGlobal('fetch', fetch);
    const c = createDefaultComposition({
      ...publicPortalProfile,
      referenceAdapters: {
        formspecStack: {
          ...publicPortalProfile.referenceAdapters?.formspecStack,
          tenantHeaderDialect: 'formspec',
          formspecServerUrl: 'https://formspec-server.example.test',
        },
      },
    });

    const [option] = await c.identityProvider.discover();
    if (!option) throw new Error('expected anonymous identity option');
    const claim = await c.identityProvider.authenticate(option);
    const definition = await c.definitionSource.getDefinition(c.initialDefinitionUrl);
    await c.draftStore.save(
      {
        formUrl: definition.url,
        formVersion: definition.version,
        subjectRef: claim.subjectRef,
      },
      sampleFormResponse,
    );
    const idempotencyKey = generateIdempotencyKey();
    const handoff = await buildIntakeHandoff({
      definition,
      response: sampleFormResponse,
      validationReport: null,
      draftKey: {
        formUrl: definition.url,
        formVersion: definition.version,
        subjectRef: claim.subjectRef,
      },
      claim,
      idempotencyKey,
    });

    await expect(c.submitTransport.submit(handoff, idempotencyKey)).resolves.toMatchObject({
      referenceNumber: 'response-http-1',
      status: 'accepted',
    });

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([
        'POST /runtime/forms/demo-intake/sessions/anonymous',
        'GET /runtime/forms/demo-intake',
        'POST /runtime/forms/demo-intake/drafts',
        'POST /drafts/draft-http-1/submit',
      ]);
    expect(requests[0]?.body).toMatchObject({ session_id: expect.stringMatching(/^web-/) });
    expect(requests[2]?.body).toMatchObject({
      anonymous_session_token: 'anonymous-token-1',
      anonymous_subject_ref: 'anon:server-subject',
      draft_state: sampleFormResponse.data,
    });
    expect(requests[3]?.body).toMatchObject({
      anonymous_session_token: 'anonymous-token-1',
      subject_ref: 'anon:server-subject',
      response_data: sampleFormResponse.data,
    });
  });

  it('SubmitTransport is idempotent on the same key', async () => {
    const { submitTransport } = createStubComposition();
    const key = generateIdempotencyKey();
    const first = await submitTransport.submit(sampleIntakeHandoff, key);
    const second = await submitTransport.submit(sampleIntakeHandoff, key);
    expect(second.referenceNumber).toBe(first.referenceNumber);
  });

  it('SubmitTransport returns a new reference number on a new key', async () => {
    const { submitTransport } = createStubComposition();
    const first = await submitTransport.submit(sampleIntakeHandoff, generateIdempotencyKey());
    const second = await submitTransport.submit(sampleIntakeHandoff, generateIdempotencyKey());
    expect(second.referenceNumber).not.toBe(first.referenceNumber);
  });

  it('IdentityProvider subscribe receives initial null then update on authenticate', async () => {
    const { identityProvider } = createStubComposition();
    const received: Array<unknown> = [];
    const unsubscribe = identityProvider.subscribe((c) => received.push(c));
    expect(received).toEqual([null]);
    const [option] = await identityProvider.discover();
    if (!option) throw new Error('expected at least one IdP option');
    const claim = await identityProvider.authenticate(option);
    expect(claim.assuranceLevel).toBe('L1');
    expect(received).toHaveLength(2);
    expect(received[1]).toBe(claim);
    unsubscribe();
  });

  it('consumes the upstream token registry vocabulary for brand overrides', () => {
    const registry = getUpstreamTokenRegistry();
    expect(registry).toHaveProperty('$formspecTokenRegistry', '1.0');
    expect(JSON.stringify(registry)).toContain('color.primary');
  });

  it('emits adapter-compatible CSS variable aliases from upstream tokens', () => {
    const target = document.createElement('div');
    applyBrandTheme(target);
    expect(target.style.getPropertyValue('--formspec-color-primary')).toBe('#155e56');
    expect(target.style.getPropertyValue('--formspec-color-primary-foreground')).toBe('#ffffff');
    expect(target.style.getPropertyValue('--formspec-color-text')).toBe('#1f2933');
    expect(target.style.getPropertyValue('--formspec-color-text-secondary')).toBe('#5d6b66');
    expect(target.style.getPropertyValue('--formspec-color-warning-border')).toBe('#946112');
  });
});
