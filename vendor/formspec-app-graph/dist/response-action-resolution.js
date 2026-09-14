/** @filedesc Shared Response Actions identity and trigger resolution. */
import { handlesByKind, ownProp, record, recordArray, stringProp, } from './surface-widgets.js';
/**
 * Closed-core intents a Surface transition may use as an action selector.
 */
export const CLOSED_RESPONSE_ACTION_INTENTS = new Set([
    'save-draft',
    'autosave',
    'review',
    'submit',
    'request-evidence',
]);
export function responseActionReferences(handles) {
    const actionIds = new Set();
    const closedIntentActionIds = new Map();
    const actions = [];
    for (const handle of handlesByKind(handles, 'responseActions')) {
        const document = record(handle.document);
        const declaredScope = stringProp(document, 'scope');
        const targetDefinition = stringProp(record(ownProp(document, 'targetDefinition')), 'url');
        const scope = declaredScope === 'app' && targetDefinition === undefined
            ? 'app'
            : (declaredScope === undefined || declaredScope === 'response')
                && targetDefinition !== undefined
                ? 'response'
                : 'invalid';
        for (const [actionIndex, action] of recordArray(ownProp(document, 'actions')).entries()) {
            const id = stringProp(action, 'id');
            if (!id)
                continue;
            actionIds.add(id);
            const intent = stringProp(action, 'intent');
            actions.push({
                id,
                scope,
                ...(intent === undefined ? {} : { intent }),
                ...(targetDefinition === undefined ? {} : { targetDefinition }),
                handle,
                actionIndex,
            });
            if (intent && CLOSED_RESPONSE_ACTION_INTENTS.has(intent)) {
                closedIntentActionIds.set(intent, [
                    ...(closedIntentActionIds.get(intent) ?? []),
                    id,
                ]);
            }
        }
    }
    return { actionIds, closedIntentActionIds, actions };
}
/**
 * Resolve a Surface transition trigger to exact action IDs.
 *
 * A direct id must identify exactly one loaded action. A closed intent must
 * likewise select exactly one loaded action. Ambiguous and unresolved values
 * return undefined so callers never choose by document order.
 */
export function resolvedActionIds(trigger, references) {
    const direct = references.actions.filter((action) => action.id === trigger);
    if (direct.length > 0)
        return direct.length === 1 ? [trigger] : undefined;
    if (!CLOSED_RESPONSE_ACTION_INTENTS.has(trigger))
        return undefined;
    const matches = references.closedIntentActionIds.get(trigger) ?? [];
    return matches.length === 1 ? [matches[0]] : undefined;
}
