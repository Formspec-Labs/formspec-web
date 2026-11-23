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
import { autoPlacedDefinitionActions, createFormEngine, isFormspecEngineInitialized, isPlainJsonArray, isPlainJsonObject, isValidDefinitionResponseActionsDocument, resolveResponseAction, } from '@formspec-org/engine';
import { extractBreakpointEntries, matchBreakpoint, planDefinitionLayout, } from '@formspec-org/layout';
import { surfaceDiagnostic } from './diagnostics.js';
import { routeHref, routeInSurface, } from './composition.js';
import { resolveSurfaceStrings } from './strings.js';
import { generationNeedAnchors } from './need-trace.js';
export function ownDataPropertyValue(obj, key) {
    if (!isPlainJsonObject(obj))
        return { present: false, value: undefined };
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) {
        return { present: false, value: undefined };
    }
    return { present: true, value: descriptor.value };
}
export function isStrictPlainRecord(obj) {
    if (!isPlainJsonObject(obj))
        return false;
    for (const key of Object.getOwnPropertyNames(obj)) {
        const descriptor = Object.getOwnPropertyDescriptor(obj, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) {
            return false;
        }
    }
    return true;
}
export function ownPlainActions(document) {
    if (!isStrictPlainRecord(document))
        return [];
    const prop = ownDataPropertyValue(document, 'actions');
    if (!prop.present || !isPlainJsonArray(prop.value))
        return [];
    const actions = [];
    for (let index = 0; index < prop.value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(prop.value, String(index));
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable)
            return [];
        if (!isStrictPlainRecord(descriptor.value))
            return [];
        actions.push(descriptor.value);
    }
    return actions;
}
/**
 * Find the unique strict plain-JSON action matching `actionRef` across loaded
 * Response Actions documents without invoking structural getters or trusting
 * inherited/class/non-plain wrappers. Malformed documents are skipped without
 * throwing so unrelated broken documents cannot abort valid action lookup.
 */
