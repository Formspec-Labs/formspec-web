import { useEffect, useState, type FormEvent } from 'react';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type {
  ApplicantAgentSummary,
  ApplicantAiInvolvementSummary,
  ApplicantCaseDetail,
  ApplicantStatusResource,
  ApplicantStatusTimelineEntry,
  ApplicantTaskSummary,
  LifecycleActionAvailability,
  LifecycleActionClient,
  LifecycleActionKind,
  LifecycleActionReceipt,
  LifecycleActionSnapshot,
  LifecycleChangedField,
  LifecycleProtectedText,
  LifecycleTimelineEvent,
} from '../ports/index.ts';
import {
  InvalidRuntimePolicyError,
  isRuntimePolicyError,
  resolveRuntimeFeatures,
  type DisabledCause,
  type ResolvedRuntimeProfile,
  type RuntimePolicyError,
} from '../policy/index.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import { formatDate, formatDuration, labelFromToken } from './format.ts';
import type { StatusRouteParams } from './status-route.ts';
import './lifecycle-actions.css';

interface StatusRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: StatusRouteParams;
}

type StatusViewState =
  | { kind: 'loading' }
  | { kind: 'disabled'; cause: DisabledCause | undefined }
  | { kind: 'policy-error'; error: RuntimePolicyError }
  | { kind: 'ready'; detail: ApplicantCaseDetail; lifecycle: LifecycleViewState }
  | { kind: 'ready-reduced'; resource: ApplicantStatusResource; lifecycle: LifecycleViewState }
  | { kind: 'not-found' }
  | { kind: 'adapter-error' };

type LifecycleViewState =
  | { kind: 'disabled'; cause: DisabledCause | undefined }
  | { kind: 'available'; snapshot: LifecycleActionSnapshot }
  | { kind: 'not-found' }
  | { kind: 'adapter-error' };

/**
 * Pinned per-step copy. Exported so a future locale-conditional copy ADR has
 * a single seam to migrate, and so the literal strings can be asserted in
 * fixture-style tests without rendering the component (code-review F-3).
 */
export const NO_AGGREGATE_COPY = 'Timing for similar applications is not yet available on this site.';
export const PER_CASE_HEADER = 'Time since each step on your application';

