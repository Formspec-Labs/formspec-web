import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import type { DefinitionSource } from '../ports/definition-source.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import type {
  AssuranceLevel,
  IdentityProvider,
  IdpOption,
} from '../ports/identity-provider.ts';
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
import type {
  LifecycleActionClient,
  LifecycleActionSnapshot,
} from '../ports/lifecycle-action-client.ts';
import type {
  SafeAddressDirectory,
  SafeAddressJurisdiction,
} from '../ports/safe-address-directory.ts';
import type { SubmitTransport } from '../ports/submit-transport.ts';
import type { AttachmentStore } from '../ports/attachment-store.ts';
import type { FormRuntimePolicyExtractor } from '../ports/form-runtime-policy-extractor.ts';
import type {
  OfflineSubmitQueue,
  QueuedSubmit,
} from '../ports/offline-submit-queue.ts';
import type {
  Authorization,
  Money,
  PaymentRailAdapter,
} from '../ports/payment-rail-adapter.ts';
import type {
  EmbedMessage,
  EmbedMessageFromHost,
  EmbedTransport,
} from '../ports/embed-transport.ts';
import type {
  ScreenerDocumentInput,
  ScreenerDocumentSource,
} from '../ports/screener-document-source.ts';
import { ScreenerDocumentNotFoundError } from '../ports/screener-document-source.ts';
import type {
  ReviewerSession,
  ReviewerScope,
} from '../ports/reviewer-session.ts';
import { respondentSessionToken } from '../ports/reviewer-session.ts';
import type {
  ReviewThread,
  ReviewThreadPolicySnapshot,
  ReviewThreadStore,
} from '../ports/review-thread-store.ts';
import { isScreenerDocumentInput } from '../shared/screener-document.ts';
import type { IntakeHandoff, SubmitConfirmation } from '../ports/submit-transport.ts';
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
  sampleAllowedHostOrigin,
  sampleAttachmentBlob,
  sampleAttachmentMetadata,
  sampleEmbedMessage,
  sampleFormDefinition,
  sampleFormResponse,
  sampleHistorySnapshot,
  sampleIntakeHandoff,
  sampleApplicantStatusResource,
  sampleApplicantStatusProjection,
  sampleLifecycleActionSnapshot,
  sampleNotificationMessage,
  samplePaymentAmount,
  samplePaymentMethodToken,
  sampleRespondentPlaceSnapshot,
  sampleScreenerDocument,
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

export interface LifecycleActionClientConformanceSubject {
  adapter: LifecycleActionClient;
  registerLifecycle(snapshot: LifecycleActionSnapshot): void | Promise<void>;
}

export interface SafeAddressDirectoryConformanceSubject {
  adapter: SafeAddressDirectory;
  expectedJurisdiction: SafeAddressJurisdiction;
  validCandidate: string;
  invalidCandidate: string;
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

