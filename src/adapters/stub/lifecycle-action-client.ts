import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import { assertUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';
import type {
  CorrectionLifecycleEvent,
  DisputeLifecycleEvent,
  LifecycleActionAvailability,
  LifecycleActionClient,
  LifecycleActionReceipt,
  LifecycleActionSnapshot,
  LifecycleChangedField,
  LifecycleTimelineEvent,
  WithdrawalLifecycleEvent,
} from '../../ports/lifecycle-action-client.ts';

export interface StubLifecycleActionClientOptions {
  readonly initialSnapshots?: Iterable<LifecycleActionSnapshot>;
  readonly correctableFieldSet?: readonly string[];
  readonly now?: () => Date;
}

export interface StubLifecycleActionClient extends LifecycleActionClient {
  registerLifecycle(snapshot: LifecycleActionSnapshot): void;
  _internalSnapshot(caseUrn: string): LifecycleActionSnapshot | undefined;
}

const DEFAULT_ACTIONS: readonly LifecycleActionAvailability[] = [
  {
    action: 'correct',
    enabled: true,
    window: { state: 'open' },
    requiresReason: true,
  },
  {
    action: 'withdraw',
    enabled: true,
    window: { state: 'closes-at', closesAt: '2026-06-24T23:59:59.000Z' },
    requiresReason: true,
  },
  {
    action: 'dispute',
    enabled: true,
    signerOnly: true,
    requiresReason: true,
  },
];

const DEFAULT_CORRECTABLE_FIELD_SET = [
  '/fullName',
  '/householdSize',
  '/address/street',
] as const;

export function stubLifecycleActionClient(
  options: StubLifecycleActionClientOptions = {},
): StubLifecycleActionClient {
  const snapshots = new Map<string, LifecycleActionSnapshot>();
  const receiptsByKey = new Map<string, LifecycleActionReceipt>();
  const correctableFieldSet = new Set(options.correctableFieldSet ?? DEFAULT_CORRECTABLE_FIELD_SET);
  const now = options.now ?? (() => new Date());
  let nextEvent = 0;

  for (const snapshot of options.initialSnapshots ?? []) {
    snapshots.set(snapshot.caseUrn, cloneJson(snapshot));
  }

  const adapter: StubLifecycleActionClient = {
    registerLifecycle(snapshot) {
      snapshots.set(snapshot.caseUrn, cloneJson(snapshot));
    },

    async readLifecycle(request) {
      return cloneJson(snapshots.get(request.caseUrn));
    },

    async submitCorrection(request, idempotencyKey) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      const existing = receiptsByKey.get(idempotencyKey);
      if (existing) return cloneJson(existing);
      assertActionEnabled(snapshotFor(request.caseUrn), 'correct');
      assertChangedFields(request.changedFields);
      const event: CorrectionLifecycleEvent = {
        kind: 'correction',
        eventId: nextEventId('correction'),
        occurredAt: now().toISOString(),
        verified: true,
        actorLabel: 'Respondent',
        partyRef: request.partyRef,
        recordedAs: request.changedFields.every((field) => correctableFieldSet.has(field.path))
          ? 'correction'
          : 'amendment',
        changedFields: cloneJson(request.changedFields),
        reason: request.reason ? { text: request.reason } : undefined,
        evidenceRefs: request.evidenceRefs ? [...request.evidenceRefs] : undefined,
      };
      return appendReceipt(request.caseUrn, 'correct', event, idempotencyKey);
    },

    async submitWithdrawal(request, idempotencyKey) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      const existing = receiptsByKey.get(idempotencyKey);
      if (existing) return cloneJson(existing);
      assertActionEnabled(snapshotFor(request.caseUrn), 'withdraw');
      const event: WithdrawalLifecycleEvent = {
        kind: 'withdrawal',
        eventId: nextEventId('withdrawal'),
        occurredAt: now().toISOString(),
        verified: true,
        actorLabel: 'Applicant',
        partyRef: request.partyRef,
        reason: request.reason ? { text: request.reason } : undefined,
        rescissionRequested: request.rescissionRequested,
        requiresIssuerAcceptance: request.rescissionRequested ? true : undefined,
      };
      return appendReceipt(request.caseUrn, 'withdraw', event, idempotencyKey);
    },

    async submitDispute(request, idempotencyKey) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      const existing = receiptsByKey.get(idempotencyKey);
      if (existing) return cloneJson(existing);
      assertActionEnabled(snapshotFor(request.caseUrn), 'dispute');
      if (request.statement.trim().length === 0) {
        throw new Error('Dispute statement is required');
      }
      const event: DisputeLifecycleEvent = {
        kind: 'dispute',
        eventId: nextEventId('dispute'),
        occurredAt: now().toISOString(),
        verified: true,
        actorLabel: 'Signer',
        partyRef: request.partyRef,
        disputedEventId: request.disputedEventId,
        statement: { text: request.statement },
      };
      return appendReceipt(request.caseUrn, 'dispute', event, idempotencyKey);
    },

    _internalSnapshot(caseUrn) {
      return cloneJson(snapshots.get(caseUrn));
    },
  };

  markDemoStubAdapter(adapter, {
    featureKey: 'recordLifecycle',
    reason: 'in-memory lifecycle action client; demo only - events reset on reload',
  });
  return adapter;

  function snapshotFor(caseUrn: string): LifecycleActionSnapshot {
    const existing = snapshots.get(caseUrn);
    if (existing) return existing;
    const created: LifecycleActionSnapshot = {
      caseUrn,
      actions: DEFAULT_ACTIONS,
      events: [originalSubmissionEvent()],
      updatedAt: now().toISOString(),
    };
    snapshots.set(caseUrn, created);
    return created;
  }

  function appendReceipt(
    caseUrn: string,
    action: LifecycleActionReceipt['action'],
    event: LifecycleTimelineEvent,
    idempotencyKey: string,
  ): LifecycleActionReceipt {
    const current = snapshotFor(caseUrn);
    const snapshot: LifecycleActionSnapshot = {
      ...current,
      events: [...current.events, event],
      updatedAt: event.occurredAt,
    };
    snapshots.set(caseUrn, snapshot);
    const receipt: LifecycleActionReceipt = {
      action,
      event,
      snapshot,
      supportRef: `lifecycle-${event.eventId}`,
    };
    receiptsByKey.set(idempotencyKey, cloneJson(receipt));
    return cloneJson(receipt);
  }

  function nextEventId(prefix: string): string {
    nextEvent += 1;
    return `evt-${prefix}-${nextEvent.toString().padStart(6, '0')}`;
  }

  function originalSubmissionEvent(): LifecycleTimelineEvent {
    return {
      kind: 'original-submission',
      eventId: nextEventId('original'),
      occurredAt: '2026-05-23T12:00:00.000Z',
      verified: true,
      title: 'Original signed submission',
      actorLabel: 'Respondent',
    };
  }
}

function assertChangedFields(fields: readonly LifecycleChangedField[]): void {
  if (fields.length === 0) {
    throw new Error('At least one changed field is required');
  }
  for (const field of fields) {
    if (field.path.length === 0 || field.label.length === 0) {
      throw new Error('Changed fields need a path and label');
    }
  }
}

function assertActionEnabled(
  snapshot: LifecycleActionSnapshot,
  action: LifecycleActionReceipt['action'],
): void {
  const found = snapshot.actions.find((candidate) => candidate.action === action);
  if (!found?.enabled) {
    throw new Error(`${action} is not available for this record`);
  }
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
