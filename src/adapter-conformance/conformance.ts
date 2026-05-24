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
import type { AttachmentStore } from '../ports/attachment-store.ts';
import type { FormRuntimePolicyExtractor } from '../ports/form-runtime-policy-extractor.ts';
import {
  RUNTIME_FEATURE_KEYS,
  isFormFeaturePolicyMode,
  isRuntimeFeatureKey,
} from '../policy/index.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import {
  isAttachmentRef,
  isCanonicalIdentityClaim,
  isFormDefinition,
  isFormResponse,
  isIntakeHandoff,
  isApplicantStatusResource,
  isRespondentPlaceSnapshot,
  leakedProviderNativeIdentityKeys,
} from './assertions.ts';
import {
  differentAttachmentBlob,
  roundTripJson,
  sampleAttachmentBlob,
  sampleAttachmentMetadata,
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

export interface AttachmentStoreConformanceSubject {
  adapter: AttachmentStore;
}

export interface FormRuntimePolicyExtractorConformanceSubject {
  adapter: FormRuntimePolicyExtractor;
  /**
   * Optional fixture override. Adapter authors whose extractor only returns a
   * meaningful policy for a specific definition shape (e.g., the demo-form
   * URL-keyed extractor, the attachment-field walker fed an attachment-bearing
   * definition) supply that definition here so the round-trip + closed-set
   * checks run against the adapter's actual happy path. Omit to fall back to
   * the bare `sampleFormDefinition` fixture.
   */
  definition?: FormDefinition;
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

    /**
     * URN-as-possession-factor uniform-`undefined` contract per
     * `docs/ports/status-reader.md` §"URN-as-bearer-token semantics".
     * Adapters MUST return `undefined` for unknown URNs — not a not-found-shaped
     * object, not an error throw, and not a different shape than the
     * "URN exists but is not yours" branch. Distinguishing the two would make
     * `/status?case=...` an enumeration oracle.
     *
     * Filed from FW-0039 closeout independent architecture review M-2 — the
     * port doc warned but no conformance test enforced. The enforcement now
     * applies to EVERY StatusReader adapter (stub + future production
     * adapters).
     */
    it('returns uniform undefined (no throw, no shape variance) for an obviously-unknown URN', async () => {
      const subject = setup();
      // High-entropy URN tail guaranteed not to collide with any registered
      // fixture in any adapter's test setup.
      const randomTail = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_NEVER_EXISTS`;
      const obviouslyUnknown = `urn:wos:case_test_unknown_${randomTail}`;
      const result = await subject.adapter.readStatus({
        subjectRef: 'subject:never-exists',
        submissionId: obviouslyUnknown,
        resourceRef: obviouslyUnknown,
      });
      // Strictly undefined — not null, not {}, not a "not-found"-shaped object.
      expect(result).toBeUndefined();
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

export function defineAttachmentStoreConformance(
  name: string,
  setup: () => AttachmentStoreConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a blob into a schema-valid AttachmentRef', async () => {
      const subject = setup();
      const blob = sampleAttachmentBlob();
      const ref = await subject.adapter.upload(blob, sampleAttachmentMetadata);
      expect(isAttachmentRef(roundTripJson(ref))).toBe(true);
      expect(ref.size).toBe(blob.size);
      expect(ref.mimeType).toBe(sampleAttachmentMetadata.mimeType);
      expect(ref.filename).toBe(sampleAttachmentMetadata.filename);
    });

    it('produces the same hash for identical bytes within one adapter instance', async () => {
      const subject = setup();
      const first = await subject.adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata);
      const second = await subject.adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata);
      expect(second.hash).toBe(first.hash);
    });

    it('produces different hashes for different bytes', async () => {
      const subject = setup();
      const first = await subject.adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata);
      const second = await subject.adapter.upload(
        differentAttachmentBlob(),
        sampleAttachmentMetadata,
      );
      expect(second.hash).not.toBe(first.hash);
    });

    it('accepts an empty blob and yields a zero-size ref', async () => {
      const subject = setup();
      const empty = new Blob([], { type: 'application/octet-stream' });
      const ref = await subject.adapter.upload(empty, {
        filename: 'empty.bin',
        mimeType: 'application/octet-stream',
      });
      expect(ref.size).toBe(0);
      expect(isAttachmentRef(ref)).toBe(true);
    });

    it('emits a non-empty URI distinct enough to address the upload', async () => {
      const subject = setup();
      const ref = await subject.adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata);
      expect(ref.uri.length).toBeGreaterThan(0);
    });

    // M-2: optional delete contract. Adopters who implement delete MUST honor
    // it for refs the adapter produced; the assertion is guarded so adopters
    // who omit delete are not failed for an optional capability.
    it('honors delete for refs it produced (when implemented)', async () => {
      const subject = setup();
      if (typeof subject.adapter.delete !== 'function') {
        return;
      }
      const ref = await subject.adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata);
      await subject.adapter.delete(ref.uri);
      // No exception is the contract — adopters may also choose to make
      // subsequent reads fail, but failure surface is adopter-shaped.
    });
  });
}

/**
 * Conformance harness for `FormRuntimePolicyExtractor` (FW-0066, web ADR-0011
 * §Form runtime policy). Encodes the five conformance invariants the port
 * comment names. Adapter authors register their extractor with an optional
 * `definition` fixture that exercises the adapter's happy path.
 */
export function defineFormRuntimePolicyExtractorConformance(
  name: string,
  setup: () => FormRuntimePolicyExtractorConformanceSubject,
): void {
  describe(name, () => {
    it('returns a schema-valid FormRuntimePolicy for a real definition', () => {
      const subject = setup();
      const definition = subject.definition ?? sampleFormDefinition;
      const policy = subject.adapter.extract(definition);
      expect(policy).toBeDefined();
      expect(typeof policy.features).toBe('object');
      expect(policy.features).not.toBeNull();
    });

    it('returns an empty policy for an empty-items definition without throwing', () => {
      const subject = setup();
      const emptyDefinition: FormDefinition = {
        ...sampleFormDefinition,
        items: [],
      };
      const policy = subject.adapter.extract(emptyDefinition);
      expect(policy.features).toEqual({});
    });

    it('is deterministic across repeated calls and JSON round-trips of the input', () => {
      const subject = setup();
      const definition = subject.definition ?? sampleFormDefinition;
      const first = subject.adapter.extract(definition);
      const second = subject.adapter.extract(definition);
      const clone = roundTripJson(definition);
      const third = subject.adapter.extract(clone);
      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it('only returns keys in the closed RUNTIME_FEATURE_KEYS taxonomy', () => {
      const subject = setup();
      const definition = subject.definition ?? sampleFormDefinition;
      const policy = subject.adapter.extract(definition);
      for (const key of Object.keys(policy.features)) {
        expect(isRuntimeFeatureKey(key)).toBe(true);
      }
      // The closed-set tuple is the source of truth; failing this assertion
      // means the adapter invented a key. Touch RUNTIME_FEATURE_KEYS so it
      // stays referenced when the closed-set membership check above passes
      // trivially (no extracted keys); otherwise unused-import lints would
      // strip the tuple import from the harness module on a future refactor.
      expect(Array.isArray(RUNTIME_FEATURE_KEYS)).toBe(true);
    });

    it('only returns modes in {forbidden, optional, required}', () => {
      const subject = setup();
      const definition = subject.definition ?? sampleFormDefinition;
      const policy = subject.adapter.extract(definition);
      for (const mode of Object.values(policy.features)) {
        if (mode === undefined) continue;
        expect(isFormFeaturePolicyMode(mode)).toBe(true);
      }
    });
  });
}
