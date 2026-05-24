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
  ApplicantTimelineEvent,
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

const NO_AGGREGATE_COPY = 'Timing for similar applications is not yet available on this site.';
const PER_CASE_HEADER = 'Time since each step on your application';

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
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p className="status-surface__subtitle">{detail.summary.title ?? 'Application'}</p>

      <StageStrip current={currentStage} />

      <TimingStrip timeline={detail.statusTimeline} />

      {detail.openTasks.length > 0 ? <NextTasks tasks={detail.openTasks} /> : null}

      {detail.aiInvolvement ? <AiDisclosure involvement={detail.aiInvolvement} /> : null}
    </section>
  );
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
  const latest = timeline.at(-1);
  if (!latest) return 'received';
  return stageFromEvent(latest.event);
}

function stageFromEvent(event: ApplicantTimelineEvent): StageKey {
  switch (event) {
    case 'case-created':
    case 'correspondence-received':
    case 'applicant-task-assigned':
      return 'received';
    case 'applicant-task-submitted':
    case 'correspondence-sent':
      return 'in-review';
    case 'decision-reached':
      return 'issued';
    case 'lifecycle-changed':
      return 'in-review';
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
