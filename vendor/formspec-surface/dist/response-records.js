export const responsePairKey = ({ responseId, responseHash }) => JSON.stringify([responseId, responseHash]);
export function responseDraftKey(scope, response, definition, tools) {
    if (!definition.subject) {
        if (response.subject?.keys !== undefined)
            throw new Error('An implicit filing unit cannot declare subject keys.');
        return { scope, definitionUrl: definition.url };
    }
    const { type, keys, id } = response.subject ?? {};
    if (!type || !keys || type !== definition.subject.type || tools.subjectId(type, keys) !== id) {
        throw new Error('The Response subject does not match its derived filing unit.');
    }
    return { scope, definitionUrl: definition.url, subject: { type, keys, id } };
}
export function responseSelectionRecord(key, responseJson) {
    return { scope: key.scope, responseJson, ...(key.subject === undefined && { implicitSubjectId: 'preview' }) };
}
export function prepareResponseFiling(scope, definitions, responseJson, sample, tools) {
    const response = tools.parseResponse(responseJson);
    const definition = definitions.get(response.definitionUrl);
    if (!definition || response.$formspecResponse !== '1.0' || response.status !== 'completed' || !response.id) {
        throw new Error('A preview filing must be a completed Response for a known Definition.');
    }
    const key = responseDraftKey(scope, response, definition, tools);
    const result = tools.selectResponses([responseSelectionRecord(key, responseJson)], {
        definition: { url: response.definitionUrl }, status: 'completed', cardinality: 'latest',
        subject: [], pin: 'none',
    }, { scope, authorized: true, source: 'catalog', upstreamSubject: definition.subject ?? null, projection: [] });
    const responseHash = result.status === 'available' ? result.records[0]?.responseHash : undefined;
    if (!responseHash)
        throw new Error('The Response cannot be admitted as a filing.');
    return { key, definitionVersion: response.definitionVersion, responseJson, responseId: response.id, responseHash, sample };
}
export function prepareResponseFixtures(scope, definitions, fixtures, tools) {
    const filings = (fixtures.filings ?? []).map(({ responseJson }) => prepareResponseFiling(scope, definitions, responseJson, 'fixture', tools));
    if (new Set(filings.map(filing => filing.responseId)).size !== filings.length) {
        throw new Error('Fixture Response ids must be unique within the profile.');
    }
    const pairs = new Set(filings.map(responsePairKey));
    const decisions = new Map();
    for (const { responseId, responseHash, decision } of fixtures.decisions ?? []) {
        const key = responsePairKey({ responseId, responseHash });
        if (!pairs.has(key) || decisions.has(key))
            throw new Error('A fixture decision must name one unique fixture Response id and hash.');
        decisions.set(key, structuredClone(decision));
    }
    return { filings, decisions };
}
export function selectFilingStatus(key, definition, candidates, decisions, tools) {
    const selection = {
        definition: { url: key.definitionUrl }, status: 'completed', cardinality: 'latest', pin: 'none', whenNone: 'empty',
        subject: Object.keys(key.subject?.keys ?? {}).map(name => ({ key: name, op: 'eq', from: { subject: name } })),
    };
    const context = {
        scope: key.scope, authorized: true, source: 'catalog', upstreamSubject: definition.subject ?? null, projection: [],
        ...(key.subject && { consumerSubject: key.subject.keys }),
    };
    const result = tools.selectResponses(candidates.map(record => responseSelectionRecord(record.key, record.responseJson)), selection, context);
    if (result.status !== 'available')
        return { status: 'unavailable' };
    if (result.none)
        return { status: 'none' };
    const selected = result.records[0];
    if (!selected?.responseHash)
        return { status: 'unavailable' };
    const { responseId, responseHash } = selected;
    const chosen = candidates.find(candidate => candidate.responseId === responseId && candidate.responseHash === responseHash);
    if (!chosen)
        return { status: 'unavailable' };
    const decision = decisions.get(responsePairKey(chosen));
    return {
        status: decision?.status === 'decided' ? decision.review : 'filed',
        receiptRef: responseId, responseHash, sample: chosen.sample,
        review: decision?.status === 'unavailable' ? 'unavailable' : 'available',
        comments: decision?.status === 'decided' ? [...decision.comments] : [],
    };
}
