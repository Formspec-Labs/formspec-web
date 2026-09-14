/**
 * @filedesc Transitions — and the decision the surface-render-v10 spike forced.
 *
 * ## The question
 *
 * The spike's `/certify` route declares
 * `transitions: [{trigger: "submit", to: "receipt"}]`. The bundle does carry a
 * Response Actions document, but this route renders only static content and a
 * module widget. Neither loaded artifact declares a control that can invoke the
 * submit action. The transition is authored, schema-valid and signed, yet the
 * route cannot traverse it. The spike hand-built a "Continue" button and
 * recorded it as gap ledger `transition-has-no-trigger-source`, with the
 * question:
 * **does the shell own a default trigger affordance, or must the bundle declare
 * one?**
 *
 * ## The answer: the bundle declares it. The shell does not.
 *
 * This is not a taste call — `surface-spec.md` §4 "Transition trigger semantics"
 * and §5.1 "Runtime Route State Ownership" already answer it, twice:
 *
 * > A router MAY advance a Surface transition **only after** the referenced
 * > action or closed-core intent has completed successfully under Response
 * > Actions authority.
 *
 * > it **MUST NOT infer success from a click**, a rendered button, or a
 * > validation summary.
 *
 * A shell-owned "Continue" button is precisely the prohibited inference: a click
 * standing in for an action that never ran. Shipping one as a default would put
 * a spec violation in every host by construction, and would do it on exactly the
 * routes where it matters — a `submit` transition off an intake route means a
 * submission happened.
 *
 * So this module **plans** transitions and refuses to fire them. Each authored
 * transition resolves to one of {@link TransitionStatus}, and only `fireable`
 * gets an affordance:
 *
 * - the trigger resolves against a loaded Response Actions document (an
 *   `actions[*].id`, or a closed-core intent published by exactly one action —
 *   the same rule `validateSurfaceResponseActionTriggers` enforces at authoring
 *   time, using the same imported intent set), **and**
 * - the host supplied a {@link TransitionExecutor} that can run it under
 *   Response Actions authority.
 *
 * Everything else renders as a stated refusal naming which half is missing. The
 * refusal is the product: a signed bundle describing an app that cannot run is a
 * fact the person on the page, and the author who signed it, should both be able
 * to see.
 *
 * ## What validation catches before runtime
 *
 * Surface lint walks the route graph for reachability (E606). App-graph
 * validation separately emits E611 when a resolved trigger has no
 * validator-readable control source on the route, including one reached through
 * an embed. E611 is a warning because validation cannot see a host executor or
 * private widget behaviour. Runtime planning still fails closed and reports the
 * actual posture.
 */
import { CLOSED_RESPONSE_ACTION_INTENTS } from '@formspec-org/app-graph';
import { surfaceDiagnostic } from './diagnostics.js';
import { routeHref, routeInSurface, } from './composition.js';
import { resolveSurfaceStrings } from './strings.js';
import { generationNeedAnchors } from './need-trace.js';
function indexTriggers(documents) {
    const byId = new Map();
    const byIntent = new Map();
    for (const document of documents) {
        for (const action of document.actions ?? []) {
            const id = typeof action.id === 'string' ? action.id : undefined;
            if (!id)
                continue;
            byId.set(id, (byId.get(id) ?? 0) + 1);
            const intent = typeof action.intent === 'string' ? action.intent : undefined;
            if (intent && CLOSED_RESPONSE_ACTION_INTENTS.has(intent)) {
                byIntent.set(intent, [...(byIntent.get(intent) ?? []), id]);
            }
        }
    }
    return { byId, byIntent, documentCount: documents.length };
}
function targetDefinitionUrl(document) {
    const url = document.targetDefinition?.url;
    return typeof url === 'string' ? url : undefined;
}
function isApplicationScoped(document) {
    return document.scope === 'app' && targetDefinitionUrl(document) === undefined;
}
function isDefinitionScoped(document) {
    return ((document.scope === undefined || document.scope === 'response')
        && targetDefinitionUrl(document) !== undefined);
}
/**
 * The one Response Actions document the form renderer may use for a Definition.
 *
 * Missing and repeated targets both fail closed. Choosing the first document
 * would let `slotSuppliedTriggers` claim one control while the binding renders
 * another, which recreates the silent dead edge this check exists to prevent.
 */
