/**
 * ScreenerRuntime — standalone /screener pre-flight surface (FW-0046 slice 1).
 *
 * Consumes `composition.screenerDocumentSource` + the upstream
 * `<FormspecScreener>` from `@formspec-org/react`. Does NOT call
 * DefinitionSource, DraftStore, SubmitTransport, IdentityProvider,
 * RespondentPlaceSource, StatusReader, RespondentHistorySource,
 * AttachmentStore, PaymentRailAdapter, OfflineSubmitQueue, or
 * EmbedTransport — pre-flight routing is upstream of every form-bound
 * surface (J-047 "I do not yet know which form I want").
 *
 * Synthesizes `form: { features: { screener: 'optional' } }` at the
 * route boundary per web ADR-0011 §"Non-form surface synthesis"
 * addendum. Stays OPTIONAL — never required — so an instance without a
 * catalog falls off via the disabled-cause branch rather than raising
 * a typed form-load error on a page the respondent navigated to
 * directly.
 *
 * "These questions, these answers, this reasoning" — the J-047 trust
 * load — is rendered by re-invoking `wasmEvaluateScreenerDocument` in
 * the `onRoute` callback so the full `DeterminationRecord` is captured
 * (the upstream hook discards everything except the matched route).
 */

import { useEffect, useMemo, useState } from 'react';
import { FormspecScreener } from '@formspec-org/react';
import { wasmEvaluateScreenerDocument } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { DeterminationRecord, PhaseResult, RouteResult } from '@formspec-org/types';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type { ScreenerDocumentInput } from '../ports/screener-document-source.ts';
import { ScreenerDocumentNotFoundError } from '../ports/screener-document-source.ts';
import {
  InvalidRuntimePolicyError,
  isRuntimePolicyError,
  resolveRuntimeFeatures,
  type DisabledCause,
  type RuntimePolicyError,
} from '../policy/index.ts';
import type { ScreenerRouteParams } from './screener-route.ts';

interface ScreenerRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: ScreenerRouteParams;
}

/**
 * Pinned copy — exported so fixture tests can assert the literal
 * strings without rendering the component (mirrors the
 * HistoryRuntime / DocumentsRuntime / ObligationsRuntime pattern).
 */
export const DEFERRED_CAPABILITY_COPY =
  'Save your answers, sign in to keep them, share a screener result with a caseworker, and screener history are not yet available on this site.';
export const NOT_SHARED_UNAVAILABLE_COPY = 'This site does not offer pre-flight routing.';
export const NOT_SHARED_ORG_FORBIDDEN_COPY = 'This sender does not offer pre-flight routing here.';
export const NO_DOC_PARAM_COPY = 'No screener was requested.';
export const NOT_FOUND_COPY = 'We could not find that pre-flight check.';
export const ADAPTER_ERROR_COPY = 'We could not load the pre-flight check. Try again later.';
/**
 * Surfaced in the routed-determination view (NOT the load surface) — the
 * user is looking AT the answers + reasoning they're about to lose. The
 * deferred-capability blurb covers the broader "save/share/history not
 * shipped" framing; this line names the immediate page-refresh
 * consequence at the moment of risk. PLANNING.md FW-0046 (e) tracks the
 * underlying gap; FW-0111 lifts it.
 */
export const ROUTED_REFRESH_LOSS_COPY =
  'Reloading this page will lose your answers and start over.';
/**
 * Soft-error copy rendered ABOVE the upstream "Continue to the form" CTA
 * when the re-evaluation pass for the reasoning panel throws (M1
 * remediation). Both calls go through the same `wasmEvaluateScreenerDocument`
 * so an upstream success → re-eval failure is rare; when it happens, the
 * J-047 trust load ("show me my reasoning") is partially served by
 * naming the failure honestly rather than silently delivering a
 * degraded UX.
 */
export const RECOMPUTE_FAILED_COPY =
  "We couldn't generate a summary of why this form was chosen. The form below is still the right one based on your answers.";

const engineReady = initFormspecEngine();

