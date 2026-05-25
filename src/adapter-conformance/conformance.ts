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
  HistorySnapshot,
  RespondentHistorySource,
} from '../ports/respondent-history-source.ts';
import type {
  ApplicantStatusResource,
  StatusReader,
} from '../ports/status-reader.ts';
import type { SubmitTransport } from '../ports/submit-transport.ts';
import type { AttachmentStore } from '../ports/attachment-store.ts';
import type { FormRuntimePolicyExtractor } from '../ports/form-runtime-policy-extractor.ts';
import type {
  OfflineSubmitQueue,
  QueuedSubmit,
} from '../ports/offline-submit-queue.ts';
import type { SubmitConfirmation } from '../ports/submit-transport.ts';
import {
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
  isHistorySnapshot,
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
  sampleHistorySnapshot,
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

export interface RespondentHistorySourceConformanceSubject {
  adapter: RespondentHistorySource;
  replaceSnapshot(snapshot: HistorySnapshot): void | Promise<void>;
}

export interface OfflineSubmitQueueConformanceSubject {
  /**
   * The queue under test. Conformance asserts that this queue, given the
   * `recordingTransport` below at construction time, preserves idempotency
   * keys across `enqueue` → `replay` and obeys the FIFO + per-entry-outcome
   * contract.
   */
  adapter: OfflineSubmitQueue;
  /**
   * Returns the recording transport the suite uses to assert replay
   * preserves the original idempotency key. The conformance call protocol:
   * adapter authors construct the queue with a SubmitTransport that
   * delegates to this recorder (the recorder's `submit` is the side that
   * MUST receive the original idempotencyKey). The recorder ships pre-baked
   * via `createRecordingSubmitTransport()`; see fixtures.
   */
  recordingTransport: RecordingSubmitTransport;
}

export interface RecordingSubmitTransportCall {
  readonly idempotencyKey: string;
  readonly handoff: IntakeHandoff;
}

export interface RecordingSubmitTransport {
  readonly transport: SubmitTransport;
  /** Mutable log of every `submit` invocation in call order. */
  readonly calls: ReadonlyArray<RecordingSubmitTransportCall>;
  /**
   * Pin a failure for the next replay call matching `idempotencyKey`. The
   * recorded transport throws this error for the next matching call and
   * then resumes the default "accepted" behavior.
   */
  failNextFor(idempotencyKey: string, error: unknown): void;
}

/**
 * Builds a recording SubmitTransport for use by the OfflineSubmitQueue
 * conformance subject. Each `submit` invocation appends to `calls` and
 * returns a synthetic `SubmitConfirmation` whose referenceNumber is
 * `RECORD-<n>` for the nth call, so the suite can pin per-call success
 * shape. Use `failNextFor(key, error)` to inject a failure path.
 */
export function createRecordingSubmitTransport(): RecordingSubmitTransport {
  const calls: RecordingSubmitTransportCall[] = [];
  const failures = new Map<string, unknown>();
  let counter = 0;
  const transport: SubmitTransport = {
    async submit(handoff, idempotencyKey) {
      calls.push({ idempotencyKey, handoff });
      if (failures.has(idempotencyKey)) {
        const error = failures.get(idempotencyKey);
        failures.delete(idempotencyKey);
        throw error instanceof Error ? error : new Error(String(error));
      }
      counter += 1;
      const confirmation: SubmitConfirmation = {
        referenceNumber: `RECORD-${counter.toString().padStart(6, '0')}`,
        status: 'accepted',
      };
      return confirmation;
    },
  };
  return {
    transport,
    get calls() {
      return calls;
    },
    failNextFor(idempotencyKey, error) {
      failures.set(idempotencyKey, error);
    },
  };
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

export function defineRespondentHistorySourceConformance(
  name: string,
  setup: () => RespondentHistorySourceConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a HistorySnapshot through readHistory', async () => {
      const subject = setup();
      await subject.replaceSnapshot(sampleHistorySnapshot);
      const found = await subject.adapter.readHistory({ subjectRef: 'respondent:conformance' });
      expect(isHistorySnapshot(roundTripJson(found))).toBe(true);
      expect(found).toEqual(sampleHistorySnapshot);
    });

    it('accepts an empty entries array (well-formed snapshot, no throw)', async () => {
      const subject = setup();
      const empty: HistorySnapshot = {
        $formspecRespondentHistory: '1.0',
        aggregationMode: 'client-wallet',
        subjectRef: 'respondent:conformance',
        entries: [],
      };
      await subject.replaceSnapshot(empty);
      const found = await subject.adapter.readHistory({ subjectRef: 'respondent:conformance' });
      expect(found.entries).toEqual([]);
      expect(isHistorySnapshot(roundTripJson(found))).toBe(true);
    });

    it('rejects entries with a kind outside the closed taxonomy', async () => {
      const subject = setup();
      const invalid = {
        ...sampleHistorySnapshot,
        entries: [
          {
            ...sampleHistorySnapshot.entries[0],
            kind: 'archived-record',
          },
        ],
      } as unknown as HistorySnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects.toThrow();
    });

    it('rejects an aggregationMode outside the closed string-literal set', async () => {
      const subject = setup();
      const invalid = {
        ...sampleHistorySnapshot,
        aggregationMode: 'server-cross-tenant',
      } as unknown as HistorySnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects.toThrow();
    });

    it('rejects a non-array entries field', async () => {
      const subject = setup();
      const invalid = {
        ...sampleHistorySnapshot,
        entries: { id: 'not-an-array' },
      } as unknown as HistorySnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects.toThrow();
    });

    it('rejects entries missing required fields', async () => {
      const subject = setup();
      const invalid = {
        ...sampleHistorySnapshot,
        entries: [
          {
            id: 'missing-fields',
            kind: 'submission',
          },
        ],
      } as unknown as HistorySnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects.toThrow();
    });

    it('rejects entries with documentRefs that are not all strings', async () => {
      const subject = setup();
      const invalid = {
        ...sampleHistorySnapshot,
        entries: [
          {
            ...sampleHistorySnapshot.entries[0],
            documentRefs: ['valid', 42],
          },
        ],
      } as unknown as HistorySnapshot;
      await expect(Promise.resolve().then(() => subject.replaceSnapshot(invalid))).rejects.toThrow();
    });
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
 * §Form runtime policy). Encodes the five testable conformance invariants the
 * port comment names — purity / closed-set keys / closed-set modes /
 * no-throw-on-empty / key-collision precedence. Definition-only derivation
 * (the sixth invariant in the original draft) is structurally enforced by the
 * single-argument `extract(definition)` signature; no harness assertion is
 * possible because there is no parameter through which leakage could occur.
 * Adapter authors register their extractor with an optional `definition`
 * fixture that exercises the adapter's happy path.
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
        // `isRuntimeFeatureKey` consults the closed tuple internally; this is
        // the membership check. If the adapter invented a key, the assertion
        // fails. If the adapter extracted zero keys, the loop trivially
        // passes — that is correct: the closed-set contract is "every
        // returned key is in the tuple", not "the adapter must return at
        // least one key".
        expect(isRuntimeFeatureKey(key)).toBe(true);
      }
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

    // key-collision-precedence — locks the Composite contract: when two
    // delegates set the same feature key, the LAST one wins (call-site
    // ordering is the precedence signal). The port comment names this
    // invariant; this assertion makes the contract fixture-pinned so a
    // future refactor that flips the merge order (e.g. swaps `Object.assign`
    // for a "first-wins" reduce) trips the harness. Adapter authors who
    // compose multiple extractors rely on this guarantee; the test wraps
    // the subject's adapter twice with the SAME extractor at index 0
    // followed by a synthetic "override" delegate at index 1 that pins
    // `fileUpload: 'optional'`. If the subject's adapter happens to set
    // `fileUpload: 'required'` on this definition (the attachment-bearing
    // happy path of `AttachmentRequirementExtractor`), the override must
    // win. Otherwise the override is the only declarer and still wins
    // trivially. Either way the assertion is the same: precedence is
    // last-wins.
    it('honors last-wins precedence when composed with a same-key delegate', async () => {
      // Import lazily to avoid a circular module load between the harness
      // and the composing adapter that consumes it.
      const { CompositeFormRuntimePolicyExtractor } = await import(
        '../adapters/composing/form-runtime-policy-extractor.ts'
      );
      const subject = setup();
      const definition = subject.definition ?? sampleFormDefinition;
      const overrideDelegate: FormRuntimePolicyExtractor = {
        extract: () => ({ features: { fileUpload: 'optional' } }),
      };
      const composed = new CompositeFormRuntimePolicyExtractor([
        subject.adapter,
        overrideDelegate,
      ]);
      const policy = composed.extract(definition);
      expect(policy.features.fileUpload).toBe('optional');
    });
  });
}

