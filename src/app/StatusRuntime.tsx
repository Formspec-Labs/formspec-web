import { useEffect, useState } from 'react';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type {
  ApplicantAgentSummary,
  ApplicantAiInvolvementSummary,
  ApplicantCaseDetail,
  ApplicantStatusResource,
  ApplicantStatusTimelineEntry,
  ApplicantTaskSummary,
} from '../ports/index.ts';
import {
  InvalidRuntimePolicyError,
  isRuntimePolicyError,
  resolveRuntimeFeatures,
  type DisabledCause,
  type ResolvedRuntimeProfile,
  type RuntimePolicyError,
} from '../policy/index.ts';
import { formatDate, formatDuration, labelFromToken } from './format.ts';
import type { StatusRouteParams } from './status-route.ts';

interface StatusRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: StatusRouteParams;
}

type StatusViewState =
  | { kind: 'loading' }
  | { kind: 'disabled'; cause: DisabledCause | undefined }
  | { kind: 'policy-error'; error: RuntimePolicyError }
  | { kind: 'ready'; detail: ApplicantCaseDetail }
  | { kind: 'ready-reduced'; resource: ApplicantStatusResource }
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
        // form: { status: 'optional' } so the resolver evaluates the
        // instance×org pair against an actual request. Stays OPTIONAL — never
        // 'required' (arch-review F-4) — so an unavailable instance falls off
        // as optional-no-instance rather than raising a typed error. The
        // disabled-cause branches drive the 'Status not shared' copy.
        form: { features: { status: 'optional' } },
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

    void composition.statusReader
      .readStatus({ resourceRef: route.caseUrn })
      .then((resource) => {
        if (cancelled) return;
        if (!resource) {
          setView({ kind: 'not-found' });
          return;
        }
        if (isApplicantCaseDetail(resource)) {
          setView({ kind: 'ready', detail: resource });
          return;
        }
        setView({ kind: 'ready-reduced', resource });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('StatusRuntime: readStatus failed', error);
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
    return <ReducedStatus resource={view.resource} />;
  }

  return <ReadyStatus detail={view.detail} />;
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

function ReducedStatus({ resource }: { resource: ApplicantStatusResource }) {
  const headline = headlineFromResource(resource);
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p>{headline}</p>
      <p className="status-timing__no-aggregate">{NO_AGGREGATE_COPY}</p>
    </section>
  );
}

function ReadyStatus({ detail }: { detail: ApplicantCaseDetail }) {
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
    </section>
  );
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