export function StatusRuntime({ composition, route }: StatusRuntimeProps) {
  const [view, setView] = useState<StatusViewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setView({ kind: 'loading' });

    let profile: ResolvedRuntimeProfile;
    try {
      profile = resolveRuntimeFeatures({
        mode: composition.mode,
        instance: composition.instanceCapabilities,
        org: composition.orgRuntimePolicy,
        // The /status route IS the user's opt-in to view status — synthesize
        // form: { status: 'optional', recordLifecycle: 'optional' } so the
        // resolver evaluates the instance×org pair against actual route
        // requests. Both stay OPTIONAL — never 'required' — so an unavailable
        // instance falls off as optional-no-instance rather than raising a
        // typed error on a non-form surface.
        form: { features: { status: 'optional', recordLifecycle: 'optional' } },
      });
    } catch (error) {
      if (isRuntimePolicyError(error)) {
        setView({ kind: 'policy-error', error });
      } else {
        const wrapped = new InvalidRuntimePolicyError(
          'org',
          `resolveRuntimeFeatures threw: ${error instanceof Error ? error.message : String(error)}`,
        );
        setView({ kind: 'policy-error', error: wrapped });
      }
      return () => {
        cancelled = true;
      };
    }

    if (!profile.enabled.has('status')) {
      const cause = profile.disabled.get('status')?.cause;
      setView({ kind: 'disabled', cause });
      return () => {
        cancelled = true;
      };
    }

    const lifecycleEnabled = profile.enabled.has('recordLifecycle');
    const lifecycleDisabledCause = profile.disabled.get('recordLifecycle')?.cause;

    void Promise.allSettled([
      composition.statusReader.readStatus({ resourceRef: route.caseUrn }),
      lifecycleEnabled
        ? composition.lifecycleActionClient.readLifecycle({ caseUrn: route.caseUrn })
        : Promise.resolve(undefined),
    ])
      .then(([statusResult, lifecycleResult]) => {
        if (cancelled) return;
        if (statusResult.status === 'rejected') {
          console.error('StatusRuntime: readStatus failed', statusResult.reason);
          setView({ kind: 'adapter-error' });
          return;
        }
        const resource = statusResult.value;
        if (!resource) {
          setView({ kind: 'not-found' });
          return;
        }
        const lifecycle = lifecycleStateFromResult({
          enabled: lifecycleEnabled,
          disabledCause: lifecycleDisabledCause,
          result: lifecycleResult,
        });
        if (isApplicantCaseDetail(resource)) {
          setView({ kind: 'ready', detail: resource, lifecycle });
          return;
        }
        setView({ kind: 'ready-reduced', resource, lifecycle });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('StatusRuntime: status load failed', error);
        setView({ kind: 'adapter-error' });
      });

    return () => {
      cancelled = true;
    };
  }, [composition, route.caseUrn]);

  if (view.kind === 'loading') {
    return (
      <section className="status-surface" aria-labelledby="status-title">
        <h1 id="status-title">Your application status</h1>
        <p role="status">Loading status</p>
      </section>
    );
  }

  if (view.kind === 'disabled') {
    return <StatusNotShared cause={view.cause} />;
  }

  if (view.kind === 'policy-error') {
    return <PolicyErrorPage error={view.error} />;
  }

  if (view.kind === 'not-found') {
    return (
      <section className="status-surface" aria-labelledby="status-title">
        <h1 id="status-title">Your application status</h1>
        <p>
          We don't have status for this reference. Check the link, or contact
          the sender.
        </p>
      </section>
    );
  }

  if (view.kind === 'adapter-error') {
    return (
      <section className="status-surface" aria-labelledby="status-title">
        <h1 id="status-title">Your application status</h1>
        <p>We could not load this status. Try again later.</p>
      </section>
    );
  }

  if (view.kind === 'ready-reduced') {
    return (
      <ReducedStatus
        resource={view.resource}
        lifecycle={view.lifecycle}
        lifecycleActionClient={composition.lifecycleActionClient}
        caseUrn={route.caseUrn}
      />
    );
  }

  return (
    <ReadyStatus
      detail={view.detail}
      lifecycle={view.lifecycle}
      lifecycleActionClient={composition.lifecycleActionClient}
      caseUrn={route.caseUrn}
    />
  );
}

function lifecycleStateFromResult({
  enabled,
  disabledCause,
  result,
}: {
  enabled: boolean;
  disabledCause: DisabledCause | undefined;
  result: PromiseSettledResult<LifecycleActionSnapshot | undefined>;
}): LifecycleViewState {
  if (!enabled) {
    return { kind: 'disabled', cause: disabledCause };
  }
  if (result.status === 'rejected') {
    console.error('StatusRuntime: readLifecycle failed', result.reason);
    return { kind: 'adapter-error' };
  }
  if (!result.value) {
    return { kind: 'not-found' };
  }
  return { kind: 'available', snapshot: result.value };
}

function StatusNotShared({ cause }: { cause: DisabledCause | undefined }) {
  const detail =
    cause === 'org-forbidden' || cause === 'form-forbidden'
      ? 'This issuer does not share application status here.'
      : 'This site does not provide application status.';
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p>
        <strong>Status not shared.</strong> {detail}
      </p>
    </section>
  );
}

function PolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p>
        This site's status surface is not configured correctly. Contact the
        sender, or try again later.
      </p>
      <p className="support-code">Support reference: {error.code}</p>
    </section>
  );
}

function ReducedStatus({
  resource,
  lifecycle,
  lifecycleActionClient,
  caseUrn,
}: {
  resource: ApplicantStatusResource;
  lifecycle: LifecycleViewState;
  lifecycleActionClient: LifecycleActionClient;
  caseUrn: string;
}) {
  const headline = headlineFromResource(resource);
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p>{headline}</p>
      <p className="status-timing__no-aggregate">{NO_AGGREGATE_COPY}</p>
      <LifecycleActionsPanel
        state={lifecycle}
        client={lifecycleActionClient}
        caseUrn={caseUrn}
      />
    </section>
  );
}