    it('does not return under-assurance options when a floor is requested', async () => {
      const subject = setup();
      const options = await subject.adapter.discover('L3');
      expect(options.every((option) => idpOptionMeetsAssurance(option, 'L3'))).toBe(true);
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

function idpOptionMeetsAssurance(option: IdpOption, required: AssuranceLevel): boolean {
  return assuranceRank(option.minAssurance) >= assuranceRank(required);
}

function assuranceRank(level: AssuranceLevel): number {
  return Number(level.slice(1));
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

export function defineLifecycleActionClientConformance(
  name: string,
  setup: () => LifecycleActionClientConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a lifecycle action snapshot', async () => {
      const subject = setup();
      await subject.registerLifecycle(sampleLifecycleActionSnapshot);
      const found = await subject.adapter.readLifecycle({
        caseUrn: sampleLifecycleActionSnapshot.caseUrn,
      });
      expect(roundTripJson(found)).toEqual(sampleLifecycleActionSnapshot);
    });

    it('returns undefined for unknown lifecycle requests', async () => {
      const subject = setup();
      await expect(
        subject.adapter.readLifecycle({ caseUrn: 'urn:wos:case_missing_lifecycle' }),
      ).resolves.toBeUndefined();
    });

    it('submitCorrection is idempotent on a UUIDv7 key and appends one event', async () => {
      const subject = setup();
      await subject.registerLifecycle(sampleLifecycleActionSnapshot);
      const key = generateIdempotencyKey();
      const first = await subject.adapter.submitCorrection(
        {
          caseUrn: sampleLifecycleActionSnapshot.caseUrn,
          changedFields: [
            {
              path: '/householdSize',
              label: 'Household size',
              originalValue: { text: '1' },
              correctedValue: { text: '3' },
            },
          ],
          reason: 'The household size was typed incorrectly.',
        },
        key,
      );
      const second = await subject.adapter.submitCorrection(
        {
          caseUrn: sampleLifecycleActionSnapshot.caseUrn,
          changedFields: [
            {
              path: '/householdSize',
              label: 'Household size',
              originalValue: { text: '1' },
              correctedValue: { text: '3' },
            },
          ],
          reason: 'The household size was typed incorrectly.',
        },
        key,
      );
      expect(second).toEqual(first);
      expect(first.event.kind).toBe('correction');
      expect(first.snapshot.events).toHaveLength(sampleLifecycleActionSnapshot.events.length + 1);
    });

    it('submitWithdrawal appends a withdrawal event', async () => {
      const subject = setup();
      await subject.registerLifecycle(sampleLifecycleActionSnapshot);
      const receipt = await subject.adapter.submitWithdrawal(
        {
          caseUrn: sampleLifecycleActionSnapshot.caseUrn,
          reason: 'I no longer want to proceed.',
        },
        generateIdempotencyKey(),
      );
      expect(receipt.action).toBe('withdraw');
      expect(receipt.event.kind).toBe('withdrawal');
    });

    it('submitWithdrawal rejects post-determination review unless action availability authorizes it', async () => {
      const subject = setup();
      await subject.registerLifecycle(sampleLifecycleActionSnapshot);
      await expect(
        subject.adapter.submitWithdrawal(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            reason: 'The decision should be reviewed.',
            rescissionRequested: true,
          },
          generateIdempotencyKey(),
        ),
      ).rejects.toThrow(/post-determination|review|not available/i);

      await subject.registerLifecycle({
        ...sampleLifecycleActionSnapshot,
        actions: sampleLifecycleActionSnapshot.actions.map((action) =>
          action.action === 'withdraw'
            ? {
                ...action,
                postDeterminationIntent: 'rescission-requested' as const,
                requiresIssuerAcceptance: true,
              }
            : action,
        ),
      });
      const receipt = await subject.adapter.submitWithdrawal(
        {
          caseUrn: sampleLifecycleActionSnapshot.caseUrn,
          reason: 'The decision should be reviewed.',
          rescissionRequested: true,
        },
        generateIdempotencyKey(),
      );
      expect(receipt.event.kind).toBe('withdrawal');
      if (receipt.event.kind !== 'withdrawal') throw new Error('unreachable');
      expect(receipt.event.rescissionRequested).toBe(true);
      expect(receipt.event.requiresIssuerAcceptance).toBe(true);
    });

    it('submitDispute appends a dispute event', async () => {
      const subject = setup();
      await subject.registerLifecycle(sampleLifecycleActionSnapshot);
      const receipt = await subject.adapter.submitDispute(
        {
          caseUrn: sampleLifecycleActionSnapshot.caseUrn,
          actorRef: 'signer:conformance',
          disputedEventId: sampleLifecycleActionSnapshot.events[0]?.eventId,
          statement: 'I dispute this signed record.',
        },
        generateIdempotencyKey(),
      );
      expect(receipt.action).toBe('dispute');
      expect(receipt.event.kind).toBe('dispute');
    });

    it('rejects non-UUIDv7 idempotency keys on lifecycle submissions', async () => {
      const subject = setup();
      await subject.registerLifecycle(sampleLifecycleActionSnapshot);
      await expect(
        subject.adapter.submitWithdrawal(
          { caseUrn: sampleLifecycleActionSnapshot.caseUrn, reason: 'Changed intent.' },
          'not-a-uuid-v7',
        ),
      ).rejects.toThrow();
    });

    it('rejects disabled lifecycle actions', async () => {
      const subject = setup();
      await subject.registerLifecycle({
        ...sampleLifecycleActionSnapshot,
        actions: [
          {
            action: 'correct',
            enabled: false,
            disabledReason: 'Corrections are disabled for this record.',
          },
        ],
      });
      await expect(
        subject.adapter.submitCorrection(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            changedFields: [{ path: '/householdSize', label: 'Household size' }],
            reason: 'Typed incorrectly.',
          },
          generateIdempotencyKey(),
        ),
      ).rejects.toThrow();
    });