type ViewState =
  | { kind: 'loading' }
  | { kind: 'disabled'; cause: DisabledCause | undefined }
  | { kind: 'policy-error'; error: RuntimePolicyError }
  | { kind: 'no-doc' }
  | { kind: 'not-found'; docUrl: string }
  | { kind: 'adapter-error' }
  | {
      kind: 'ready';
      document: ScreenerDocumentInput;
      determination: DeterminationRecord | null;
      routedTo: { target: string; label?: string; external: boolean } | null;
      /**
       * Set when `wasmEvaluateScreenerDocument` throws on the re-eval
       * pass that captures the full `DeterminationRecord` for the
       * reasoning panel (M1 remediation). Asymmetric silent degradation
       * — upstream routing succeeded so we have a `routedTo` but no
       * `determination`. Render the soft-error copy above the upstream
       * CTA to keep J-047's "show me my reasoning" trust load honest.
       */
      recomputeFailed: boolean;
    };

export function ScreenerRuntime({ composition, config: _config, route }: ScreenerRuntimeProps) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setView({ kind: 'loading' });

    try {
      const profile = resolveRuntimeFeatures({
        mode: composition.mode,
        instance: composition.instanceCapabilities,
        org: composition.orgRuntimePolicy,
        // The /screener route IS the user's opt-in to load a screener.
        // Mirror the existing non-form surface synthesis pattern
        // (StatusRuntime / ObligationsRuntime / DocumentsRuntime /
        // HistoryRuntime). Stays OPTIONAL — never required — per
        // ADR-0011 §"Non-form surface synthesis" addendum.
        form: { features: { screener: 'optional' } },
      });
      if (!profile.enabled.has('screener')) {
        const cause = profile.disabled.get('screener')?.cause;
        setView({ kind: 'disabled', cause });
        return () => {
          cancelled = true;
        };
      }
    } catch (error) {
      const wrapped = isRuntimePolicyError(error)
        ? error
        : new InvalidRuntimePolicyError(
            'org',
            `resolveRuntimeFeatures threw: ${error instanceof Error ? error.message : String(error)}`,
          );
      setView({ kind: 'policy-error', error: wrapped });
      return () => {
        cancelled = true;
      };
    }

    if (!route.docUrl) {
      setView({ kind: 'no-doc' });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        await engineReady;
        const document = await composition.screenerDocumentSource.readScreener({
          url: route.docUrl,
        });
        if (cancelled) return;
        setView({
          kind: 'ready',
          document,
          determination: null,
          routedTo: null,
          recomputeFailed: false,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ScreenerDocumentNotFoundError) {
          setView({ kind: 'not-found', docUrl: route.docUrl });
          return;
        }
        console.error('ScreenerRuntime: readScreener failed', error);
        setView({ kind: 'adapter-error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [composition, route.docUrl]);

  if (view.kind === 'loading') {
    return (
      <section className="screener-surface" aria-labelledby="screener-title">
        <h1 id="screener-title">Pre-flight</h1>
        <p role="status">Loading the questions</p>
      </section>
    );
  }

  if (view.kind === 'disabled') {
    return <NotShared cause={view.cause} />;
  }

  if (view.kind === 'policy-error') {
    return <PolicyErrorPage error={view.error} />;
  }

  if (view.kind === 'no-doc') {
    return (
      <section className="screener-surface" aria-labelledby="screener-title">
        <h1 id="screener-title">Pre-flight</h1>
        <p>
          <strong>{NO_DOC_PARAM_COPY}</strong> Open this page from a link that includes
          a pre-flight check, or visit the form directly.
        </p>
      </section>
    );
  }

  if (view.kind === 'not-found') {
    return (
      <section className="screener-surface" aria-labelledby="screener-title">
        <h1 id="screener-title">Pre-flight</h1>
        <p>
          <strong>{NOT_FOUND_COPY}</strong> The link you followed may be out of date.
        </p>
        <p className="support-code">Reference: {view.docUrl}</p>
      </section>
    );
  }

  if (view.kind === 'adapter-error') {
    return (
      <section className="screener-surface" aria-labelledby="screener-title">
        <h1 id="screener-title">Pre-flight</h1>
        <p>{ADAPTER_ERROR_COPY}</p>
      </section>
    );
  }

  return <ReadyScreener view={view} onUpdate={setView} />;
}

interface ReadyView {
  kind: 'ready';
  document: ScreenerDocumentInput;
  determination: DeterminationRecord | null;
  routedTo: { target: string; label?: string; external: boolean } | null;
  recomputeFailed: boolean;
}

function ReadyScreener({
  view,
  onUpdate,
}: {
  view: ReadyView;
  onUpdate: (next: ReadyView) => void;
}) {
  const { document, determination, routedTo, recomputeFailed } = view;

  if (determination && routedTo) {
    return (
      <ReasonedDetermination
        document={document}
        determination={determination}
        routedTo={routedTo}
        onRestart={() =>
          onUpdate({
            kind: 'ready',
            document,
            determination: null,
            routedTo: null,
            recomputeFailed: false,
          })
        }
      />
    );
  }

  // M1 — asymmetric silent degradation guard. If `routedTo` is populated
  // but `determination` is null, the re-eval pass threw while the
  // upstream's initial eval (same WASM call) succeeded. Render an honest
  // soft-error above the upstream CTA rather than dropping the user back
  // into the question list with the answers they just submitted.
  if (recomputeFailed && routedTo) {
    return (
      <RecomputeFailedDetermination
        routedTo={routedTo}
        onRestart={() =>
          onUpdate({
            kind: 'ready',
            document,
            determination: null,
            routedTo: null,
            recomputeFailed: false,
          })
        }
      />
    );
  }

  // The upstream <FormspecScreener> renders its own <h2>{title}</h2> and
  // intro paragraph — re-rendering them at our level would duplicate the
  // copy in the DOM. Wrap with section-level <h1> for landmark
  // navigation, hidden visually but exposed to AT (matches the
  // ObligationsRuntime / DocumentsRuntime accessibility shape).
  return (
    <section className="screener-surface" aria-labelledby="screener-title">
      <h1 id="screener-title" className="visually-hidden">
        {document.title}
      </h1>
      <FormspecScreener
        screenerDocument={document}
        onRoute={(route, routeType, answers) => {
          // Re-run evaluation to capture the full DeterminationRecord —
          // the upstream hook discards everything except the matched
          // route. The "these questions, these answers, this reasoning"
          // panel below is J-047's load-bearing trust signal.
          //
          // Asymmetric degraded mode: if this re-eval throws while the
          // upstream's identical call succeeded (rare — same WASM
          // function), surface a soft-error rather than silently
          // collapsing back to the question list (M1 remediation).
          let recomputed: DeterminationRecord | null = null;
          let recomputeFailed = false;
          try {
            recomputed = wasmEvaluateScreenerDocument(document, answers);
          } catch (error) {
            console.error('ScreenerRuntime: wasmEvaluateScreenerDocument failed', error);
            recomputeFailed = true;
          }
          onUpdate({
            kind: 'ready',
            document,
            determination: recomputed,
            routedTo: {
              target: route.target,
              label: route.label,
              external: routeType === 'external',
            },
            recomputeFailed,
          });
        }}
      />
      <p className="screener-surface__deferred">{DEFERRED_CAPABILITY_COPY}</p>
    </section>
  );
}

function ReasonedDetermination({
  document,
  determination,
  routedTo,
  onRestart,
}: {
  document: ScreenerDocumentInput;
  determination: DeterminationRecord;
  routedTo: { target: string; label?: string; external: boolean };
  onRestart: () => void;
}) {
  const continueHref = formRouteFromTarget(routedTo.target, routedTo.external);

  // "These questions, these answers, this reasoning"
  // Pre-compute the three sections so the JSX stays declarative.
  const answeredItems = useMemo(
    () => itemsWithAnswers(document, determination),
    [document, determination],
  );
  const eliminatedReasons = useMemo(
    () => reasonsForEliminated(determination, document),
    [determination, document],
  );
  const matchedReason = useMemo(
    () => firstMatchedMessage(determination),
    [determination],
  );

  return (
    <section className="screener-surface screener-surface--routed" aria-labelledby="screener-title">
      <h1 id="screener-title">Here is the form for you</h1>

      <div className="screener-determination">
        <h2 className="screener-determination__name">
          {routedTo.label ?? formNameFromTarget(routedTo.target)}
        </h2>

        <section
          className="screener-determination__section"
          aria-labelledby="screener-questions"
        >
          <h3 id="screener-questions">What we asked</h3>
          <dl className="screener-determination__qa">
            {answeredItems.map(({ key, label, displayValue }) => (
              <div key={key} className="screener-determination__qa-row">
                <dt>{label}</dt>
                <dd>{displayValue}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className="screener-determination__section"
          aria-labelledby="screener-reasoning"
        >
          <h3 id="screener-reasoning">Why this form</h3>
          {matchedReason ? (
            <p className="screener-determination__reason">{matchedReason}</p>
          ) : (
            <p className="screener-determination__reason">
              Your answers match this form best.
            </p>
          )}
          {eliminatedReasons.length > 0 ? (
            <details className="screener-determination__alts">
              <summary>How other forms compared</summary>
              <ul>
                {eliminatedReasons.map((item) => (
                  <li key={item.target}>
                    <strong>{item.label ?? formNameFromTarget(item.target)}:</strong>{' '}
                    {item.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>

      <div className="screener-determination__actions">
        <a className="screener-cta" href={continueHref} data-testid="screener-cta">
          Continue to the form
        </a>
        <button
          type="button"
          className="screener-restart"
          onClick={onRestart}
        >
          Answer again
        </button>
      </div>

      {/* H1 — refresh-loss disclosure surfaced in the routed view so the
          user sees it AT the determination they're about to lose. The
          generic deferred-capability blurb below covers the broader
          save/share/history gap; this line is page-refresh-specific. */}
      <p className="screener-surface__refresh-loss" data-testid="screener-refresh-loss">
        {ROUTED_REFRESH_LOSS_COPY}
      </p>
      <p className="screener-surface__deferred">{DEFERRED_CAPABILITY_COPY}</p>
    </section>
  );
}

function RecomputeFailedDetermination({
  routedTo,
  onRestart,
}: {
  routedTo: { target: string; label?: string; external: boolean };
  onRestart: () => void;
}) {
  const continueHref = formRouteFromTarget(routedTo.target, routedTo.external);
  return (
    <section
      className="screener-surface screener-surface--routed"
      aria-labelledby="screener-title"
    >
      <h1 id="screener-title">Here is the form for you</h1>

      <div className="screener-determination">
        <h2 className="screener-determination__name">
          {routedTo.label ?? formNameFromTarget(routedTo.target)}
        </h2>
        <p
          className="screener-determination__recompute-failed"
          data-testid="screener-recompute-failed"
        >
          {RECOMPUTE_FAILED_COPY}
        </p>
      </div>

      <div className="screener-determination__actions">
        <a className="screener-cta" href={continueHref} data-testid="screener-cta">
          Continue to the form
        </a>
        <button
          type="button"
          className="screener-restart"
          onClick={onRestart}
        >
          Answer again
        </button>
      </div>

      <p className="screener-surface__refresh-loss" data-testid="screener-refresh-loss">
        {ROUTED_REFRESH_LOSS_COPY}
      </p>
      <p className="screener-surface__deferred">{DEFERRED_CAPABILITY_COPY}</p>
    </section>
  );
}

function formRouteFromTarget(target: string, external: boolean): string {
  if (external) return target;
  // The local form runtime currently expects a definition URL via
  // the root route; this maps the screener's target into the same
  // "open this form" surface. If the URL is already http(s) we route
  // there; otherwise we encode it as a query param the App can read.
  if (/^https?:/i.test(target)) return target;
  return `/?form=${encodeURIComponent(target)}`;
}

function formNameFromTarget(target: string): string {
  if (!target) return 'the next form';
  const tail = target.split(/[/:]/).filter(Boolean).at(-1);
  return tail ? humanize(tail) : target;
}

function humanize(token: string): string {
  return token
    .replace(/[-_]/g, ' ')
    .replace(/\b(\w)/g, (m) => m.toUpperCase());
}

interface AnsweredItem {
  key: string;
  label: string;
  displayValue: string;
}

function itemsWithAnswers(
  document: ScreenerDocumentInput,
  determination: DeterminationRecord,
): AnsweredItem[] {
  const out: AnsweredItem[] = [];
  for (const item of document.items) {
    if (!('key' in item) || typeof item.key !== 'string') continue;
    const input = determination.inputs[item.key];
    if (!input || input.state === 'not-presented') continue;
    const itemShape = item as ItemShape;
    out.push({
      key: item.key,
      label: itemLabel(itemShape),
      displayValue: displayInputValue(itemShape, input),
    });
  }
  return out;
}

interface ItemShape {
  key: string;
  label?: string;
  dataType?: string;
  options?: Array<{ value?: unknown; label?: string }>;
  currency?: string;
}

function itemLabel(item: ItemShape): string {
  return item.label && item.label.length > 0 ? item.label : humanize(item.key);
}

function displayInputValue(
  item: ItemShape,
  input: { value?: unknown; state: 'answered' | 'declined' | 'not-presented' },
): string {
  if (input.state === 'declined') return 'Declined to answer';
  const value = input.value;
  if (value === null || value === undefined) return '—';
  if (item.dataType === 'choice' && Array.isArray(item.options)) {
    const match = item.options.find((option) => option.value === value);
    if (match?.label) return match.label;
  }
  if (item.dataType === 'boolean') return value === true ? 'Yes' : 'No';
  if (item.dataType === 'money' && typeof value === 'object' && value !== null) {
    const money = value as { amount?: number; currency?: string };
    if (typeof money.amount === 'number') {
      // USD fallback for demo only; production catalog adapters declare
      // currency per-money-item (FW-0109).
      const currency = money.currency ?? item.currency ?? 'USD';
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          maximumFractionDigits: 2,
        }).format(money.amount);
      } catch {
        return `${currency} ${money.amount}`;
      }
    }
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

interface EliminatedReason {
  target: string;
  label?: string;
  message: string;
}

function reasonsForEliminated(
  determination: DeterminationRecord,
  _document: ScreenerDocumentInput,
): EliminatedReason[] {
  const out: EliminatedReason[] = [];
  for (const phase of determination.phases) {
    for (const route of phase.eliminated) {
      out.push({
        target: route.target,
        label: route.label,
        message: reasonText(route),
      });
    }
  }
  return out;
}

function reasonText(route: RouteResult): string {
  if (route.message) return route.message;
  switch (route.reason) {
    case 'condition-false':
      return 'Your answers do not match this form.';
    case 'below-threshold':
      return 'Your answers are below the score threshold for this form.';
    case 'max-exceeded':
      return 'This form is restricted to a different applicant profile.';
    case 'null-score':
      return 'We could not score this form against your answers.';
    default:
      return 'This form was not selected.';
  }
}

function firstMatchedMessage(determination: DeterminationRecord): string | null {
  const matched: RouteResult | undefined =
    determination.overrides?.matched?.[0]
    ?? determination.phases.flatMap((p: PhaseResult) => p.matched)[0];
  if (!matched) return null;
  return matched.message ?? null;
}

function NotShared({ cause }: { cause: DisabledCause | undefined }) {
  const detail =
    cause === 'org-forbidden' || cause === 'form-forbidden'
      ? NOT_SHARED_ORG_FORBIDDEN_COPY
      : NOT_SHARED_UNAVAILABLE_COPY;
  return (
    <section className="screener-surface" aria-labelledby="screener-title">
      <h1 id="screener-title">Pre-flight</h1>
      <p>
        <strong>Pre-flight routing is not available.</strong> {detail}
      </p>
    </section>
  );
}

function PolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <section className="screener-surface" aria-labelledby="screener-title">
      <h1 id="screener-title">Pre-flight</h1>
      <p>
        This site's pre-flight check is not configured correctly. Contact the
        sender, or try again later.
      </p>
      <p className="support-code">Support reference: {error.code}</p>
    </section>
  );
}