export function responseActionsDocumentForDefinition(documents, definitionRef) {
    const matching = documents.filter((document) => isDefinitionScoped(document)
        && targetDefinitionUrl(document) === definitionRef);
    return matching.length === 1 ? matching[0] : undefined;
}
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
export function slotSuppliedTriggers(slots, responseActions = [], options = {}) {
    const supplied = new Set();
    if (responseActions.length === 0)
        return supplied;
    const actionDeclarations = responseActions.flatMap((document) => (document.actions ?? []).map((action) => ({ document, action })));
    const walk = (entries) => {
        for (const entry of entries) {
            if (entry.slotType === 'embed-route') {
                // Transitive. The visited set that terminates cycles lives in
                // `planRoute`, so by the time a plan exists this walk is finite.
                walk(entry.slots);
                continue;
            }
            if (entry.slotType === 'module-widget') {
                if (options.includeWidgetActions === false)
                    continue;
                for (const output of entry.actionOutputs) {
                    if (!output.actionRef)
                        continue;
                    const matches = actionDeclarations.filter(({ action }) => action.id === output.actionRef);
                    if (matches.length !== 1)
                        continue;
                    const match = matches[0];
                    if (!match || !isApplicationScoped(match.document))
                        continue;
                    const { action } = match;
                    if (typeof action.id !== 'string')
                        continue;
                    supplied.add(action.id);
                    if (typeof action.intent === 'string') {
                        const intentMatches = actionDeclarations.filter(({ action: candidate }) => candidate.intent === action.intent);
                        if (intentMatches.length === 1)
                            supplied.add(action.intent);
                    }
                }
                continue;
            }
            if (entry.slotType !== 'definition-form')
                continue;
            // An unresolved Definition renders an unavailable placeholder, not a
            // form, so it renders no control and supplies no trigger.
            if (entry.status !== 'ready')
                continue;
            const document = responseActionsDocumentForDefinition(responseActions, entry.definitionRef);
            if (!document)
                continue;
            for (const action of document.actions ?? []) {
                if (typeof action.id !== 'string'
                    || action.id.length === 0
                    || !hasLiteralActionLabel(action)) {
                    continue;
                }
                const idMatches = actionDeclarations.filter(({ action: candidate }) => candidate.id === action.id);
                if (idMatches.length !== 1)
                    continue;
                supplied.add(action.id);
                if (typeof action.intent === 'string'
                    && CLOSED_RESPONSE_ACTION_INTENTS.has(action.intent)) {
                    const intentMatches = actionDeclarations.filter(({ action: candidate }) => candidate.intent === action.intent);
                    if (intentMatches.length === 1)
                        supplied.add(action.intent);
                }
            }
        }
    };
    walk(slots);
    return supplied;
}
function hasLiteralActionLabel(action) {
    const label = action.label;
    if (!label || typeof label !== 'object' || Array.isArray(label))
        return false;
    const literal = label.literal;
    return typeof literal === 'string' && literal.trim().length > 0;
}
export function planTransitions(input) {
    const { handle, app } = input;
    const documents = input.responseActions ?? [];
    const resolved = indexTriggers(documents);
    const diagnostics = [];
    const text = typeof input.strings === 'function' ? input.strings : resolveSurfaceStrings(input.strings);
    const transitions = (handle.route.transitions ?? []).map((authored) => {
        const trigger = String(authored.trigger);
        const to = String(authored.to);
        const target = routeInSurface(app, handle.surfaceId, to);
        const base = {
            trigger,
            to,
            needAnchors: generationNeedAnchors(authored),
            reason: '',
        };
        if (typeof authored.when === 'string')
            base.when = authored.when;
        if (authored.params && typeof authored.params === 'object') {
            base.params = Object.freeze({ ...authored.params });
        }
        if (target)
            base.target = target;
        if (typeof authored.when === 'string') {
            let condition;
            let reason;
            try {
                condition = input.evaluateCondition?.({
                    expression: authored.when,
                    transition: { trigger, to, when: authored.when },
                    from: handle,
                    params: input.params ?? {},
                });
            }
            catch (error) {
                reason = error instanceof Error ? error.message : String(error);
            }
            if (condition === false) {
                return {
                    ...base,
                    status: 'condition-false',
                    reason: 'This transition is dormant because its condition is false.',
                };
            }
            if (condition !== true) {
                return {
                    ...base,
                    status: 'condition-unevaluable',
                    reason: 'This transition is unavailable because its condition could not be evaluated.',
                    ...(reason === undefined ? {} : { conditionFailureReason: reason }),
                };
            }
        }
        if (!target) {
            return {
                ...base,
                status: 'unfireable',
                unfireableReason: 'target-unresolved',
                reason: text('transitionTargetUnresolved', { to, trigger }),
            };
        }
        if (routeHref(target, input.params ?? {}).refusal === 'collision') {
            return {
                ...base,
                status: 'unfireable',
                unfireableReason: 'target-path-collision',
                reason: text('transitionTargetCollision', { to, trigger }),
            };
        }
        if (resolved.documentCount === 0) {
            return {
                ...base,
                status: 'unfireable',
                unfireableReason: 'no-response-actions-document',
                reason: text('transitionNoResponseActions', { to, trigger }),
            };
        }
        const idMatches = resolved.byId.get(trigger) ?? 0;
        const publishers = resolved.byIntent.get(trigger) ?? [];
        const actionId = idMatches > 0
            ? idMatches === 1 ? trigger : undefined
            : publishers.length === 1 ? publishers[0] : undefined;
        if (actionId === undefined) {
            return {
                ...base,
                status: 'unfireable',
                unfireableReason: 'trigger-unresolved',
                reason: text(idMatches > 1 || publishers.length > 1
                    ? 'transitionTriggerAmbiguous'
                    : 'transitionTriggerUnresolved', { to, trigger }),
            };
        }
        if (input.slotSuppliedTriggers?.has(trigger)) {
            return {
                ...base,
                actionId,
                status: 'supplied-by-slot',
                reason: text('transitionSuppliedBySlot', { to, trigger }),
            };
        }
        if (!input.hasExecutor) {
            return {
                ...base,
                actionId,
                status: 'unfireable',
                unfireableReason: 'no-executor',
                reason: text('transitionNoExecutor', { to, trigger }),
            };
        }
        return {
            ...base,
            actionId,
            status: 'fireable',
            reason: text('transitionFireable', { to, trigger }),
        };
    });
    for (const transition of transitions) {
        if (transition.status === 'fireable' ||
            transition.status === 'supplied-by-slot' ||
            transition.status === 'condition-false') {
            continue;
        }
        if (transition.status === 'condition-unevaluable') {
            const reason = 'conditionFailureReason' in transition &&
                typeof transition.conditionFailureReason === 'string'
                ? transition.conditionFailureReason
                : undefined;
            diagnostics.push(surfaceDiagnostic('TRANSITION-CONDITION-UNEVALUABLE', `Route "${handle.surfaceId}/${handle.routeId}" declares a condition on its "${transition.trigger}" transition that the host could not evaluate. The transition is unavailable.`, { surfaceId: handle.surfaceId, routeId: handle.routeId }, {
                trigger: transition.trigger,
                to: transition.to,
                when: transition.when,
                ...(reason === undefined ? {} : { reason }),
            }));
            continue;
        }
        diagnostics.push(surfaceDiagnostic('TRANSITION-UNFIREABLE', `Route "${handle.surfaceId}/${handle.routeId}" declares a "${transition.trigger}" transition to "${transition.to}" that nothing can fire (${transition.unfireableReason}).`, { surfaceId: handle.surfaceId, routeId: handle.routeId }, {
            trigger: transition.trigger,
            to: transition.to,
            status: transition.status,
            unfireableReason: transition.unfireableReason,
        }));
    }
    return { transitions, diagnostics };
}