/**
 * Conformance harness for `OfflineSubmitQueue` (FW-0044, web ADR-0011
 * §offlineSubmit). Encodes the seven testable conformance invariants the
 * port comment names — UUIDv7 idempotency keys, enqueue idempotency, replay
 * preserves the original key, FIFO replay order, per-entry outcomes,
 * empty-replay no-op, `pending()` accuracy. Adapter authors register their
 * queue with a `recordingTransport` (built via
 * `createRecordingSubmitTransport()`) whose call log the suite asserts
 * against — the recorder's `submit` is the side that MUST receive the
 * original idempotencyKey at replay.
 */
export function defineOfflineSubmitQueueConformance(
  name: string,
  setup: () => OfflineSubmitQueueConformanceSubject,
): void {
  describe(name, () => {
    it('enqueue rejects non-UUIDv7 idempotency keys', async () => {
      const subject = setup();
      await expect(
        subject.adapter.enqueue(sampleIntakeHandoff, 'not-a-uuid-v7'),
      ).rejects.toThrow();
    });

    it('enqueue is idempotent for the same UUIDv7 idempotency key', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      const first = await subject.adapter.enqueue(sampleIntakeHandoff, key);
      const second = await subject.adapter.enqueue(sampleIntakeHandoff, key);
      expect(second).toEqual(first);
      const pending = await subject.adapter.pending();
      expect(pending).toHaveLength(1);
      expect(pending[0].idempotencyKey).toBe(key);
    });

    it('replay preserves the original idempotency key at the injected transport', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      await subject.adapter.enqueue(sampleIntakeHandoff, key);
      const outcomes = await subject.adapter.replay();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].kind).toBe('sent');
      expect(outcomes[0].idempotencyKey).toBe(key);
      expect(subject.recordingTransport.calls).toHaveLength(1);
      expect(subject.recordingTransport.calls[0].idempotencyKey).toBe(key);
    });

    it('replay drains the pending set on successful outcomes', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      await subject.adapter.enqueue(sampleIntakeHandoff, key);
      await subject.adapter.replay();
      const pending = await subject.adapter.pending();
      expect(pending).toEqual([]);
    });

    it('replay drains entries in FIFO order', async () => {
      const subject = setup();
      const keyA = generateIdempotencyKey();
      const keyB = generateIdempotencyKey();
      const keyC = generateIdempotencyKey();
      await subject.adapter.enqueue(sampleIntakeHandoff, keyA);
      await subject.adapter.enqueue(sampleIntakeHandoff, keyB);
      await subject.adapter.enqueue(sampleIntakeHandoff, keyC);
      const outcomes = await subject.adapter.replay();
      expect(outcomes.map((outcome) => outcome.idempotencyKey)).toEqual([
        keyA,
        keyB,
        keyC,
      ]);
      expect(
        subject.recordingTransport.calls.map((call) => call.idempotencyKey),
      ).toEqual([keyA, keyB, keyC]);
    });

    it('replay returns per-entry outcomes and keeps failed entries pending', async () => {
      const subject = setup();
      const keyA = generateIdempotencyKey();
      const keyB = generateIdempotencyKey();
      await subject.adapter.enqueue(sampleIntakeHandoff, keyA);
      await subject.adapter.enqueue(sampleIntakeHandoff, keyB);
      subject.recordingTransport.failNextFor(keyB, new Error('transport down'));
      const outcomes = await subject.adapter.replay();
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0].kind).toBe('sent');
      expect(outcomes[0].idempotencyKey).toBe(keyA);
      expect(outcomes[1].kind).toBe('failed');
      expect(outcomes[1].idempotencyKey).toBe(keyB);
      const pending = await subject.adapter.pending();
      expect(pending).toHaveLength(1);
      expect(pending[0].idempotencyKey).toBe(keyB);
    });

    it('empty replay is a no-throw no-op', async () => {
      const subject = setup();
      const outcomes = await subject.adapter.replay();
      expect(outcomes).toEqual([]);
      expect(subject.recordingTransport.calls).toEqual([]);
    });

    it('pending() returns the empty array when no entry is queued', async () => {
      const subject = setup();
      const pending = await subject.adapter.pending();
      expect(pending).toEqual([]);
    });

    it('pending() reflects entries surviving a partial failed replay', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      await subject.adapter.enqueue(sampleIntakeHandoff, key);
      subject.recordingTransport.failNextFor(key, new Error('boom'));
      await subject.adapter.replay();
      const stillPending = await subject.adapter.pending();
      expect(stillPending).toHaveLength(1);
      expect(stillPending[0].idempotencyKey).toBe(key);
    });

    it('QueuedSubmit carries an ISO-8601 enqueuedAt timestamp', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      const queued: QueuedSubmit = await subject.adapter.enqueue(
        sampleIntakeHandoff,
        key,
      );
      expect(queued.enqueuedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });
  });
}
