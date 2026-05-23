/** @filedesc Repeat-row subtree clearing and snapshot/restore of nested group field values. */
/** Remove indexed paths under a repeat root from signal stores and `_data` (reactive structure only). */
export function clearRepeatIndexedSubtree(options) {
    const prefix = `${options.rootRepeatPath}[`;
    const stores = [
        options.signals,
        options.relevantSignals,
        options.requiredSignals,
        options.readonlySignals,
        options.errorSignals,
        options.validationResults,
        options.optionSignals,
        options.optionStateSignals,
        options.repeats,
    ];
    for (const store of stores) {
        for (const key of Object.keys(store)) {
            if (key.startsWith(prefix)) {
                delete store[key];
            }
        }
    }
    for (const key of Object.keys(options.data)) {
        if (key.startsWith(prefix)) {
            delete options.data[key];
        }
    }
}
/** Snapshot nested field values under a repeat prefix (used when removing a repeat row). */
export function snapshotRepeatGroupTree(items, prefix, readFieldValue, getRepeatCount) {
    const snapshot = {};
    for (const item of items) {
        const path = `${prefix}.${item.key}`;
        if (item.type === 'field') {
            snapshot[item.key] = readFieldValue(path);
            continue;
        }
        if (item.type === 'group') {
            if (item.repeatable) {
                const count = getRepeatCount(path);
                const rows = [];
                for (let index = 0; index < count; index += 1) {
                    rows.push(snapshotRepeatGroupTree(item.children ?? [], `${path}[${index}]`, readFieldValue, getRepeatCount));
                }
                snapshot[item.key] = rows;
            }
            else {
                snapshot[item.key] = snapshotRepeatGroupTree(item.children ?? [], path, readFieldValue, getRepeatCount);
            }
        }
    }
    return snapshot;
}
/** Restore nested field values after repeat rows were reindexed. */
export function applyRepeatGroupTreeSnapshot(items, prefix, snapshot, writeField) {
    for (const item of items) {
        const path = `${prefix}.${item.key}`;
        if (item.type === 'field') {
            writeField(path, snapshot?.[item.key]);
            continue;
        }
        if (item.type === 'group') {
            if (item.repeatable) {
                const rows = Array.isArray(snapshot?.[item.key]) ? snapshot[item.key] : [];
                for (let index = 0; index < rows.length; index += 1) {
                    applyRepeatGroupTreeSnapshot(item.children ?? [], `${path}[${index}]`, rows[index] ?? {}, writeField);
                }
            }
            else {
                applyRepeatGroupTreeSnapshot(item.children ?? [], path, snapshot?.[item.key], writeField);
            }
        }
    }
}
