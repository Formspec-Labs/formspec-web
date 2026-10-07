export function selectDataSourceRevisions(requests, select) {
    if (!select)
        return { key: '', failures: [] };
    const revisions = [];
    const failures = [];
    for (const request of requests) {
        try {
            const revision = select(request);
            if (revision !== undefined && typeof revision !== 'string'
                && !(typeof revision === 'number' && Number.isFinite(revision))) {
                throw new TypeError('Invalid data source revision');
            }
            revisions.push([typeof revision, revision]);
        }
        catch {
            revisions.push(['invalid', request.descriptor.catalogRef, request.descriptor.sourceRef]);
            failures.push(request);
        }
    }
    return { key: JSON.stringify(revisions), failures };
}