    it('rejects lifecycle actions after their window closes', async () => {
      const subject = setup();
      await subject.registerLifecycle({
        ...sampleLifecycleActionSnapshot,
        actions: [
          {
            action: 'correct',
            enabled: true,
            correctableFieldSet: ['/householdSize'],
            window: { state: 'closed', closedAt: '2026-05-24T00:00:00.000Z' },
          },
        ],
      });
      await expect(
        subject.adapter.submitCorrection(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            changedFields: [{ path: '/householdSize', label: 'Household size' }],
            reason: 'Typed incorrectly.',
          },
          generateIdempotencyKey(),
        ),
      ).rejects.toThrow();
    });

    it('enforces evidence requirements declared on the lifecycle action', async () => {
      const subject = setup();
      await subject.registerLifecycle({
        ...sampleLifecycleActionSnapshot,
        actions: [
          {
            action: 'correct',
            enabled: true,
            correctableFieldSet: ['/householdSize'],
            requiresReason: true,
            requiresEvidence: true,
          },
        ],
      });
      await expect(
        subject.adapter.submitCorrection(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            changedFields: [{ path: '/householdSize', label: 'Household size' }],
            reason: 'Typed incorrectly.',
          },
          generateIdempotencyKey(),
        ),
      ).rejects.toThrow();
      await expect(
        subject.adapter.submitCorrection(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            changedFields: [{ path: '/householdSize', label: 'Household size' }],
            reason: 'Typed incorrectly.',
            evidenceRefs: ['upload:household-statement'],
          },
          generateIdempotencyKey(),
        ),
      ).resolves.toMatchObject({ action: 'correct' });
    });

    it('enforces signer-only dispute scope', async () => {
      const subject = setup();
      await subject.registerLifecycle(sampleLifecycleActionSnapshot);
      await expect(
        subject.adapter.submitDispute(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            actorRef: 'not-the-signer',
            disputedEventId: sampleLifecycleActionSnapshot.events[0]?.eventId,
            statement: 'I dispute this signed record.',
          },
          generateIdempotencyKey(),
        ),
      ).rejects.toThrow();
    });

    it('enforces all-party withdrawal scope when declared', async () => {
      const subject = setup();
      await subject.registerLifecycle({
        ...sampleLifecycleActionSnapshot,
        actions: [
          {
            action: 'withdraw',
            enabled: true,
            requiresReason: true,
            partyScope: 'all-parties-must-agree',
          },
        ],
      });
      await expect(
        subject.adapter.submitWithdrawal(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            reason: 'Changed intent.',
          },
          generateIdempotencyKey(),
        ),
      ).rejects.toThrow();
      await expect(
        subject.adapter.submitWithdrawal(
          {
            caseUrn: sampleLifecycleActionSnapshot.caseUrn,
            reason: 'Changed intent.',
            allPartiesApproved: true,
          },
          generateIdempotencyKey(),
        ),
      ).resolves.toMatchObject({ action: 'withdraw' });
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

export interface PaymentRailAdapterConformanceSubject {
  adapter: PaymentRailAdapter;
}

/**
 * Conformance harness for `PaymentRailAdapter` (FW-0027, web ADR-0011
 * §payment). Encodes the authorize / capture / void lifecycle invariants
 * the port comment names — idempotency families, atomicity boundary
 * conditions (double-capture / void-after-capture / capture-after-void),
 * unknown-authorization rejection, UUIDv7 enforcement, Money integer
 * + non-empty currency enforcement.
 */
export function definePaymentRailAdapterConformance(
  name: string,
  setup: () => PaymentRailAdapterConformanceSubject,
): void {
  describe(name, () => {
    it('authorize rejects non-UUIDv7 idempotency keys', async () => {
      const subject = setup();
      await expect(
        subject.adapter.authorize(samplePaymentAmount, samplePaymentMethodToken, 'not-a-uuid-v7'),
      ).rejects.toThrow();
    });

    it('capture rejects non-UUIDv7 idempotency keys', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      await expect(subject.adapter.capture(auth, 'not-a-uuid-v7')).rejects.toThrow();
    });

    it('voidAuthorization rejects non-UUIDv7 idempotency keys', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      await expect(subject.adapter.voidAuthorization(auth, 'not-a-uuid-v7')).rejects.toThrow();
    });

    it('authorize is idempotent for the same UUIDv7 idempotency key', async () => {
      const subject = setup();
      const key = generateIdempotencyKey();
      const first = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        key,
      );
      const second = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        key,
      );
      expect(second).toEqual(first);
    });

    it('authorize returns the discriminator + supplied amount + a non-empty rail label', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      expect(auth.kind).toBe('payment-authorization');
      expect(auth.amount).toEqual(samplePaymentAmount);
      expect(auth.id.length).toBeGreaterThan(0);
      expect(auth.railLabel.length).toBeGreaterThan(0);
    });

    it('capture settles a prior authorization into a CaptureReceipt', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      const receipt = await subject.adapter.capture(auth, generateIdempotencyKey());
      expect(receipt.kind).toBe('payment-capture-receipt');
      expect(receipt.authorizationId).toBe(auth.id);
      expect(receipt.amount).toEqual(auth.amount);
      expect(receipt.railLabel).toBe(auth.railLabel);
      expect(receipt.settledTransactionId.length).toBeGreaterThan(0);
    });

    it('capture is idempotent for the same UUIDv7 idempotency key', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      const captureKey = generateIdempotencyKey();
      const first = await subject.adapter.capture(auth, captureKey);
      const second = await subject.adapter.capture(auth, captureKey);
      expect(second).toEqual(first);
    });

    it('capture against an unknown authorization throws', async () => {
      const subject = setup();
      const fakeAuth: Authorization = {
        kind: 'payment-authorization',
        id: 'unknown-authorization-id',
        amount: samplePaymentAmount,
        railLabel: 'Unknown',
      };
      await expect(
        subject.adapter.capture(fakeAuth, generateIdempotencyKey()),
      ).rejects.toThrow();
    });

    it('double-capture with two different keys throws', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      await subject.adapter.capture(auth, generateIdempotencyKey());
      await expect(
        subject.adapter.capture(auth, generateIdempotencyKey()),
      ).rejects.toThrow();
    });

    it('voidAuthorization releases a not-yet-captured authorization without throwing', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      await expect(
        subject.adapter.voidAuthorization(auth, generateIdempotencyKey()),
      ).resolves.toBeUndefined();
    });

    it('voidAuthorization against an already-captured authorization throws', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      await subject.adapter.capture(auth, generateIdempotencyKey());
      await expect(
        subject.adapter.voidAuthorization(auth, generateIdempotencyKey()),
      ).rejects.toThrow();
    });

    it('capture against a previously-voided authorization throws', async () => {
      const subject = setup();
      const auth = await subject.adapter.authorize(
        samplePaymentAmount,
        samplePaymentMethodToken,
        generateIdempotencyKey(),
      );
      await subject.adapter.voidAuthorization(auth, generateIdempotencyKey());
      await expect(
        subject.adapter.capture(auth, generateIdempotencyKey()),
      ).rejects.toThrow();
    });

    it('authorize rejects Money with fractional amountMinorUnits', async () => {
      const subject = setup();
      const fractional: Money = { amountMinorUnits: 12.5, currency: 'USD' };
      await expect(
        subject.adapter.authorize(fractional, samplePaymentMethodToken, generateIdempotencyKey()),
      ).rejects.toThrow();
    });

    it('authorize rejects Money with negative amountMinorUnits', async () => {
      const subject = setup();
      const negative: Money = { amountMinorUnits: -100, currency: 'USD' };
      await expect(
        subject.adapter.authorize(negative, samplePaymentMethodToken, generateIdempotencyKey()),
      ).rejects.toThrow();
    });

    it('authorize rejects Money with an empty currency', async () => {
      const subject = setup();
      const empty: Money = { amountMinorUnits: 100, currency: '' };
      await expect(
        subject.adapter.authorize(empty, samplePaymentMethodToken, generateIdempotencyKey()),
      ).rejects.toThrow();
    });
  });
}


