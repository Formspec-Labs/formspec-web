/** @filedesc Repeat-row subtree clearing and capture of field state and nested repeats. */
/** Remove the selected repeat paths from signal stores and primary data. */
export function clearRepeatIndexedSubtree(options) {
    const stores = [
        options.signals,
        options.relevantSignals,
        options.requiredSignals,
        options.readonlySignals,
        options.errorSignals,
        options.validationResults,
        options.writeSources,
        options.optionSignals,
        options.optionStateSignals,
        options.repeats,
        options.data,
    ];
    for (const store of stores) {
        for (const key of Object.keys(store)) {
            if (options.includesPath(key)) {
                delete store[key];
            }
        }
    }
}
/** Capture paths relative to the row so the same state can be restored at its new index. */
export function snapshotRepeatRow(items, rowPath, readField, getRepeatCount) {
    const snapshot = { fields: [], repeats: [] };
    function visit(items, prefix) {
        for (const item of items) {
            if (item.type === 'display')
                continue;
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const children = item.children ?? [];
            if (item.type === 'group' && item.repeatable) {
                const count = getRepeatCount(`${rowPath}.${path}`);
                snapshot.repeats.push({ path, item, count });
                for (let index = 0; index < count; index += 1) {
                    visit(children, `${path}[${index}]`);
                }
            }
            else {
                if (item.type === 'field')
                    snapshot.fields.push({ path, ...readField(`${rowPath}.${path}`) });
                visit(children, path);
            }
        }
    }
    visit(items, '');
    return snapshot;
}
