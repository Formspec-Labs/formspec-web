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
  readonly signerRefs?: readonly string[];
  readonly now?: () => Date;
}

export interface StubLifecycleActionClient extends LifecycleActionClient {
  registerLifecycle(snapshot: LifecycleActionSnapshot): void;
  _internalSnapshot(caseUrn: string): LifecycleActionSnapshot | undefined;
}

const DEFAULT_CORRECTABLE_FIELD_SET = [
  '/fullName',
  '/householdSize',
  '/address/street',
] as const;

const DEFAULT_ACTIONS: readonly LifecycleActionAvailability[] = [
  {
    action: 'correct',
    enabled: true,
    window: { state: 'open' },
    correctableFieldSet: DEFAULT_CORRECTABLE_FIELD_SET,
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

export function stubLifecycleActionClient(
  options: StubLifecycleActionClientOptions = {},
): StubLifecycleActionClient {
  const snapshots = new Map<string, LifecycleActionSnapshot>();
  const receiptsByKey = new Map<string, LifecycleActionReceipt>();
  const correctableFieldSet = new Set(options.correctableFieldSet ?? DEFAULT_CORRECTABLE_FIELD_SET);
  const signerRefs = new Set(options.signerRefs ?? []);
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
      const snapshot = snapshotFor(request.caseUrn);
      const action = assertActionEnabled(snapshot, 'correct');
      assertChangedFields(request.changedFields);
      assertReasonIfRequired(action, request.reason, 'Correction reason is required');
      assertEvidenceIfRequired(action, request.evidenceRefs);
      const declaredFieldSet = request.correctableFieldSet ?? action.correctableFieldSet ?? [
        ...correctableFieldSet,
      ];
      if (declaredFieldSet.length === 0) {
        throw new Error('Correction field set is not declared for this record');
      }
      const declaredPaths = new Set(declaredFieldSet);
      const isNarrowCorrection =
        request.changedFields.every((field) => declaredPaths.has(field.path)) &&
        request.caseDecisionReached !== true &&
        !introducesNewField(request.changedFields);
      const event: CorrectionLifecycleEvent = {
        kind: 'correction',
        eventId: nextEventId('correction'),
        occurredAt: now().toISOString(),
        verified: true,
        actorLabel: 'Respondent',
        partyRef: request.partyRef,
        recordedAs: isNarrowCorrection ? 'correction' : 'amendment',
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
      const action = assertActionEnabled(snapshotFor(request.caseUrn), 'withdraw');
      assertReasonIfRequired(action, request.reason, 'Withdrawal reason is required');
      assertPartyScope(action, request);
      assertRescissionPolicy(action, request.rescissionRequested);
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
      const action = assertActionEnabled(snapshotFor(request.caseUrn), 'dispute');
      assertSignerScope(action, request.actorRef, signerRefs);
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
): LifecycleActionAvailability {
  const found = snapshot.actions.find((candidate) => candidate.action === action);
  if (!found?.enabled) {
    throw new Error(`${action} is not available for this record`);
  }
  if (found.window?.state === 'closed') {
    throw new Error(`${action} window is closed for this record`);
  }
  return found;
}

function assertReasonIfRequired(
  action: LifecycleActionAvailability,
  reason: string | undefined,
  message: string,
): void {
  if (action.requiresReason === true && (!reason || reason.trim().length === 0)) {
    throw new Error(message);
  }
}

function assertEvidenceIfRequired(
  action: LifecycleActionAvailability,
  evidenceRefs: readonly string[] | undefined,
): void {
  if (action.requiresEvidence === true && (!evidenceRefs || evidenceRefs.length === 0)) {
    throw new Error('Evidence is required for this lifecycle action');
  }
}

function assertSignerScope(
  action: LifecycleActionAvailability,
  actorRef: string | undefined,
  signerRefs: ReadonlySet<string>,
): void {
  if (action.signerOnly !== true || signerRefs.size === 0) return;
  if (!actorRef || !signerRefs.has(actorRef)) {
    throw new Error('Only signers can add a dispute note to this record');
  }
}

function assertPartyScope(
  action: LifecycleActionAvailability,
  request: { readonly partyScope?: 'any-party' | 'all-parties-must-agree'; readonly allPartiesApproved?: boolean },
): void {
  const scope = request.partyScope ?? action.partyScope;
  if (scope === 'all-parties-must-agree' && request.allPartiesApproved !== true) {
    throw new Error('All parties must approve withdrawal before it can be submitted');
  }
}

function assertRescissionPolicy(
  action: LifecycleActionAvailability,
  rescissionRequested: boolean | undefined,
): void {
  if (rescissionRequested !== true) return;
  if (
    action.postDeterminationIntent !== 'rescission-requested' ||
    action.requiresIssuerAcceptance !== true
  ) {
    throw new Error('Post-determination withdrawal review is not available for this record');
  }
}

function introducesNewField(fields: readonly LifecycleChangedField[]): boolean {
  return fields.some(
    (field) => field.originalValue === undefined && field.correctedValue !== undefined,
  );
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
