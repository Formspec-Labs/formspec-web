export async function requireDraftResponsePins(port, input) {
    const result = await port?.selectDefinitionResponses?.(input);
    if (!result || result.status === 'unconfigured')
        return undefined;
    if (result.status === 'resolved' && !result.missingPrerequisite)
        return responseDeliveries(result.outcomes);
    const name = result.status === 'resolved' ? result.missingPrerequisite : undefined;
    throw new Error(name ? `Required response instance "${name}" is unavailable.` : 'The saved draft prerequisites could not be verified.');
}
export function definitionResponseRequests(definition, key, pins, required) {
    return Object.entries(definition.instances ?? {}).flatMap(([name, { response, schema, data }]) => {
        if (!response)
            return [];
        const pin = pins && Object.hasOwn(pins, name) ? pins[name] : undefined;
        // A resumed at-open read must never silently select a replacement.
        if (pins && response.pin === 'at-open' && !pin && !required?.has(name))
            return [];
        return [{
                key: name, kind: 'definition', scope: key.scope, selection: response,
                ...(key.subject && { consumerSubject: key.subject.keys }),
                ...(schema && { projection: Object.keys(schema) }), ...(data !== undefined && { fallback: data }),
                ...(pin && { pin }),
            }];
    });
}
export async function resolveDefinitionReads(selector, requests, signal) {
    if (!selector || !requests.length)
        return {};
    // A transport failure leaves unpinned drafts editable. Sign requires every delivery.
    const results = await selector.select(requests, signal).catch(() => undefined);
    signal.throwIfAborted();
    return responseDeliveries(results, requests.map(({ key }) => key));
}
export function responseDeliveries(results, keys = results?.keys() ?? []) {
    return Object.fromEntries([...keys].flatMap(key => {
        const result = results?.get(key);
        if (result?.status !== 'available')
            return [];
        const { status: _status, newer: _newer, ...delivery } = result;
        return [[key, delivery]];
    }));
}