function ReadyStatus({
  detail,
  lifecycle,
  lifecycleActionClient,
  caseUrn,
}: {
  detail: ApplicantCaseDetail;
  lifecycle: LifecycleViewState;
  lifecycleActionClient: LifecycleActionClient;
  caseUrn: string;
}) {
  const currentStage = currentStageFromTimeline(detail.statusTimeline);
  const lifecycleBadge = lifecycleBadgeFromTimeline(detail.statusTimeline);
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p className="status-surface__subtitle">{detail.summary.title ?? 'Application'}</p>

      {lifecycleBadge ? <LifecycleBadge badge={lifecycleBadge} /> : null}

      <StageStrip current={currentStage} />

      <TimingStrip timeline={detail.statusTimeline} />

      {detail.openTasks.length > 0 ? <NextTasks tasks={detail.openTasks} /> : null}

      {detail.aiInvolvement ? <AiDisclosure involvement={detail.aiInvolvement} /> : null}

      <LifecycleActionsPanel
        state={lifecycle}
        client={lifecycleActionClient}
        caseUrn={caseUrn}
      />
    </section>
  );
}

type LifecycleSubmitState =
  | { status: 'idle' }
  | { status: 'submitting'; action: LifecycleActionKind }
  | { status: 'submitted'; action: LifecycleActionKind; message: string }
  | { status: 'error'; message: string };

function LifecycleActionsPanel({
  state,
  client,
  caseUrn,
}: {
  state: LifecycleViewState;
  client: LifecycleActionClient;
  caseUrn: string;
}) {
  const [lifecycle, setLifecycle] = useState<LifecycleViewState>(state);
  const [activeAction, setActiveAction] = useState<LifecycleActionKind | null>(null);
  const [submitState, setSubmitState] = useState<LifecycleSubmitState>({ status: 'idle' });

  useEffect(() => {
    setLifecycle(state);
    setActiveAction(null);
    setSubmitState({ status: 'idle' });
  }, [state]);

  if (lifecycle.kind === 'disabled') {
    return <LifecycleUnavailable cause={lifecycle.cause} />;
  }
  if (lifecycle.kind === 'adapter-error') {
    return (
      <section className="status-lifecycle-actions" aria-labelledby="status-lifecycle-title">
        <h2 id="status-lifecycle-title">What you can do</h2>
        <p>Lifecycle actions could not be loaded. Try again later.</p>
      </section>
    );
  }
  if (lifecycle.kind === 'not-found') {
    return (
      <section className="status-lifecycle-actions" aria-labelledby="status-lifecycle-title">
        <h2 id="status-lifecycle-title">What you can do</h2>
        <p>Lifecycle actions are not available for this record.</p>
      </section>
    );
  }

  const actionByKind = new Map(
    lifecycle.snapshot.actions.map((action) => [action.action, action]),
  );

  const submit = async (
    action: LifecycleActionKind,
    run: () => Promise<LifecycleActionReceipt>,
  ): Promise<void> => {
    setSubmitState({ status: 'submitting', action });
    try {
      const receipt = await run();
      setLifecycle({ kind: 'available', snapshot: receipt.snapshot });
      setActiveAction(null);
      setSubmitState({
        status: 'submitted',
        action,
        message: messageForLifecycleReceipt(receipt.event),
      });
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Lifecycle action failed.',
      });
    }
  };

  return (
    <section className="status-lifecycle-actions" aria-labelledby="status-lifecycle-title">
      <h2 id="status-lifecycle-title">What you can do</h2>
      <div className="status-lifecycle-actions__buttons" role="group" aria-label="Record actions">
        <LifecycleActionButton
          action={actionByKind.get('correct')}
          label="Correct a fact"
          onClick={() => setActiveAction(activeAction === 'correct' ? null : 'correct')}
        />
        <LifecycleActionButton
          action={actionByKind.get('withdraw')}
          label="Withdraw this submission"
          onClick={() => setActiveAction(activeAction === 'withdraw' ? null : 'withdraw')}
        />
        <LifecycleActionButton
          action={actionByKind.get('dispute')}
          label="Add a dispute note"
          onClick={() => setActiveAction(activeAction === 'dispute' ? null : 'dispute')}
        />
      </div>

      {activeAction === 'correct' ? (
        <CorrectionActionForm
          disabled={submitState.status === 'submitting'}
          onSubmit={(fields, reason) => {
            void submit('correct', () =>
              client.submitCorrection(
                { caseUrn, changedFields: fields, reason },
                generateIdempotencyKey(),
              ),
            );
          }}
        />
      ) : null}
      {activeAction === 'withdraw' ? (
        <WithdrawActionForm
          disabled={submitState.status === 'submitting'}
          onSubmit={(reason, rescissionRequested) => {
            void submit('withdraw', () =>
              client.submitWithdrawal(
                { caseUrn, reason, rescissionRequested },
                generateIdempotencyKey(),
              ),
            );
          }}
        />
      ) : null}
      {activeAction === 'dispute' ? (
        <DisputeActionForm
          disabled={submitState.status === 'submitting'}
          onSubmit={(statement) => {
            void submit('dispute', () =>
              client.submitDispute(
                { caseUrn, statement, disputedEventId: lifecycle.snapshot.events[0]?.eventId },
                generateIdempotencyKey(),
              ),
            );
          }}
        />
      ) : null}

      {submitState.status === 'submitted' ? (
        <p className="status-lifecycle-actions__status" role="status">
          {submitState.message}
        </p>
      ) : null}
      {submitState.status === 'error' ? (
        <p className="status-lifecycle-actions__error" role="alert">
          {submitState.message}
        </p>
      ) : null}

      <LifecycleTimeline events={lifecycle.snapshot.events} />
    </section>
  );
}

