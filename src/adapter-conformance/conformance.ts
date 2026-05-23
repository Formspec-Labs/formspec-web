import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import type { DefinitionSource } from '../ports/definition-source.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';
import type { NotificationDelivery, NotificationMessage } from '../ports/notification-delivery.ts';
import type { SubmitTransport } from '../ports/submit-transport.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import {
  isCanonicalIdentityClaim,
  isFormDefinition,
  isFormResponse,
  isIntakeHandoff,
  leakedProviderNativeIdentityKeys,
} from './assertions.ts';
import {
  roundTripJson,
  sampleFormDefinition,
  sampleFormResponse,
  sampleIntakeHandoff,
  sampleNotificationMessage,
} from './fixtures.ts';

export interface DefinitionSourceConformanceSubject {
  adapter: DefinitionSource;
  registerDefinition(definition: FormDefinition): void | Promise<void>;
}

export interface DraftStoreConformanceSubject {
  adapter: DraftStore;
}

export interface SubmitTransportConformanceSubject {
  adapter: SubmitTransport;
}

export interface IdentityProviderConformanceSubject {
  adapter: IdentityProvider;
}

export interface NotificationDeliveryConformanceSubject {
  adapter: NotificationDelivery;
  deliveries(): ReadonlyArray<{ key: string; message: NotificationMessage }>;
}

export function defineDefinitionSourceConformance(
  name: string,
  setup: () => DefinitionSourceConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a schema-valid FormDefinition', async () => {
      const subject = setup();
      await subject.registerDefinition(sampleFormDefinition);
      const found = await subject.adapter.getDefinition(
        sampleFormDefinition.url,
        sampleFormDefinition.version,
      );
      expect(isFormDefinition(roundTripJson(found))).toBe(true);
      expect(found).toEqual(sampleFormDefinition);
    });

    it('rejects missing definitions instead of returning invalid data', async () => {
      const subject = setup();
      await expect(subject.adapter.getDefinition('https://missing.example.test/form')).rejects.toThrow();
    });
  });
}

export function defineDraftStoreConformance(
  name: string,
  setup: () => DraftStoreConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a schema-valid FormResponse', async () => {
      const subject = setup();
      const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };
      await subject.adapter.save(key, sampleFormResponse);
      const loaded = await subject.adapter.load(key);
      expect(isFormResponse(roundTripJson(loaded))).toBe(true);
      expect(loaded).toEqual(sampleFormResponse);
    });

    it('returns undefined for an unknown draft key', async () => {
      const subject = setup();
      const loaded = await subject.adapter.load({ formUrl: sampleFormDefinition.url });
      expect(loaded).toBeUndefined();
    });

    it('invalidates all drafts for a subject', async () => {
      const subject = setup();
      const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };
      await subject.adapter.save(key, sampleFormResponse);
      await subject.adapter.invalidateSubject('S-1');
      await expect(subject.adapter.load(key)).resolves.toBeUndefined();
    });
  });
}

export function defineSubmitTransportConformance(
  name: string,
  setup: () => SubmitTransportConformanceSubject,
): void {
  describe(name, () => {
    it('accepts a schema-valid IntakeHandoff', async () => {
      const subject = setup();
      expect(isIntakeHandoff(roundTripJson(sampleIntakeHandoff))).toBe(true);
      await expect(subject.adapter.submit(sampleIntakeHandoff, generateIdempotencyKey())).resolves
        .toMatchObject({ status: 'accepted' });
    });

    it('returns the same confirmation for the same UUIDv7 idempotency key', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      const first = await subject.adapter.submit(sampleIntakeHandoff, key);
      const second = await subject.adapter.submit(sampleIntakeHandoff, key);
      expect(second).toEqual(first);
    });

    it('returns distinct confirmations for distinct UUIDv7 idempotency keys', async () => {
      const subject = setup();
      const first = await subject.adapter.submit(sampleIntakeHandoff, generateIdempotencyKey());
      const second = await subject.adapter.submit(sampleIntakeHandoff, generateIdempotencyKey());
      expect(second.referenceNumber).not.toBe(first.referenceNumber);
    });

    it('rejects non-UUIDv7 idempotency keys', async () => {
      const subject = setup();
      await expect(subject.adapter.submit(sampleIntakeHandoff, 'not-a-uuid-v7')).rejects.toThrow();
    });
  });
}

export function defineIdentityProviderConformance(
  name: string,
  setup: () => IdentityProviderConformanceSubject,
): void {
  describe(name, () => {
    it('returns canonical identity claims without provider-native top-level keys', async () => {
      const subject = setup();
      const [option] = await subject.adapter.discover();
      if (!option) throw new Error('expected at least one identity option');
      const claim = await subject.adapter.authenticate(option);
      expect(isCanonicalIdentityClaim(claim)).toBe(true);
      expect(leakedProviderNativeIdentityKeys(claim)).toEqual([]);
    });

    it('surfaces L3-equivalent evidence as assuranceLevel L3', async () => {
      const subject = setup();
      const options = await subject.adapter.discover('L3');
      const l3Option = options.find((option) => option.minAssurance === 'L3');
      if (!l3Option) throw new Error('expected an L3-capable identity option');
      const claim = await subject.adapter.authenticate(l3Option);
      expect(claim.assuranceLevel).toBe('L3');
    });

    it('represents privacy tier independently from assurance level', async () => {
      const subject = setup();
      const options = await subject.adapter.discover('L3');
      const l3Option = options.find((option) => option.minAssurance === 'L3');
      if (!l3Option) throw new Error('expected an L3-capable identity option');
      const claim = await subject.adapter.authenticate(l3Option);
      expect(claim.assuranceLevel).toBe('L3');
      expect(claim.privacyTier).toBe('pseudonymous');
    });

    it('notifies subscribers on authenticate and revoke', async () => {
      const subject = setup();
      const received: Array<unknown> = [];
      const unsubscribe = subject.adapter.subscribe((claim) => received.push(claim));
      const [option] = await subject.adapter.discover();
      if (!option) throw new Error('expected at least one identity option');
      const claim = await subject.adapter.authenticate(option);
      await subject.adapter.revoke(claim);
      unsubscribe();
      expect(received).toEqual([null, claim, null]);
    });
  });
}

export function defineNotificationDeliveryConformance(
  name: string,
  setup: () => NotificationDeliveryConformanceSubject,
): void {
  describe(name, () => {
    it('sends a pre-rendered notification once for a UUIDv7 idempotency key', async () => {
      const subject = setup();
      await subject.adapter.send(sampleNotificationMessage, generateIdempotencyKey());
      expect(subject.deliveries()).toHaveLength(1);
    });

    it('deduplicates repeated sends with the same UUIDv7 idempotency key', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      await subject.adapter.send(sampleNotificationMessage, key);
      await subject.adapter.send(sampleNotificationMessage, key);
      expect(subject.deliveries()).toHaveLength(1);
    });

    it('rejects non-UUIDv7 idempotency keys', async () => {
      const subject = setup();
      await expect(subject.adapter.send(sampleNotificationMessage, 'not-a-uuid-v7')).rejects.toThrow();
    });
  });
}