export interface EmbedTransportConformanceSubject {
  adapter: EmbedTransport;
  /**
   * Adapters whose `isEmbedded()` cannot be toggled by construction expose a
   * setup hook here that returns the adapter in its embedded posture. Stub
   * adapters (constructed with `{ embedded: true, hostOrigin }`) pass undefined
   * and the suite uses the same subject for both branches.
   */
  embeddedSubject?: () => { adapter: EmbedTransport };
}

export interface ScreenerDocumentSourceConformanceSubject {
  adapter: ScreenerDocumentSource;
  /**
   * Registers the document for the suite's lookup tests. Catalog
   * adapters that load from an immutable source (static bundle, IPFS
   * URI) can implement this as a no-op when the URN already lives in
   * the catalog AND the fixture matches the existing entry; mismatch
   * MUST throw.
   */
  registerScreener(document: ScreenerDocumentInput): void | Promise<void>;
}

export interface ReviewerSessionConformanceSubject {
  adapter: ReviewerSession;
  ensureThread(threadId: string, policySnapshot: ReviewThreadPolicySnapshot): void | Promise<void>;
}

export interface ReviewThreadStoreConformanceSubject {
  adapter: ReviewThreadStore;
  reviewerSession: ReviewerSession;
}

export function defineSafeAddressDirectoryConformance(
  name: string,
  setup: () => SafeAddressDirectoryConformanceSubject,
): void {
  describe(name, () => {
    it('lists supported substitute-address jurisdictions without plaintext registry contents', async () => {
      const subject = setup();
      const jurisdictions = await subject.adapter.supportedJurisdictions();
      expect(jurisdictions).toContainEqual(subject.expectedJurisdiction);
      for (const entry of jurisdictions) {
        expect(entry.jurisdictionKey.length).toBeGreaterThan(0);
        expect(entry.label.length).toBeGreaterThan(0);
        expect(['safe-address', 'safe-contact', 'safe-employer']).toContain(entry.accessClass);
        expect('substitutes' in entry).toBe(false);
      }
    });

    it('validates a recognized substitute address for the requested jurisdiction', async () => {
      const subject = setup();
      const result = await subject.adapter.validateSubstituteAddress({
        jurisdictionKey: subject.expectedJurisdiction.jurisdictionKey,
        accessClass: subject.expectedJurisdiction.accessClass,
        candidate: subject.validCandidate,
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.jurisdictionKey).toBe(subject.expectedJurisdiction.jurisdictionKey);
        expect(result.normalizedSubstitute.length).toBeGreaterThan(0);
      }
    });

    it('rejects unknown or unrecognized substitute addresses without throwing', async () => {
      const subject = setup();
      await expect(subject.adapter.validateSubstituteAddress({
        jurisdictionKey: subject.expectedJurisdiction.jurisdictionKey,
        accessClass: subject.expectedJurisdiction.accessClass,
        candidate: subject.invalidCandidate,
      })).resolves.toMatchObject({
        valid: false,
        reason: 'not-recognized',
      });
      await expect(subject.adapter.validateSubstituteAddress({
        jurisdictionKey: 'missing-program',
        candidate: subject.validCandidate,
      })).resolves.toMatchObject({
        valid: false,
        reason: 'unknown-jurisdiction',
      });
    });
  });
}