function LifecycleUnavailable({ cause }: { cause: DisabledCause | undefined }) {
  const copy =
    cause === 'org-forbidden' || cause === 'form-forbidden'
      ? 'This sender does not allow correction, withdrawal, or dispute here.'
      : 'Correction, withdrawal, and dispute are not available on this site.';
  return (
    <section className="status-lifecycle-actions" aria-labelledby="status-lifecycle-title">
      <h2 id="status-lifecycle-title">What you can do</h2>
      <p>{copy}</p>
    </section>
  );
}

function LifecycleActionButton({
  action,
  label,
  onClick,
}: {
  action: LifecycleActionAvailability | undefined;
  label: string;
  onClick: () => void;
}) {
  const disabled = !action?.enabled || action.window?.state === 'closed';
  return (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

function CorrectionActionForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (fields: readonly LifecycleChangedField[], reason: string) => void;
}) {
  const [fieldList, setFieldList] = useState('');
  const [reason, setReason] = useState('');
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const fields = parseChangedFields(fieldList);
    if (fields.length === 0) return;
    onSubmit(fields, reason);
  };
  return (
    <form className="status-lifecycle-actions__form" onSubmit={handleSubmit}>
      <label>
        Fields to correct
        <input
          value={fieldList}
          required
          placeholder="Household size, mailing address"
          onChange={(event) => setFieldList(event.currentTarget.value)}
        />
      </label>
      <label>
        Reason
        <textarea
          value={reason}
          required
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      <button type="submit" disabled={disabled}>
        Submit correction
      </button>
    </form>
  );
}

function WithdrawActionForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (reason: string, rescissionRequested: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [rescissionRequested, setRescissionRequested] = useState(false);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(reason, rescissionRequested);
  };
  return (
    <form className="status-lifecycle-actions__form" onSubmit={handleSubmit}>
      <label>
        Reason
        <textarea
          value={reason}
          required
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      <label className="status-lifecycle-actions__check">
        <input
          type="checkbox"
          checked={rescissionRequested}
          onChange={(event) => setRescissionRequested(event.currentTarget.checked)}
        />
        Request review of a decision already issued
      </label>
      <button type="submit" disabled={disabled}>
        Withdraw this submission
      </button>
    </form>
  );
}

function DisputeActionForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (statement: string) => void;
}) {
  const [statement, setStatement] = useState('');
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(statement);
  };
  return (
    <form className="status-lifecycle-actions__form" onSubmit={handleSubmit}>
      <label>
        Dispute statement
        <textarea
          value={statement}
          required
          onChange={(event) => setStatement(event.currentTarget.value)}
        />
      </label>
      <button type="submit" disabled={disabled}>
        Add dispute note
      </button>
    </form>
  );
}

