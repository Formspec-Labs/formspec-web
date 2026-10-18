import { describe, expect, it, vi } from 'vitest';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { createUnavailableComposition } from '../../src/composition/unavailable.ts';
import { freezeComposition } from '../../src/policy/index.ts';
import { createRouteNarrowedComposition, type RouteNarrowing } from '../../src/composition/route-narrowing.ts';
import { unavailableNotificationDelivery } from '../../src/adapters/unavailable/notification-delivery.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import { submitWithPayment } from '../../src/app/respondent-flow.ts';
import type { SubmitWithPaymentInput } from '../../src/app/respondent-flow.ts';
import type { FormspecWebConfig } from '../../src/config/types.ts';

const config: FormspecWebConfig = { ...publicPortalProfile,
  ports: { ...publicPortalProfile.ports, definitionSource: 'reference-http', draftStore: 'reference-http', submitTransport: 'reference-http' },
  referenceAdapters: { formspecStack: { formspecServerUrl: 'https://service.example.test' } },
};
const route: RouteNarrowing = { routeCite: '/neutral', initialDefinitionUrlSentinel: 'urn:test:no-form', consumes: new Set(), identityBound: false };

describe('explicit application composition boundary', () => {
  it('refuses absent server and form selections before adapter activity', () => {
    expect(() => createDefaultComposition(publicPortalProfile)).toThrow('explicit formspecServerUrl');
    expect(() => createDefaultComposition(config)).toThrow('explicit initialDefinitionUrl');
    expect(() => createRouteNarrowedComposition({ config: publicPortalProfile, route })).toThrow('explicit formspecServerUrl');
  });
  it('constructs no sample capabilities in an unavailable boot', async () => {
    const composition = createUnavailableComposition('urn:test:selected');
    expect(new Set(Object.values(composition.instanceCapabilities))).toEqual(new Set(['unavailable']));
    expect(composition.mode).toBe('production');
    await expect(composition.definitionSource.getDefinition('urn:test:selected')).rejects.toThrow('not configured');
    expect(await composition.identityProvider.discover()).toEqual([]);
  });
  it('checks capability coherence directly for supplied wiring', () => {
    const supplied = createUnavailableComposition('urn:test:provided');
    expect(() => freezeComposition({ ...supplied, instanceCapabilities: { ...supplied.instanceCapabilities, payment: 'available' } })).toThrow();
  });
  it('claims no notification channel and refuses sending without a transport', async () => {
    const delivery = unavailableNotificationDelivery();
    expect(delivery.capabilities).toEqual({});
    await expect(delivery.send({ channel: 'email', to: 'nobody@example.test', body: 'Test' }, 'key')).rejects.toThrow('not configured');
  });
  it.each(['production'] as const)('refuses a missing payment token before any rail operation in %s posture', async mode => {
    const authorize = vi.fn();
    const input = {
      runtimeProfile: { mode, enabled: new Set(['payment']), blocked: new Map(), disabled: new Set() },
      definition: { $formspec: '1.0', url: 'urn:test:fee', version: '1.0.0', title: 'Fee', items: [], extensions: {
        'x-formspec-payment-amount': { amountMinorUnits: 1200, currency: 'USD' },
      } },
      paymentRailAdapter: { authorize },
    } as unknown as SubmitWithPaymentInput;
    await expect(submitWithPayment(input)).rejects.toThrow('payment method token');
    expect(authorize).not.toHaveBeenCalled();
  });
});