/**
 * Conformance harness for `EmbedTransport` (FW-0040, web ADR-0011 §embed).
 * Encodes the iframe-context + transport invariants the port comment names —
 * boolean isEmbedded, string|null hostOrigin, wildcard rejection, origin
 * shape enforcement, subscribeFromHost cleanup, no handler-payload mutation.
 */
export function defineEmbedTransportConformance(
  name: string,
  setup: () => EmbedTransportConformanceSubject,
): void {
  describe(name, () => {
    it("isEmbedded() returns a boolean", () => {
      const subject = setup();
      const value: unknown = subject.adapter.isEmbedded();
      expect(typeof value).toBe("boolean");
    });

    it("hostOrigin() returns a string or null", () => {
      const subject = setup();
      const value = subject.adapter.hostOrigin();
      if (value !== null) {
        expect(typeof value).toBe("string");
        // Round-trip through URL to assert origin shape (no path / query / fragment).
        expect(() => new URL(value)).not.toThrow();
      }
    });

    it("postMessage rejects wildcard targetOrigin", () => {
      const subject = setup();
      expect(() => subject.adapter.postMessage(sampleEmbedMessage, "*")).toThrow();
    });

    it("postMessage rejects non-origin strings with a path", () => {
      const subject = setup();
      expect(() =>
        subject.adapter.postMessage(sampleEmbedMessage, `${sampleAllowedHostOrigin}/path`),
      ).toThrow();
    });

    it("postMessage rejects the empty string", () => {
      const subject = setup();
      expect(() => subject.adapter.postMessage(sampleEmbedMessage, "")).toThrow();
    });

    it("subscribeFromHost returns an Unsubscribe that detaches the listener", () => {
      const subject = setup();
      const received: EmbedMessageFromHost[] = [];
      const handler = (envelope: EmbedMessageFromHost): void => {
        received.push(envelope);
      };
      const unsubscribe = subject.adapter.subscribeFromHost(handler);
      expect(typeof unsubscribe).toBe("function");
      // Calling twice is idempotent (no-op the second time).
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });

    it("postMessage with a well-formed origin does not throw", () => {
      const subject = setup();
      expect(() =>
        subject.adapter.postMessage(sampleEmbedMessage, sampleAllowedHostOrigin),
      ).not.toThrow();
    });

    it("EmbedMessage shape carries the host-handshake variant", () => {
      const message: EmbedMessage = sampleEmbedMessage;
      expect(message.kind).toBe("host-handshake");
    });
  });
}

/**
 * Conformance harness for `ScreenerDocumentSource` (FW-0046, web
 * ADR-0011 §screener). Encodes the catalog-lookup contract the port
 * comment names — round-trip through JSON, URN-keyed lookup,
 * not-found discriminator, closed `$formspecScreener` literal,
 * required-fields guard.
 */
export function defineScreenerDocumentSourceConformance(
  name: string,
  setup: () => ScreenerDocumentSourceConformanceSubject,
): void {
  describe(name, () => {
    it('round-trips a ScreenerDocumentInput through readScreener', async () => {
      const subject = setup();
      await subject.registerScreener(sampleScreenerDocument);
      const found = await subject.adapter.readScreener({ url: sampleScreenerDocument.url });
      expect(isScreenerDocumentInput(roundTripJson(found))).toBe(true);
      expect(found.url).toBe(sampleScreenerDocument.url);
      expect(found.version).toBe(sampleScreenerDocument.version);
      expect(found.title).toBe(sampleScreenerDocument.title);
    });

    it('throws ScreenerDocumentNotFoundError on URN miss', async () => {
      const subject = setup();
      await subject.registerScreener(sampleScreenerDocument);
      await expect(
        subject.adapter.readScreener({ url: 'urn:conformance:missing-screener' }),
      ).rejects.toBeInstanceOf(ScreenerDocumentNotFoundError);
    });

    it('rejects a fixture missing the $formspecScreener literal', async () => {
      const subject = setup();
      const invalid = {
        ...sampleScreenerDocument,
        $formspecScreener: '2.0',
      } as unknown as ScreenerDocumentInput;
      await expect(Promise.resolve().then(() => subject.registerScreener(invalid))).rejects.toThrow();
    });

    it('rejects a fixture missing required url field', async () => {
      const subject = setup();
      const { url: _omit, ...rest } = sampleScreenerDocument;
      const invalid = rest as unknown as ScreenerDocumentInput;
      await expect(Promise.resolve().then(() => subject.registerScreener(invalid))).rejects.toThrow();
    });

    it('rejects a fixture missing required evaluation field', async () => {
      const subject = setup();
      const { evaluation: _omit, ...rest } = sampleScreenerDocument;
      const invalid = rest as unknown as ScreenerDocumentInput;
      await expect(Promise.resolve().then(() => subject.registerScreener(invalid))).rejects.toThrow();
    });

    it('rejects a fixture missing required items field', async () => {
      const subject = setup();
      const { items: _omit, ...rest } = sampleScreenerDocument;
      const invalid = rest as unknown as ScreenerDocumentInput;
      await expect(Promise.resolve().then(() => subject.registerScreener(invalid))).rejects.toThrow();
    });
  });
}