export function findUniquePlainAction(documents, actionRef) {
    const matches = [];
    for (const document of documents) {
        for (const action of ownPlainActions(document)) {
            const idProp = ownDataPropertyValue(action, 'id');
            if (idProp.present && idProp.value === actionRef) {
                matches.push({ document, action });
            }
        }
    }
    return matches.length === 1 ? matches[0] : undefined;
}
function indexTriggers(documents) {
    const byId = new Map();
    const byIntent = new Map();
    for (const document of documents) {
        for (const action of ownPlainActions(document)) {
            const idProp = ownDataPropertyValue(action, 'id');
            const id = idProp.present && typeof idProp.value === 'string' ? idProp.value : undefined;
            if (!id)
                continue;
            byId.set(id, (byId.get(id) ?? 0) + 1);
            const intentProp = ownDataPropertyValue(action, 'intent');
            const intent = intentProp.present && typeof intentProp.value === 'string' ? intentProp.value : undefined;
            if (intent && CLOSED_RESPONSE_ACTION_INTENTS.has(intent)) {
                byIntent.set(intent, [...(byIntent.get(intent) ?? []), id]);
            }
        }
    }
    return { byId, byIntent, documentCount: documents.length };
}
function targetDefinitionUrl(document) {
    if (!isStrictPlainRecord(document))
        return undefined;
    const targetProp = ownDataPropertyValue(document, 'targetDefinition');
    if (!targetProp.present || !isStrictPlainRecord(targetProp.value))
        return undefined;
    const urlProp = ownDataPropertyValue(targetProp.value, 'url');
    return urlProp.present && typeof urlProp.value === 'string' ? urlProp.value : undefined;
}
function isApplicationScoped(document) {
    if (!isStrictPlainRecord(document))
        return false;
    const scopeProp = ownDataPropertyValue(document, 'scope');
    const targetProp = ownDataPropertyValue(document, 'targetDefinition');
    return scopeProp.present && scopeProp.value === 'app' && targetProp.value === undefined;
}
function isDefinitionScoped(document) {
    if (!isStrictPlainRecord(document))
        return false;
    const hasScope = Object.prototype.hasOwnProperty.call(document, 'scope');
    if (hasScope) {
        const scopeProp = ownDataPropertyValue(document, 'scope');
        if (!scopeProp.present || (scopeProp.value !== undefined && scopeProp.value !== 'response')) {
            return false;
        }
    }
    return targetDefinitionUrl(document) !== undefined;
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
 * Collect sorted unique numeric `minWidth` thresholds declared across a route's
 * granted Theme and all `definition-form` Component documents (descending `embed-route`).
 */
export function collectSlotBreakpointThresholds(slots, themeDocument) {
    const thresholds = new Set();
    const themeBreakpoints = themeDocument?.breakpoints;
    for (const [, width] of extractBreakpointEntries(themeBreakpoints, undefined)) {
        thresholds.add(width);
    }
    const walk = (entries) => {
        for (const entry of entries) {
            if (entry.slotType === 'embed-route') {
                walk(entry.slots);
                continue;
            }
            if (entry.slotType !== 'definition-form')
                continue;
            const componentBreakpoints = entry.componentDocument?.breakpoints;
            for (const [, width] of extractBreakpointEntries(themeBreakpoints, componentBreakpoints)) {
                thresholds.add(width);
            }
        }
    };
    walk(slots);
    return [...thresholds].sort((a, b) => a - b);
}
export function slotSuppliedTriggers(slots, responseActions = [], options = {}) {
    const supplied = new Set();
    if (responseActions.length === 0)
        return supplied;
    const actionDeclarations = responseActions.flatMap((document) => ownPlainActions(document).map((action) => ({
        document,
        action,
        id: (() => {
            const prop = ownDataPropertyValue(action, 'id');
            return prop.present && typeof prop.value === 'string' ? prop.value : undefined;
        })(),
    })));
    const walk = (entries, prefix = '') => {
        for (const entry of entries) {
            const slotKey = `${prefix}${entry.slotId}`;
            if (entry.slotType === 'embed-route') {
                // Transitive. The visited set that terminates cycles lives in
                // `planRoute`, so by the time a plan exists this walk is finite.
                walk(entry.slots, `${slotKey}/`);
                continue;
            }
            if (entry.slotType === 'module-widget') {
                if (options.includeWidgetActions === false)
                    continue;
                for (const output of entry.actionOutputs) {
                    if (!output.actionRef)
                        continue;
                    const matches = actionDeclarations.filter(({ id }) => typeof id === 'string' && id === output.actionRef);
                    if (matches.length !== 1)
                        continue;
                    const match = matches[0];
                    if (!match || !output.action)
                        continue;
                    if (!isApplicationScoped(match.document) && (!output.responseContext
                        || output.responseContext.definition.url !== targetDefinitionUrl(match.document)))
                        continue;
                    if (typeof match.id !== 'string')
                        continue;
                    supplied.add(match.id);
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
            const definitionTarget = entry.definition ?? {
                $formspec: '1.0',
                url: entry.definitionRef,
                version: '1.0.0',
                title: '',
                items: [],
            };
            const validationTarget = entry.definition
                ? { url: entry.definitionRef, version: entry.definition.version }
                : { url: entry.definitionRef };
            if (!isValidDefinitionResponseActionsDocument(document, validationTarget)) {
                continue;
            }
            const mountedActionRefs = options.slotRenderedActionRefs?.get(slotKey);
            const slotEngine = options.slotFormEngines?.get(slotKey);
            const actionRefs = mountedActionRefs ?? plannedDefinitionFormActionRefs(definitionTarget, entry.componentDocument, document, {
                ...options,
                ...(slotEngine !== undefined ? { evalEngine: slotEngine } : {}),
            });
            for (const actionRef of actionRefs) {
                if (!resolveResponseAction(document, actionRef).resolved)
                    continue;
                const idMatches = actionDeclarations.filter(({ id }) => typeof id === 'string' && id === actionRef);
                if (idMatches.length !== 1)
                    continue;
                supplied.add(actionRef);
            }
        }
    };
    walk(slots);
    return supplied;
}
function layoutNeedsEngineEvaluation(node) {
    if (typeof node.when === 'string' && node.when.length > 0)
        return true;
    if (node.isRepeatTemplate && node.repeatPath)
        return true;
    if (node.component === 'Accordion' && typeof node.props?.bind === 'string')
        return true;
    if (node.bindPath
        && node.category !== 'field'
        && node.category !== 'display'
        && node.component !== 'ActionButton'
        && node.component !== 'DataTable') {
        return true;
    }
    return node.children.some(layoutNeedsEngineEvaluation);
}
function rewriteRepeatInstance(node, repeatPath, instanceIdx) {
    const templatePrefix = `${repeatPath}[0]`;
    const groupScopePrefix = `${repeatPath}.`;
    const instancePrefix = `${repeatPath}[${instanceIdx}]`;
    function instantiate(path) {
        if (path === templatePrefix || path?.startsWith(`${templatePrefix}.`)) {
            return instancePrefix + path.slice(templatePrefix.length);
        }
        if (path?.startsWith(groupScopePrefix)) {
            return `${instancePrefix}.${path.slice(groupScopePrefix.length)}`;
        }
        return path;
    }
    const bind = typeof node.props?.bind === 'string' ? node.props.bind : undefined;
    const resolvedBind = instantiate(bind);
    const nextBindPath = instantiate(node.bindPath);
    const nextRepeatPath = instantiate(node.repeatPath);
    const nextWhenPrefix = instantiate(node.whenPrefix);
    const { bindPath: _bp, repeatPath: _rp, whenPrefix: _wp, ...rest } = node;
    return {
        ...rest,
        id: `${node.id}-${instanceIdx}`,
        ...(nextBindPath !== undefined ? { bindPath: nextBindPath } : {}),
        ...(nextRepeatPath !== undefined ? { repeatPath: nextRepeatPath } : {}),
        ...(nextWhenPrefix !== undefined ? { whenPrefix: nextWhenPrefix } : {}),
        props: resolvedBind === bind ? node.props : { ...node.props, bind: resolvedBind },
        children: node.children.map((child) => rewriteRepeatInstance(child, repeatPath, instanceIdx)),
    };
}
function collectRenderedActionRefs(node, out, evalEngine, inheritedHiddenVisibility = false) {
    const rawDisplay = typeof node.style?.display === 'string'
        ? node.style.display.trim().toLowerCase()
        : '';
    if (node.props?.hidden === true || rawDisplay === 'none') {
        return;
    }
    const rawVisibility = typeof node.style?.visibility === 'string'
        ? node.style.visibility.trim().toLowerCase()
        : '';
    const hiddenVisibility = rawVisibility === 'hidden' || rawVisibility === 'collapse'
        ? true
        : rawVisibility === 'visible' || rawVisibility === 'initial' || rawVisibility === 'revert'
            ? false
            : inheritedHiddenVisibility;
    const repeatPath = node.isRepeatTemplate && node.repeatPath
        ? node.repeatPath
        : node.component === 'Accordion' && typeof node.props?.bind === 'string'
            ? node.props.bind
            : undefined;
    if (repeatPath) {
        if (!evalEngine)
            return;
        const count = evalEngine.repeats[repeatPath]?.value ?? 0;
        for (let index = 0; index < count; index += 1) {
            for (const child of node.children) {
                collectRenderedActionRefs(rewriteRepeatInstance(child, repeatPath, index), out, evalEngine, hiddenVisibility);
            }
        }
        return;
    }
    if (typeof node.when === 'string' && node.when.length > 0) {
        if (!evalEngine)
            return;
        try {
            if (!evalEngine.compileExpression(node.when, node.whenPrefix ?? '')()) {
                return;
            }
        }
        catch {
            return;
        }
    }
    if (node.bindPath
        && node.category !== 'field'
        && node.category !== 'display'
        && node.component !== 'ActionButton'
        && node.component !== 'DataTable') {
        const relevance = evalEngine?.relevantSignals[node.bindPath];
        if (relevance && !relevance.value) {
            return;
        }
    }
    if (node.component === 'ActionButton') {
        if (!hiddenVisibility) {
            const actionRef = node.props?.actionRef;
            if (typeof actionRef === 'string' && actionRef.length > 0) {
                out.add(actionRef);
            }
        }
        // ActionButton is a leaf widget; it never renders `node.children`.
        return;
    }
    for (const child of node.children) {
        collectRenderedActionRefs(child, out, evalEngine, hiddenVisibility);
    }
}
export function plannedDefinitionFormActionRefs(definition, componentDocument, responseActionsDocument, options = {}) {
    const themeBreakpoints = options.themeDocument?.breakpoints;
    const componentBreakpoints = componentDocument?.breakpoints;
    const activeBreakpoint = options.activeBreakpoint !== undefined
        ? options.activeBreakpoint
        : options.matchesMinWidth
            ? matchBreakpoint(themeBreakpoints, componentBreakpoints, options.matchesMinWidth)
            : null;
    const { root } = planDefinitionLayout({
        definition,
        componentDocument,
        themeDocument: options.themeDocument,
        activeBreakpoint,
        autoPlacedActionRefs: autoPlacedDefinitionActions(responseActionsDocument, definition).map((action) => action.id),
        autoPlaceControls: 'always',
    });
    const refs = new Set();
    let ownedEngine;
    try {
        let evalEngine = options.evalEngine;
        if (!evalEngine && layoutNeedsEngineEvaluation(root) && isFormspecEngineInitialized()) {
            try {
                ownedEngine = createFormEngine(definition);
                evalEngine = ownedEngine;
            }
            catch {
                evalEngine = undefined;
            }
        }
        collectRenderedActionRefs(root, refs, evalEngine);
    }
    finally {
        ownedEngine?.dispose();
    }
    return refs;
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
        if (input.slotSuppliedTriggers?.has(actionId)) {
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
