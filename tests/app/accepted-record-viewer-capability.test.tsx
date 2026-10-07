import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonicalResponseHandoffBytes } from '@formspec-org/integrity-canonical';
import { responseReviewHandoffHash, starterWidgetModule, type SurfaceWidgetProps } from '@formspec-org/surface-react';
import { ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA, ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA, ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA,
  RESPONSE_REVIEW_PRESENTATION_SCHEMA, SIGNING_CEREMONY_REVIEW_SCHEMA, RESPONSE_REVIEW_COPY_KEYS, RESPONSE_REVIEW_WIDGET_SHAPE,
  ACCEPTED_RESPONSE_REVIEW_WIDGET_SHAPE, ACCEPTED_RESPONSE_REVIEW_CONFIG_SCHEMA, ACCEPTED_RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
  type AcceptedResponseReviewData, type ResponseReviewData, type ResponseReviewOptions } from '@formspec-org/surface-react/widget-metadata';
import definitionSchema from '../../vendor/formspec-schemas/definition.schema.json';
import responseSchema from '../../vendor/formspec-schemas/response.schema.json';
import commonSchema from '../../vendor/formspec-schemas/common.schema.json';
import issuerSchema from '../../vendor/formspec-schemas/issuer.schema.json';
import validationResultSchema from '../../vendor/formspec-schemas/validation-result.schema.json';
import verificationReceiptSchema from '../../vendor/formspec-schemas/verification-receipt.schema.json';
import registryV5 from '../../public/demo-packages/d1-passport/v0.1.5/passport-renewal.registry.json';
import registryV6 from '../../public/demo-packages/d1-passport/v0.1.6/passport-renewal.registry.json';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const copy = { ...Object.fromEntries(RESPONSE_REVIEW_COPY_KEYS.map(key => [key, key])),
  heading: 'Accepted answers', acceptedRecord: 'Recorded answers', unavailable: 'Review unavailable' };

async function fixture(): Promise<AcceptedResponseReviewData> {
  const definition: AcceptedResponseReviewData['definition'] = { $formspec: '1.0', url: 'urn:test:accepted-view', version: '1', title: 'Accepted answers', status: 'active',
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }] };
  const response: AcceptedResponseReviewData['response'] = { $formspecResponse: '1.0', id: '019b0000-0000-7000-8000-000000000001',
    definitionUrl: definition.url, definitionVersion: definition.version, status: 'completed', authored: '2026-10-07T00:00:00Z',
    displayedLocale: { locale: 'en', version: '1' }, data: { name: 'Recorded answer' } };
  return { definition, response, presentation: { responseHash: await responseReviewHandoffHash(response, canonicalResponseHandoffBytes),
    definitionUrl: definition.url, definitionVersion: definition.version, locale: response.displayedLocale!.locale,
    phase: 'accepted-record', handoffId: 'retained-test-handoff', fields: { name: { label: 'Recorded name' } } } };
}
function mount(data: AcceptedResponseReviewData | ResponseReviewData, options: ResponseReviewOptions = {},
  widgetName = data.presentation.phase === 'accepted-record' ? 'AcceptedResponseReview' : 'ResponseReview', custom = true) {
  const module = starterWidgetModule('x-test-accepted', custom ? { responseReview: { canonicalResponseHandoffBytes, ...options } } : undefined);
  const Widget = module.widgets[widgetName]!;
  const { acceptedRecord, ...signingCopy } = copy;
  expect(acceptedRecord).toBe('Recorded answers');
  const props: SurfaceWidgetProps = { moduleId: module.moduleId, widgetName, slot: { id: 'review' },
    route: { surfaceId: 'test-surface', routeId: 'review', params: {}, routeClass: undefined }, headingLevel: 2, admitsTenantTheme: false,
    config: { copy: { en: data.presentation.phase === 'accepted-record' ? copy : signingCopy } }, data: { ...data }, emitAction: vi.fn() };
  return render(<Widget {...props} {...(!custom ? { canonicalResponseHandoffBytes, ...options } : {})} />);
}