export const sampleReviewThreadPolicySnapshot: ReviewThreadPolicySnapshot = {
  posture: 'suggest-allowed',
  respondentOnlyFieldPointers: ['/data/protectedAddress'],
  reviewerSessionBindingRef: 'urn:formspec-web:adapter:reviewer-session:conformance',
  reviewThreadStoreBindingRef: 'urn:formspec-web:adapter:review-thread-store:conformance',
};

export function defineReviewerSessionConformance(
  name: string,
  setup: () => ReviewerSessionConformanceSubject,
): void {
  describe(name, () => {
    it('mints, lists, and redeems a capability URL for an existing thread', async () => {
      const subject = setup();
      const threadId = 'review-thread:conformance:session';
      await subject.ensureThread(threadId, sampleReviewThreadPolicySnapshot);
      const minted = await subject.adapter.mintShare({
        threadId,
        requestedScope: 'view+comment',
        audienceHint: 'Pat reviewer',
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      expect(minted.shareId.length).toBeGreaterThan(0);
      expect(minted.capabilityUrl).toContain(minted.shareId);

      const shares = await subject.adapter.listShares({
        threadId,
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      expect(shares.map((share) => share.shareId)).toContain(minted.shareId);

      const redeemed = await subject.adapter.redeem({ capabilityUrl: minted.capabilityUrl });
      expect(redeemed.shareId).toBe(minted.shareId);
      expect(redeemed.threadId).toBe(threadId);
      expect(redeemed.grantedScope).toBe<ReviewerScope>('view+comment');
      expect(redeemed.threadPolicySnapshot.posture).toBe('suggest-allowed');
      expect(redeemed.sessionToken.length).toBeGreaterThan(0);
    });

    it('revokes a share and rejects later redemption', async () => {
      const subject = setup();
      const threadId = 'review-thread:conformance:revocation';
      await subject.ensureThread(threadId, sampleReviewThreadPolicySnapshot);
      const minted = await subject.adapter.mintShare({
        threadId,
        requestedScope: 'view+comment',
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      await subject.adapter.revoke({
        shareId: minted.shareId,
        reason: 'respondent revoked',
        respondentSessionToken: respondentTokenForThread(threadId),
      });

      const shares = await subject.adapter.listShares({
        threadId,
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      expect(shares.find((share) => share.shareId === minted.shareId)?.revokedAt)
        .toBeDefined();
      await expect(subject.adapter.redeem({ capabilityUrl: minted.capabilityUrl }))
        .rejects.toThrow();
    });

    it('rejects invalid capability URLs', async () => {
      const subject = setup();
      await expect(subject.adapter.redeem({ capabilityUrl: 'https://review.example.test/r/nope' }))
        .rejects.toThrow();
    });

    it('rejects expired and nonmatching capability URLs', async () => {
      const subject = setup();
      const threadId = 'review-thread:conformance:expired';
      await subject.ensureThread(threadId, sampleReviewThreadPolicySnapshot);
      const expired = await subject.adapter.mintShare({
        threadId,
        requestedScope: 'view+comment',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      await expect(subject.adapter.redeem({ capabilityUrl: expired.capabilityUrl }))
        .rejects.toThrow();

      const firstThreadId = 'review-thread:conformance:first';
      const secondThreadId = 'review-thread:conformance:second';
      await subject.ensureThread(firstThreadId, sampleReviewThreadPolicySnapshot);
      await subject.ensureThread(secondThreadId, sampleReviewThreadPolicySnapshot);
      const firstShare = await subject.adapter.mintShare({
        threadId: firstThreadId,
        requestedScope: 'view+comment',
        respondentSessionToken: respondentTokenForThread(firstThreadId),
      });
      const nonmatchingUrl = firstShare.capabilityUrl.replace(
        encodeURIComponent(firstThreadId),
        encodeURIComponent(secondThreadId),
      );
      await expect(subject.adapter.redeem({ capabilityUrl: nonmatchingUrl }))
        .rejects.toThrow();
    });

    it('fails closed when the thread requires reviewer identity assurance', async () => {
      const subject = setup();
      const threadId = 'review-thread:conformance:assurance';
      await subject.ensureThread(threadId, {
        ...sampleReviewThreadPolicySnapshot,
        reviewerAssuranceFloor: 'L2',
      });
      await expect(subject.adapter.mintShare({
        threadId,
        requestedScope: 'view+comment',
        respondentSessionToken: respondentTokenForThread(threadId),
      })).rejects.toThrow();
    });
  });
}

export function defineReviewThreadStoreConformance(
  name: string,
  setup: () => ReviewThreadStoreConformanceSubject,
): void {
  describe(name, () => {
    it('ensures and reads a schema-shaped review thread sidecar', async () => {
      const subject = setup();
      const threadId = 'review-thread:conformance:store';
      const thread = await subject.adapter.ensureThread({
        threadId,
        draftRef: { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version },
        policySnapshot: sampleReviewThreadPolicySnapshot,
      });
      expect(isReviewThread(thread)).toBe(true);
      const found = await subject.adapter.read({
        threadId,
        sessionToken: respondentTokenForThread(threadId),
      });
      expect(found.threadId).toBe(threadId);
      expect(found.policySnapshot.posture).toBe('suggest-allowed');
    });

    it('rejects unscoped reads after reviewer token revocation', async () => {
      const subject = setup();
      const { threadId, sessionToken, shareId } = await createRedeemedReviewShare(subject);
      await expect(subject.adapter.read({ threadId, sessionToken })).resolves.toMatchObject({ threadId });
      await subject.reviewerSession.revoke({
        shareId,
        reason: 'respondent revoked',
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      await expect(subject.adapter.read({ threadId, sessionToken })).rejects.toThrow();
    });

    it('accepts reviewer comments and suggestions under a reviewer session token', async () => {
      const subject = setup();
      const { threadId, sessionToken, shareId } = await createRedeemedReviewShare(subject);
      const comment = await subject.adapter.appendEvent({
        threadId,
        sessionToken,
        author: { kind: 'reviewer', shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'comment-added',
          anchor: { fieldPointer: '/data/fullName' },
          body: 'Check spelling.',
        },
      });
      expect(comment.payload.type).toBe('comment-added');

      const suggestion = await subject.adapter.appendEvent({
        threadId,
        sessionToken,
        author: { kind: 'reviewer', shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'suggestion-added',
          anchor: { fieldPointer: '/data/fullName' },
          proposedValue: 'Grace Hopper',
        },
      });
      expect(suggestion.payload.type).toBe('suggestion-added');
    });

    it('rejects respondent-only actions from reviewer capability tokens', async () => {
      const subject = setup();
      const { threadId, sessionToken, shareId } = await createRedeemedReviewShare(subject);
      await expect(subject.adapter.appendEvent({
        threadId,
        sessionToken,
        author: { kind: 'reviewer', shareId, displayName: 'Pat reviewer' },
        payload: { type: 'share-revoked', shareId },
      })).rejects.toThrow();
    });

    it('rejects reviewer tokens on the wrong thread and outside granted scope', async () => {
      const subject = setup();
      const firstThreadId = 'review-thread:conformance:scope-a';
      const secondThreadId = 'review-thread:conformance:scope-b';
      await subject.adapter.ensureThread({
        threadId: firstThreadId,
        draftRef: { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version },
        policySnapshot: sampleReviewThreadPolicySnapshot,
      });
      await subject.adapter.ensureThread({
        threadId: secondThreadId,
        draftRef: { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version },
        policySnapshot: sampleReviewThreadPolicySnapshot,
      });
      const minted = await subject.reviewerSession.mintShare({
        threadId: firstThreadId,
        requestedScope: 'view+comment',
        respondentSessionToken: respondentTokenForThread(firstThreadId),
      });
      const redeemed = await subject.reviewerSession.redeem({ capabilityUrl: minted.capabilityUrl });

      await expect(subject.adapter.appendEvent({
        threadId: secondThreadId,
        sessionToken: redeemed.sessionToken,
        author: { kind: 'reviewer', shareId: redeemed.shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'comment-added',
          anchor: { fieldPointer: '/data/fullName' },
          body: 'Wrong thread write.',
        },
      })).rejects.toThrow();

      await expect(subject.adapter.appendEvent({
        threadId: firstThreadId,
        sessionToken: redeemed.sessionToken,
        author: { kind: 'reviewer', shareId: redeemed.shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'suggestion-added',
          anchor: { fieldPointer: '/data/fullName' },
          proposedValue: 'Grace Hopper',
        },
      })).rejects.toThrow();

      const viewOnly = await subject.reviewerSession.mintShare({
        threadId: firstThreadId,
        requestedScope: 'view',
        respondentSessionToken: respondentTokenForThread(firstThreadId),
      });
      const viewGrant = await subject.reviewerSession.redeem({ capabilityUrl: viewOnly.capabilityUrl });
      await expect(subject.adapter.appendEvent({
        threadId: firstThreadId,
        sessionToken: viewGrant.sessionToken,
        author: { kind: 'reviewer', shareId: viewGrant.shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'comment-added',
          anchor: { fieldPointer: '/data/fullName' },
          body: 'View-only should not comment.',
        },
      })).rejects.toThrow();
    });

    it('rejects revoked and expired reviewer session tokens', async () => {
      const subject = setup();
      const threadId = 'review-thread:conformance:session-token-lifecycle';
      await subject.adapter.ensureThread({
        threadId,
        draftRef: { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version },
        policySnapshot: sampleReviewThreadPolicySnapshot,
      });
      const revoked = await subject.reviewerSession.mintShare({
        threadId,
        requestedScope: 'view+comment',
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      const revokedGrant = await subject.reviewerSession.redeem({ capabilityUrl: revoked.capabilityUrl });
      await subject.reviewerSession.revoke({
        shareId: revokedGrant.shareId,
        reason: 'respondent revoked',
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      await expect(subject.adapter.appendEvent({
        threadId,
        sessionToken: revokedGrant.sessionToken,
        author: { kind: 'reviewer', shareId: revokedGrant.shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'comment-added',
          anchor: { fieldPointer: '/data/fullName' },
          body: 'Revoked token write.',
        },
      })).rejects.toThrow();

      const expiring = await subject.reviewerSession.mintShare({
        threadId,
        requestedScope: 'view+comment',
        expiresAt: new Date(Date.now() + 20).toISOString(),
        respondentSessionToken: respondentTokenForThread(threadId),
      });
      const expiringGrant = await subject.reviewerSession.redeem({ capabilityUrl: expiring.capabilityUrl });
      await sleep(40);
      await expect(subject.adapter.appendEvent({
        threadId,
        sessionToken: expiringGrant.sessionToken,
        author: { kind: 'reviewer', shareId: expiringGrant.shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'comment-added',
          anchor: { fieldPointer: '/data/fullName' },
          body: 'Expired token write.',
        },
      })).rejects.toThrow();
    });

    it('rejects suggestions on respondent-only field pointers', async () => {
      const subject = setup();
      const { threadId, sessionToken, shareId } = await createRedeemedReviewShare(subject);
      await expect(subject.adapter.appendEvent({
        threadId,
        sessionToken,
        author: { kind: 'reviewer', shareId, displayName: 'Pat reviewer' },
        payload: {
          type: 'suggestion-added',
          anchor: { fieldPointer: '/data/protectedAddress' },
          proposedValue: 'Hidden address',
        },
      })).rejects.toThrow();
    });

    it('pins a thread for receipt with a respondent token', async () => {
      const subject = setup();
      const threadId = 'review-thread:conformance:pin';
      await subject.adapter.ensureThread({
        threadId,
        draftRef: { formUrl: sampleFormDefinition.url },
        policySnapshot: sampleReviewThreadPolicySnapshot,
      });
      const pinned = await subject.adapter.pinForReceipt({
        threadId,
        sessionToken: respondentTokenForThread(threadId),
      });
      expect(pinned.threadHash).toMatch(/^sha256:/);
      expect(pinned.bindingArtifactRef).toContain(threadId);
    });
  });
}

async function createRedeemedReviewShare(subject: ReviewThreadStoreConformanceSubject) {
  const threadId = `review-thread:conformance:${Math.random().toString(16).slice(2)}`;
  await subject.adapter.ensureThread({
    threadId,
    draftRef: { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version },
    policySnapshot: sampleReviewThreadPolicySnapshot,
  });
  const minted = await subject.reviewerSession.mintShare({
    threadId,
    requestedScope: 'view+comment+suggest',
    respondentSessionToken: respondentTokenForThread(threadId),
  });
  const redeemed = await subject.reviewerSession.redeem({ capabilityUrl: minted.capabilityUrl });
  return {
    threadId,
    shareId: redeemed.shareId,
    sessionToken: redeemed.sessionToken,
  };
}

function respondentTokenForThread(threadId: string) {
  return respondentSessionToken(`conformance:thread=${encodeURIComponent(threadId)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReviewThread(value: unknown): value is ReviewThread {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReviewThread>;
  return candidate.$formspecReviewThread === '1.0'
    && typeof candidate.threadId === 'string'
    && typeof candidate.draftRef === 'object'
    && candidate.draftRef !== null
    && typeof candidate.policySnapshot === 'object'
    && candidate.policySnapshot !== null
    && Array.isArray(candidate.shares)
    && Array.isArray(candidate.events);
}
