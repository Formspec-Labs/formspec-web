import { type SurfaceDiagnostic } from './diagnostics.js';
import { type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import type { SlotPlan } from './slot-plan.js';
import { type SurfaceStringOverrides, type SurfaceStrings } from './strings.js';
/**
 * The five runtime states pinned by Surface Shell §5.3.
 *
 * Refusal causes do not extend this state machine. They live in
 * {@link TransitionUnfireableReason}, so every binding can switch exhaustively
 * over the same five states while still telling the host why an edge is
 * unavailable.
 */
export type TransitionStatus = 'supplied-by-slot' | 'fireable' | 'unfireable' | 'condition-false' | 'condition-unevaluable';
/** Closed reasons for the normative `unfireable` state. */
export type TransitionUnfireableReason = 
/** No Response Actions document is loaded, so no trigger can resolve. */
'no-response-actions-document'
/** A Response Actions document exists and does not publish this trigger. */
 | 'trigger-unresolved'
/** The trigger resolves; no host executor can run it under Response Actions authority. */
 | 'no-executor'
/** `to` names no route in this Surface. */
 | 'target-unresolved'
/** `to` resolves, but its URL is refused because another route claims it. */
 | 'target-path-collision';
interface PlannedTransitionFields {
    trigger: string;
    to: string;
    /**
     * Authored target-route parameter mapping. Keys are parameters declared by
     * the target route; values name allowlisted runtime bindings returned by the
     * completed Response Action.
     */
    params?: Readonly<Record<string, string>>;
    /** Direct authored Need anchors for this rendered transition feature. */
    needAnchors?: readonly string[];
    when?: string;
    /** One sentence a person can read, naming what is missing. */
    reason: string;
    /** Resolved target, when `to` names a route in the same Surface. */
    target?: SurfaceRouteHandle;
    /** The Response Actions action id that would run, when one resolves. */
    actionId?: string;
    /** Exception text from the host evaluator, retained for the diagnostic. */
    conditionFailureReason?: string;
}
/**
 * A planned edge with the normative state separated from its refusal cause.
 * `unfireableReason` is required exactly when `status` is `unfireable`.
 */
export type PlannedTransition = (PlannedTransitionFields & {
    status: Exclude<TransitionStatus, 'unfireable'>;
    unfireableReason?: never;
}) | (PlannedTransitionFields & {
    status: 'unfireable';
    unfireableReason: TransitionUnfireableReason;
});
/**
 * The host's seam to Response Actions. The shell never implements one: firing a
 * transition means running an action with preconditions, validation-tuple
 * selection, effects, idempotency, replay and retry — all of which Response
 * Actions owns and a renderer must not re-derive.
 *
 * Returning `{ advanced: false }` is a legitimate outcome: the action ran and
 * did not succeed. The shell stays put, which is the same rule as never
 * inferring success from the click.
 */
export type TransitionExecutor = (request: {
    transition: PlannedTransition;
    from: SurfaceRouteHandle;
}) => Promise<{
    advanced: boolean;
    reason?: string;
}>;
/**
 * Evaluates a Surface FEL condition against validated bundle state owned by the
 * host. `undefined` means the host could not evaluate the expression.
 */
export type TransitionConditionEvaluator = (request: {
    expression: string;
    transition: {
        trigger: string;
        to: string;
        when: string;
    };
    from: SurfaceRouteHandle;
    params: Readonly<Record<string, string>>;
}) => boolean | undefined;
/** Minimal read of a Response Actions document — the fields a trigger resolves against. */
export interface ResponseActionsDocumentLike {
    /** Explicit application scope is required before a module-widget may invoke an action. */
    scope?: unknown;
    /** The Definition this document binds to. `E611`'s "targeting the Definition that slot binds". */
    targetDefinition?: {
        url?: unknown;
    } | undefined;
    actions?: readonly {
        id?: unknown;
        intent?: unknown;
        label?: unknown;
        'x-generation'?: unknown;
    }[];
}
export interface TransitionPlanInput {
    handle: SurfaceRouteHandle;
    app: SurfaceApp;
    responseActions?: readonly ResponseActionsDocumentLike[] | undefined;
    /** Whether the host supplied an executor. The shell never assumes one. */
    hasExecutor: boolean;
    /** Host-owned FEL evaluation over the validated bundle state. */
    evaluateCondition?: TransitionConditionEvaluator | undefined;
    /** Route parameters available to the FEL evaluator. */
    params?: Readonly<Record<string, string>> | undefined;
    /**
     * Triggers a slot on this route already renders a control for. Compute it
     * with {@link slotSuppliedTriggers} rather than by hand — a binding that
     * hardcodes one intent reports every other intent as dead, and one that scans
     * only the route's own `slots[]` reports a working page as dead
     * (surface-shell-spec §5.3).
     */
    slotSuppliedTriggers?: ReadonlySet<string> | undefined;
    /** Host overrides for the shell's own person-facing strings (§3.0). */
    strings?: SurfaceStrings | SurfaceStringOverrides | undefined;
}
export interface TransitionPlanResult {
    transitions: readonly PlannedTransition[];
    diagnostics: readonly SurfaceDiagnostic[];
}
/**
 * The one Response Actions document the form renderer may use for a Definition.
 *
 * Missing and repeated targets both fail closed. Choosing the first document
 * would let `slotSuppliedTriggers` claim one control while the binding renders
 * another, which recreates the silent dead edge this check exists to prevent.
 */
export declare function responseActionsDocumentForDefinition<TDocument extends ResponseActionsDocumentLike>(documents: readonly TDocument[], definitionRef: string): TDocument | undefined;
/**
 * Every trigger a control **already on this route** can raise.
 *
 * `surface-shell-spec.md` §5.3: "Resolving `supplied-by-slot` is a walk, not a
 * lookup." Two halves, and getting either wrong is the same defect —
 * substituting a shortcut for the resolution rule surface-spec §4 already
 * states:
 *
 * 1. **The scan descends `embed-route` transitively.** An embedded route's
 *    slots render on the host route's surface, so a control it renders is a
 *    control the host route renders — the same transitivity §4.4 applies to the
 *    theme grant. A shell that scans only a route's own `slots[]` reports a
 *    working page as dead.
 * 2. **The check follows the controls this binding actually places.**
 *    `FormspecForm` auto-places each uniquely identified Action with a literal
 *    structured label from the one response-scoped document targeting the
 *    rendered Definition. Action ids are always exact; a closed-core intent is
 *    credited only when exactly one loaded Action publishes it.
 *
 * A module widget contributes only through the complete declared chain:
 * Registry action output -> Surface action binding -> exact loaded action.
 * Private widget behaviour and coincident names contribute nothing.
 * `experience-unit` cannot contribute: a Unit's `actionRefs` name actions and
 * do not place controls, and drawing a button from one would derive layout from
 * Experience (experience-spec §1.4.1 prohibition 2).
 */
export declare function slotSuppliedTriggers(slots: readonly SlotPlan<unknown>[], responseActions?: readonly ResponseActionsDocumentLike[], options?: {
    includeWidgetActions?: boolean | undefined;
}): ReadonlySet<string>;
export declare function planTransitions(input: TransitionPlanInput): TransitionPlanResult;
export {};