function LifecycleTimeline({ events }: { events: readonly LifecycleTimelineEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className="status-lifecycle-timeline" aria-labelledby="status-lifecycle-chain-title">
      <h3 id="status-lifecycle-chain-title">Receipt chain</h3>
      <ol>
        {events.map((event) => (
          <li key={event.eventId}>
            <strong>{lifecycleEventTitle(event)}</strong>
            <span>{formatDate(event.occurredAt)}</span>
            <span>{event.verified ? 'verified' : 'verification pending'}</span>
            <LifecycleEventDetails event={event} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function LifecycleEventDetails({ event }: { event: LifecycleTimelineEvent }) {
  switch (event.kind) {
    case 'original-submission':
      return <p>{event.title}</p>;
    case 'correction':
      return (
        <>
          {event.changedFields.length > 0 ? (
            <p>Fields: {event.changedFields.map((field) => field.label).join(', ')}</p>
          ) : null}
          {event.reason ? <p>Reason: {renderProtectedText(event.reason, 'reason withheld')}</p> : null}
          {event.changedFields.map((field) => (
            <FieldValueLine key={field.path} field={field} />
          ))}
        </>
      );
    case 'withdrawal':
      return (
        <>
          {event.reason ? <p>Reason: {renderProtectedText(event.reason, 'reason withheld')}</p> : null}
          {event.requiresIssuerAcceptance ? (
            <p>Your request has been sent for agency review.</p>
          ) : null}
        </>
      );
    case 'dispute':
      return event.statement ? (
        <p>Statement: {renderProtectedText(event.statement, 'statement withheld')}</p>
      ) : null;
    case 'consent-revocation':
      return event.reason ? (
        <p>Reason: {renderProtectedText(event.reason, 'reason withheld')}</p>
      ) : null;
  }
}

function FieldValueLine({ field }: { field: LifecycleChangedField }) {
  if (!field.originalValue && !field.correctedValue) return null;
  return (
    <p>
      {field.label}:{' '}
      {field.originalValue ? renderProtectedText(field.originalValue, 'value withheld') : 'not shown'}{' '}
      to {field.correctedValue ? renderProtectedText(field.correctedValue, 'value withheld') : 'not shown'}
    </p>
  );
}

function lifecycleEventTitle(event: LifecycleTimelineEvent): string {
  switch (event.kind) {
    case 'original-submission':
      return 'Original submission';
    case 'correction':
      return event.recordedAs === 'amendment' ? 'Amendment opened' : 'Correction recorded';
    case 'withdrawal':
      return event.rescissionRequested ? 'Withdrawal review requested' : 'Submission withdrawn';
    case 'dispute':
      return 'Dispute note added';
    case 'consent-revocation':
      return 'Consent revoked';
  }
}

function messageForLifecycleReceipt(event: LifecycleTimelineEvent): string {
  switch (event.kind) {
    case 'correction':
      return event.recordedAs === 'amendment'
        ? 'Amendment opened on the receipt chain.'
        : 'Correction recorded on the receipt chain.';
    case 'withdrawal':
      return event.requiresIssuerAcceptance
        ? 'Withdrawal request sent for agency review.'
        : 'Submission withdrawn on the receipt chain.';
    case 'dispute':
      return 'Dispute note added to the receipt chain.';
    case 'consent-revocation':
      return 'Consent revocation recorded on the receipt chain.';
    case 'original-submission':
      return 'Lifecycle event recorded.';
  }
}

function renderProtectedText(value: LifecycleProtectedText, withheldCopy: string): string {
  return value.accessClass?.startsWith('safe-') ? withheldCopy : value.text;
}

function parseChangedFields(value: string): readonly LifecycleChangedField[] {
  return value
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .map((label) => ({
      label,
      path: fieldPathFromLabel(label),
    }));
}

function fieldPathFromLabel(label: string): string {
  if (label.startsWith('/')) return label;
  const words = label
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '/field';
  const [first, ...rest] = words;
  return `/${first}${rest.map((word) => word[0].toUpperCase() + word.slice(1)).join('')}`;
}

/**
 * Lifecycle badge shown above the 5-stage strip when the case is in a
 * transient lifecycle state that is orthogonal to pipeline progress.
 *
 * Per WOS kernel spec §"Lifecycle / Status" enum, `suspended` and
 * `migrating` are status values that can occur at any pipeline point —
 * they are NOT additional pipeline stages. The strip keeps showing the
 * stage the case was in (e.g. `in-review`); the badge tells the
 * respondent the case is currently paused or being updated.
 *
 * Vocabulary firewall: WOS internal tokens `suspended` / `migrating`
 * NEVER leak into user-visible prose. Honest plain-language equivalents:
 * - `suspended` → "Paused" (matches the WOS semantic that no events are
 *   processed while suspended — work has stopped pending an external
 *   condition).
 * - `migrating` → "Updating" (matches the WOS semantic that the case is
 *   being moved to a new workflow definition version — from the
 *   respondent's point of view the workflow itself is being updated
 *   beneath their case).
 *
 * Filed from FW-0039 closeout independent architecture review N-2 —
 * before this, `suspended` and `migrating` lifecycle entries fell to the
 * default `in-review` mapping and the respondent was told their paused
 * case was "in review," which is dishonest.
 */
type LifecycleBadgeKind = 'paused' | 'updating';

function LifecycleBadge({ badge }: { badge: LifecycleBadgeKind }) {
  const label = badge === 'paused' ? 'Paused' : 'Updating';
  const detail =
    badge === 'paused'
      ? 'Work on this application has been paused. You will see progress again once it resumes.'
      : 'This application is being updated to a new version of the workflow. Progress will continue once the update finishes.';
  return (
    <p className="status-lifecycle-badge" role="status">
      <strong>{label}.</strong> {detail}
    </p>
  );
}

function lifecycleBadgeFromTimeline(
  timeline: readonly ApplicantStatusTimelineEntry[],
): LifecycleBadgeKind | undefined {
  const latest = timeline.at(-1);
  if (!latest || latest.event !== 'lifecycle-changed') return undefined;
  switch (latest.newLifecycleState) {
    case 'suspended':
      return 'paused';
    case 'migrating':
      return 'updating';
    default:
      return undefined;
  }
}

type StageKey = 'received' | 'in-review' | 'decision-drafted' | 'issued' | 'closed';

const STAGE_ORDER: ReadonlyArray<{ key: StageKey; label: string }> = [
  { key: 'received', label: 'Received' },
  { key: 'in-review', label: 'In review' },
  { key: 'decision-drafted', label: 'Decision drafted' },
  { key: 'issued', label: 'Issued' },
  { key: 'closed', label: 'Closed' },
];

function StageStrip({ current }: { current: StageKey }) {
  return (
    <ol className="status-stage-strip" aria-label="Application stages">
      {STAGE_ORDER.map((stage) => {
        const isCurrent = stage.key === current;
        return (
          <li
            key={stage.key}
            className={
              isCurrent
                ? 'status-stage-strip__cell status-stage-strip__cell--current'
                : 'status-stage-strip__cell'
            }
            aria-current={isCurrent ? 'step' : undefined}
          >
            {stage.label}
          </li>
        );
      })}
    </ol>
  );
}

function TimingStrip({ timeline }: { timeline: readonly ApplicantStatusTimelineEntry[] }) {
  return (
    <section className="status-timing" aria-labelledby="status-timing-title">
      <p className="status-timing__no-aggregate">{NO_AGGREGATE_COPY}</p>
      <h2 id="status-timing-title" className="status-timing__header">
        {PER_CASE_HEADER}
      </h2>
      {timeline.length === 0 ? (
        <p>No timeline events recorded yet.</p>
      ) : (
        <ol className="status-timing__list">
          {timeline.map((entry, index) => {
            const previous = index > 0 ? timeline[index - 1] : undefined;
            const duration = previous
              ? formatDuration(previous.occurredAt, entry.occurredAt)
              : '';
            return (
              <li key={`${entry.event}-${entry.occurredAt}`} className="status-timing__item">
                <strong>{labelFromToken(entry.event)}</strong>
                <span>{formatDate(entry.occurredAt)}</span>
                {entry.summary ? <span>{entry.summary}</span> : null}
                {duration ? <small>+ {duration} since previous step</small> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function NextTasks({ tasks }: { tasks: readonly ApplicantTaskSummary[] }) {
  return (
    <section className="status-next-tasks" aria-labelledby="status-next-tasks-title">
      <h2 id="status-next-tasks-title">What you owe next</h2>
      <ul className="status-next-tasks__list">
        {tasks.map((task) => (
          <li key={task.id} className="status-next-tasks__item">
            <strong>{task.title}</strong>
            {task.deadline ? <span>Due {formatDate(task.deadline)}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AiDisclosure({ involvement }: { involvement: ApplicantAiInvolvementSummary }) {
  // Use a div not an <aside>; <aside> implies the complementary landmark and
  // axe flags landmarks nested inside the section landmark (the status-surface
  // <section> with aria-labelledby creates a region landmark).
  return (
    <div className="status-ai-disclosure" aria-labelledby="status-ai-title">
      <h2 id="status-ai-title">AI participated in this case</h2>
      <ul className="status-ai-disclosure__list">
        {involvement.agentsInvolved.map((agent, index) => (
          <li key={`${agent.displayName}-${index}`}>
            <AgentLine agent={agent} />
          </li>
        ))}
      </ul>
      <p>
        Reviewed by a human: {involvement.humanReviewedAllAgentDecisions ? 'Yes' : 'No'}
      </p>
      {involvement.narrativeRecordCount > 0 ? (
        <p>
          Narrative records on this case: {involvement.narrativeRecordCount}
        </p>
      ) : null}
    </div>
  );
}

function AgentLine({ agent }: { agent: ApplicantAgentSummary }) {
  return (
    <span>
      <strong>{agent.displayName}</strong> — {labelFromToken(agent.roleInDecision)}
    </span>
  );
}

function isApplicantCaseDetail(resource: ApplicantStatusResource): resource is ApplicantCaseDetail {
  return (
    typeof resource === 'object' &&
    resource !== null &&
    'summary' in resource &&
    'openTasks' in resource &&
    'statusTimeline' in resource
  );
}

function currentStageFromTimeline(
  timeline: readonly ApplicantStatusTimelineEntry[],
): StageKey {
  // If the latest entry is a transient lifecycle state (suspended /
  // migrating) the pipeline-stage strip should still reflect the
  // pipeline-stage the case was at before the pause — the LifecycleBadge
  // surface carries the transient-state copy. Walk back to the most recent
  // non-transient timeline entry; fall through to `received` if none found
  // (independent arch-review N-2).
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const entry = timeline[i];
    if (entry === undefined) continue;
    if (
      entry.event === 'lifecycle-changed' &&
      (entry.newLifecycleState === 'suspended' || entry.newLifecycleState === 'migrating')
    ) {
      continue;
    }
    return stageFromEntry(entry);
  }
  return 'received';
}

/**
 * Map a WOS applicant API timeline entry to one of the five public stages.
 * Closed switch over the event enum; `lifecycle-changed` branches on
 * `newLifecycleState` so a `completed` / `terminated` case lights up the
 * `closed` cell rather than getting stuck in `in-review`. Misclassifying the
 * current stage is exactly the kind of dishonesty FW-0039 is meant to avoid
 * (code-review F-4).
 */
function stageFromEntry(entry: ApplicantStatusTimelineEntry): StageKey {
  switch (entry.event) {
    case 'case-created':
    case 'applicant-task-assigned':
      return 'received';
    case 'applicant-task-submitted':
    case 'correspondence-sent':
    case 'correspondence-received':
      return 'in-review';
    case 'decision-reached':
      return 'issued';
    case 'lifecycle-changed':
      switch (entry.newLifecycleState) {
        case 'completed':
        case 'terminated':
          return 'closed';
        default:
          return 'in-review';
      }
    default:
      return 'received';
  }
}

function headlineFromResource(resource: ApplicantStatusResource): string {
  if ('event' in resource && typeof resource.event === 'string') {
    return labelFromToken(resource.event);
  }
  if ('lifecycleState' in resource && typeof resource.lifecycleState === 'string') {
    return labelFromToken(resource.lifecycleState);
  }
  return 'Status received.';
}
