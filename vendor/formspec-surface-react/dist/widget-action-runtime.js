let invocationSequence = 0;
/** Shell-owned identity. Widgets and executors cannot choose it. */
export function allocateWidgetActionInvocationId() {
    invocationSequence += 1;
    return `surface-widget-${Date.now().toString(36)}-${invocationSequence.toString(36)}`;
}
export function normalizeWidgetActionResult(result) {
    return 'invocation' in result ? result.invocation : result;
}
/**
 * Select the document only when one exact loaded action declaration exists.
 * Repeated ids across or within documents are ambiguous and resolve to none.
 */
export function responseActionsDocumentForAction(documents, actionRef) {
    const matches = documents.flatMap((document) => (document.actions ?? [])
        .filter((action) => action.id === actionRef)
        .map(() => document));
    return matches.length === 1 ? matches[0] : undefined;
}
function keyFor(request) {
    const parts = [
        request.generation,
        request.source.route.surfaceId,
        request.source.route.routeId,
        request.source.slotId,
        request.source.outputName,
        request.invocationId,
    ];
    return parts.map((part) => `${part.length}:${part}`).join('|');
}
/**
 * One in-memory delivery domain, normally one mounted widget slot. Duplicate
 * delivery with the same generation/slot/output/invocation shares a Promise;
 * later duplicates replay the terminal. Different invocation ids remain
 * distinct user emissions.
 */
export function createWidgetActionDelivery() {
    const inFlight = new Map();
    const terminals = new Map();
    return {
        deliver(request) {
            const key = keyFor(request);
            const terminal = terminals.get(key);
            if (terminal)
                return Promise.resolve(terminal);
            const pending = inFlight.get(key);
            if (pending)
                return pending;
            const delivery = (async () => {
                const result = normalizeWidgetActionResult(await request.executor({
                    document: request.document,
                    actionRef: request.actionRef,
                    invocationId: request.invocationId,
                    source: request.source,
                }));
                terminals.set(key, result);
                return result;
            })();
            inFlight.set(key, delivery);
            void delivery.then(() => inFlight.delete(key), () => inFlight.delete(key));
            return delivery;
        },
    };
}
function logicalKey(request) {
    const parts = [
        request.generation,
        request.source.route.surfaceId,
        request.source.route.routeId,
        request.source.slotId,
        request.source.outputName,
        request.actionRef,
    ];
    return parts.map((part) => `${part.length}:${part}`).join('|');
}
function logicalOutcomeKey(request) {
    return {
        generation: request.generation,
        source: request.source,
    };
}
/**
 * Shell-owned logical invocation coordinator.
 *
 * - Two calls for the same generation/slot/output before terminal share one
 *   invocation, executor call and Promise.
 * - A durable outcome returned after remount carries and reuses its original
 *   invocation id.
 * - Once this coordinator has observed a terminal, a later call is a genuinely
 *   new emission and receives a new id even if a simple store still returns its
 *   last recorded terminal.
 */
export function createWidgetActionCoordinator() {
    const delivery = createWidgetActionDelivery();
    const inFlight = new Map();
    const observedDurableIds = new Map();
    return {
        emit(request) {
            const key = logicalKey(request);
            const pending = inFlight.get(key);
            if (pending)
                return { started: false, completion: pending };
            const completion = (async () => {
                const observed = observedDurableIds.get(key) ?? new Set();
                observedDurableIds.set(key, observed);
                const persisted = await request.outcomeStore?.read(logicalOutcomeKey(request));
                if (persisted && !observed.has(persisted.invocationId)) {
                    observed.add(persisted.invocationId);
                    return { ...persisted, replayed: true };
                }
                const invocationId = allocateWidgetActionInvocationId();
                const result = await delivery.deliver({
                    generation: request.generation,
                    document: request.document,
                    actionRef: request.actionRef,
                    invocationId,
                    source: request.source,
                    executor: request.executor,
                });
                observed.add(invocationId);
                await request.outcomeStore?.write(logicalOutcomeKey(request), {
                    invocationId,
                    result,
                });
                return { invocationId, result, replayed: false };
            })();
            inFlight.set(key, completion);
            void completion.then(() => inFlight.delete(key), () => inFlight.delete(key));
            return { started: true, completion };
        },
    };
}
