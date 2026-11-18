const unavailable = { status: 'unavailable', reason: 'Draft unavailable' };
async function loadDraft(session, definition, request) {
    const { subject } = request.context;
    if (definition.subject && (!subject || subject.type !== definition.subject.type))
        return { status: 'unavailable' };
    return session.readCommitted(definition, definition.subject ? subject : undefined);
}
export async function readSessionDraft(session, definitions, request) {
    const { definitionRef, kind } = request.descriptor.source;
    const definition = definitionRef && definitions.get(definitionRef);
    if (!definition || kind !== 'definition-response')
        return unavailable;
    try {
        const loaded = await loadDraft(session, definition, request);
        if (loaded.status !== 'loaded')
            return unavailable;
        return { status: 'loaded', value: loaded.response.data, recordId: loaded.response.id, revision: loaded.revision, freshness: 'fresh' };
    }
    catch {
        return unavailable;
    }
}
