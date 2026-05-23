import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import type { DefinitionSource } from '../ports/definition-source.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';
import type { NotificationDelivery, NotificationMessage } from '../ports/notification-delivery.ts';
import type {
  RespondentPlaceSnapshot,
  RespondentPlaceSource,
} from '../ports/respondent-place-source.ts';
import type {
  ApplicantStatusResource,
  StatusReader,
} from '../ports/status-reader.ts';
import type { SubmitTransport } from '../ports/submit-transport.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import {
  isCanonicalIdentityClaim,
  isFormDefinition,
  isFormResponse,
  isIntakeHandoff,
  isApplicantStatusResource,
  isRespondentPlaceSnapshot,
  leakedProviderNativeIdentityKeys,
} from './assertions.ts';
import {
  roundTripJson,
  sampleFormDefinition,
  sampleFormResponse,
  sampleIntakeHandoff,
  sampleApplicantStatusResource,
  sampleApplicantStatusProjection,
  sampleNotificationMessage,
  sampleRespondentPlaceSnapshot,
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

export interface StatusReaderConformanceSubject {
  adapter: StatusReader;
  registerStatus(key: string, resource: ApplicantStatusResource): void | Promise<void>;
}

export interface RespondentPlaceSourceConformanceSubject {
  adapter: RespondentPlaceSource;
  replaceSnapshot(snapshot: RespondentPlaceSnapshot): void | Promise<void>;
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

    it('returns the same confirmation for concurrent same-key submissions', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      const [first, second] = await Promise.all([
        subject.adapter.submit(sampleIntakeHandoff, key),
        subject.adapter.submit(sampleIntakeHandoff, key),
      ]);
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
      if (!l3Option) {
        expect(options).toEqual([]);
        return;
      }
      const claim = await subject.adapter.authenticate(l3Option);
      expect(claim.assuranceLevel).toBe('L3');
    });

    it('represents privacy tier independently from assurance level', async () => {
      const subject = setup();
      const options = await subject.adapter.discover('L3');
      const l3Option = options.find((option) => option.minAssurance === 'L3');
      if (!l3Option) {
        expect(options).toEqual([]);
        return;
      }
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

export function defineStatusReaderConformance(
  name: string,
  setup: () => StatusReaderConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a WOS applicant API status resource', async () => {
      const subject = setup();
      const resourceRef = sampleApplicantStatusProjection.resourceRef;
      if (!resourceRef) throw new Error('sample status resource needs resourceRef');
      await subject.registerStatus(resourceRef, sampleApplicantStatusResource);
      const found = await subject.adapter.readStatus({ resourceRef });
      expect(isApplicantStatusResource(roundTripJson(found))).toBe(true);
      expect(found).toEqual(sampleApplicantStatusResource);
    });

    it('returns undefined for unknown status requests', async () => {
      const subject = setup();
      await expect(subject.adapter.readStatus({ resourceRef: 'urn:wos:missing' })).resolves
        .toBeUndefined();
    });

    it('rejects sidecar projection wrappers as StatusReader resources', async () => {
      const subject = setup();
      const invalid = sampleApplicantStatusProjection as unknown as ApplicantStatusResource;
      await expect(Promise.resolve().then(() => subject.registerStatus('bad', invalid))).rejects
        .toThrow();
    });

    it('rejects hybrid wrapper-plus-resource status payloads', async () => {
      const subject = setup();
      const invalid = {
        ...sampleApplicantStatusResource,
        sourceSchema: sampleApplicantStatusProjection.sourceSchema,
        projectionKind: sampleApplicantStatusProjection.projectionKind,
        updatedAt: sampleApplicantStatusProjection.updatedAt,
      } as unknown as ApplicantStatusResource;
      await expect(Promise.resolve().then(() => subject.registerStatus('bad-hybrid', invalid)))
        .rejects.toThrow();
    });
  });
}

export function defineRespondentPlaceSourceConformance(
  name: string,
  setup: () => RespondentPlaceSourceConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a Respondent Library snapshot', async () => {
      const subject = setup();
      await subject.replaceSnapshot(sampleRespondentPlaceSnapshot);
      const found = await subject.adapter.readPlace({ subjectRef: 'respondent:conformance' });
      expect(isRespondentPlaceSnapshot(roundTripJson(found))).toBe(true);
      expect(found).toEqual(sampleRespondentPlaceSnapshot);
    });

    it('preserves schema-valid x-extension keys', async () => {
      const subject = setup();
      const snapshotWithExtensions = {
        ...sampleRespondentPlaceSnapshot,
        'x-vendorFlag': { enabled: true },
        extensions: {
          'x-Vendor/opaque': { retained: true },
        },
      } as unknown as RespondentPlaceSnapshot;
      await subject.replaceSnapshot(snapshotWithExtensions);
      const found = await subject.adapter.readPlace({ subjectRef: 'respondent:conformance' });
      expect(isRespondentPlaceSnapshot(roundTripJson(found))).toBe(true);
      expect(found).toEqual(snapshotWithExtensions);
    });

    it('rejects server-side aggregation mode', async () => {
      const subject = setup();
      const invalid = {
        ...sampleRespondentPlaceSnapshot,
        aggregationMode: 'server-cross-tenant',
      } as unknown as RespondentPlaceSnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects
        .toThrow();
    });

    it('rejects document kinds outside the sidecar taxonomy', async () => {
      const subject = setup();
      const invalid = {
        ...sampleRespondentPlaceSnapshot,
        documents: [
          {
            ...sampleRespondentPlaceSnapshot.documents?.[0],
            kind: 'passport',
          },
        ],
      } as unknown as RespondentPlaceSnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects
        .toThrow();
    });

    it('rejects selected-document presentation policies without document refs', async () => {
      const subject = setup();
      const invalid = {
        ...sampleRespondentPlaceSnapshot,
        presentationPolicies: [
          {
            id: 'missing-document-refs',
            scope: 'selected-documents',
            allowedPurposes: ['eligibility'],
          },
        ],
      } as unknown as RespondentPlaceSnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects
        .toThrow();
    });

    it('rejects Respondent Library status projections with extra properties', async () => {
      const subject = setup();
      const invalid = {
        ...sampleRespondentPlaceSnapshot,
        submissions: [
          {
            ...sampleRespondentPlaceSnapshot.submissions?.[0],
            applicantStatus: {
              ...sampleApplicantStatusProjection,
              webStatus: 'received',
            },
          },
        ],
      } as unknown as RespondentPlaceSnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects
        .toThrow();
    });

    it('rejects incomplete passkey-hpke encryption envelopes', async () => {
      const subject = setup();
      const invalid = {
        ...sampleRespondentPlaceSnapshot,
        encryption: {
          mode: 'passkey-hpke',
          keyDerivation: 'passkey-derived',
        },
      } as unknown as RespondentPlaceSnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects
        .toThrow();
    });

    it('rejects privacy tiers outside the sidecar taxonomy', async () => {
      const subject = setup();
      const invalid = {
        ...sampleRespondentPlaceSnapshot,
        subject: {
          ...sampleRespondentPlaceSnapshot.subject,
          privacyTier: 'identified',
        },
      } as unknown as RespondentPlaceSnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects
        .toThrow();
    });

    for (const field of ['obligations', 'documents', 'submissions', 'presentationPolicies'] as const) {
      it(`rejects non-array ${field}`, async () => {
        const subject = setup();
        const invalid = {
          ...sampleRespondentPlaceSnapshot,
          [field]: { id: 'not-an-array' },
        } as unknown as RespondentPlaceSnapshot;
        await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects
          .toThrow();
      });
    }
  });
}