describe('public accepted-record viewer capability', () => {
  it('preserves the exact immutable v0.1.5 and v0.1.6 signing Registry shape while declaring a distinct accepted identity', () => {
    for (const registry of [registryV5, registryV6]) {
      const entry = registry.entries.find(entry => entry.name === 'x-response-review');
      expect(entry?.widgetShape).toEqual(RESPONSE_REVIEW_WIDGET_SHAPE);
    }
    expect(ACCEPTED_RESPONSE_REVIEW_WIDGET_SHAPE.widgetName).toBe('AcceptedResponseReview');
    expect(ACCEPTED_RESPONSE_REVIEW_WIDGET_SHAPE.props).toEqual(ACCEPTED_RESPONSE_REVIEW_CONFIG_SCHEMA);
    for (const module of [starterWidgetModule('x-test-accepted'), starterWidgetModule('x-test-accepted', { responseReview: {} })]) {
      expect(module.widgets.AcceptedResponseReview).toBeTypeOf('function');
      expect(module.widgets['x-accepted-response-review']).toBeTypeOf('function');
      expect(module.contracts?.AcceptedResponseReview.deliveryContractId).toBe(ACCEPTED_RESPONSE_REVIEW_DELIVERY_CONTRACT_ID);
    }
  });
  it('admits the exact public accepted input while refusing signing authority and missing handoff identity', async () => {
    const data = await fixture();
    const ajv = new Ajv({ strict: false }); addFormats(ajv);
    for (const schema of [commonSchema, issuerSchema, validationResultSchema, verificationReceiptSchema, definitionSchema, responseSchema]) ajv.addSchema(schema);
    const validate = ajv.compile(ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA);
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
    for (const extra of [{ actorRef: 'actor' }, { draft: { id: 'draft', version: 1 } }]) {
      expect(validate({ ...data, presentation: { ...data.presentation, ...extra } })).toBe(false);
    }
    const { handoffId: omitted, ...missing } = data.presentation;
    expect(omitted).toBe('retained-test-handoff');
    expect(validate({ ...data, presentation: missing })).toBe(false);
    expect(ajv.compile(RESPONSE_REVIEW_PRESENTATION_SCHEMA)(data.presentation)).toBe(false);
    const state = { status: 'ready', phase: 'accepted-record', handoffId: data.presentation.handoffId, responseHash: data.presentation.responseHash,
      locale: 'en', contextIdentity: 'a'.repeat(64) };
    expect(ajv.compile(ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA)(state)).toBe(true);
    expect(ajv.compile(SIGNING_CEREMONY_REVIEW_SCHEMA)({ state, contextIdentity: state.contextIdentity })).toBe(false);
    expect(ajv.compile(ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA)(data.presentation)).toBe(true);
  });

  it.each(['AcceptedResponseReview', 'x-accepted-response-review'])('renders retained answers through %s and publishes only accepted availability', async widgetName => {
    const data = await fixture(); const original = structuredClone(data);
    const accepted = vi.fn(), signing = vi.fn(); const view = mount(data, { onAcceptedReviewState: accepted, onReviewState: signing }, widgetName);
    await screen.findByText('Recorded answer');
    await waitFor(() => expect(accepted.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'ready', phase: 'accepted-record',
      handoffId: data.presentation.handoffId, locale: data.response.displayedLocale!.locale, responseHash: data.presentation.responseHash }));
    expect(signing).not.toHaveBeenCalled(); expect(data).toEqual(original);
    expect(view.container.querySelector('input,select,textarea')).toBeNull();
    expect(accepted.mock.calls.at(-1)?.[0]).not.toHaveProperty('draft'); expect(accepted.mock.calls.at(-1)?.[0]).not.toHaveProperty('actorRef');
    view.unmount(); expect(accepted.mock.calls.at(-1)?.[0].status).toBe('unavailable'); expect(signing).not.toHaveBeenCalled();
  });

  it.each([['ResponseReview', false], ['x-response-review', false], ['ResponseReview', true], ['x-response-review', true]] as const)(
    'keeps %s signing callback supported with custom factory options=%s', async (widgetName, custom) => {
    const data = await fixture(); const { handoffId, ...common } = data.presentation;
    expect(handoffId).toBeTruthy();
    const signingData: ResponseReviewData = { ...data, presentation: { ...common, phase: 'before-sign', actorRef: 'test-actor', draft: { id: 'test-draft', version: 2 } } };
    const accepted = vi.fn(), signing = vi.fn(); mount(signingData, { onAcceptedReviewState: accepted, onReviewState: signing }, widgetName, custom);
    await waitFor(() => expect(signing.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'ready', phase: 'before-sign', draft: { id: 'test-draft', version: 2 } }));
    expect(accepted).not.toHaveBeenCalled();
  });

  it.each(['accepted-on-signing', 'signing-on-accepted'] as const)('refuses cross-identity %s delivery', async variant => {
    const data = await fixture(); const accepted = vi.fn(), signing = vi.fn();
    const { handoffId, ...common } = data.presentation; expect(handoffId).toBeTruthy();
    const signingData: ResponseReviewData = { ...data, presentation: { ...common, phase: 'before-sign', actorRef: 'actor', draft: { id: 'draft', version: 1 } } };
    mount(variant === 'accepted-on-signing' ? data : signingData, { onAcceptedReviewState: accepted, onReviewState: signing },
      variant === 'accepted-on-signing' ? 'ResponseReview' : 'AcceptedResponseReview');
    await screen.findByText('Review unavailable');
    expect(accepted.mock.calls.some(([state]) => state.status === 'ready')).toBe(false);
    expect(signing.mock.calls.some(([state]) => state.status === 'ready')).toBe(false);
  });

  it.each(['hash', 'malformed-hash', 'recorded-locale'] as const)('refuses %s drift without publishing ready or signing availability', async variant => {
    const data = await fixture();
    if (variant === 'hash') data.presentation.responseHash = '0'.repeat(64);
    if (variant === 'malformed-hash') data.presentation.responseHash = 'invalid';
    if (variant === 'recorded-locale') data.response.displayedLocale = { locale: 'es-US', version: '1' };
    const accepted = vi.fn(), signing = vi.fn(); mount(data, { onAcceptedReviewState: accepted, onReviewState: signing });
    await screen.findByText('Review unavailable');
    expect(accepted.mock.calls.some(([state]) => state.status === 'ready')).toBe(false); expect(signing).not.toHaveBeenCalled();
  });

  it('uses only the accepted attachment reader and waits for preview availability before ready', async () => {
    const data = await fixture();
    const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR0UAAAAASUVORK5CYII=', 'base64'));
    const blob = new Blob([bytes], { type: 'image/png' });
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    data.definition.items.push({ key: 'photo', type: 'field', dataType: 'attachment', label: 'Photo' });
    data.response.data.photo = { kind: 'attachment-ref', uri: 'urn:test:retained-photo', url: 'urn:test:retained-photo',
      hash: `sha256:${digest}`, size: bytes.length, mimeType: 'image/png', contentType: 'image/png', filename: 'retained.png' };
    data.presentation.fields = { ...data.presentation.fields, photo: { label: 'Recorded photo' } };
    data.presentation.responseHash = await responseReviewHandoffHash(data.response, canonicalResponseHandoffBytes);
    const read = vi.fn<NonNullable<ResponseReviewOptions['readAcceptedAttachment']>>(async () => blob), applicant = vi.fn();
    const accepted = vi.fn(), signing = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-accepted'); const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const view = mount(data, { readAcceptedAttachment: read, readAttachment: applicant, onAcceptedReviewState: accepted, onReviewState: signing });
    const image = await screen.findByRole('img');
    expect(read).toHaveBeenCalledOnce(); expect(read.mock.calls[0][0]).toMatchObject({ path: 'photo', presentation: { handoffId: data.presentation.handoffId } });
    expect(accepted.mock.calls.at(-1)?.[0].status).toBe('pending'); fireEvent.load(image);
    await waitFor(() => expect(accepted.mock.calls.at(-1)?.[0].status).toBe('ready'));
    expect(applicant).not.toHaveBeenCalled(); expect(signing).not.toHaveBeenCalled();
    view.unmount(); expect(revoke).toHaveBeenCalledWith('blob:test-accepted');
  });
});
