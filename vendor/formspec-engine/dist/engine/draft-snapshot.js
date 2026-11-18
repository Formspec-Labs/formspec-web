/** Match the Response data tree, where dependent questions share their scalar parent's object. */
export function captureDraftData(items, fieldValue, repeatCount) {
    function capture(items, prefix) {
        const entries = [];
        appendItems(items, prefix, entries);
        return Object.fromEntries(entries);
    }
    function appendItems(items, prefix, into) {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const children = item.children ?? [];
            if (item.type === 'field') {
                const value = fieldValue(path);
                if (value !== undefined)
                    into.push([item.key, value]);
                appendItems(children, path, into);
            }
            else if (item.type === 'group' && item.repeatable) {
                const rows = Array.from({ length: repeatCount(path) }, (_, index) => capture(children, `${path}[${index}]`));
                into.push([item.key, rows]);
            }
            else if (item.type === 'group') {
                const group = capture(children, path);
                if (Object.keys(group).length > 0)
                    into.push([item.key, group]);
            }
        }
    }
    return capture(items, '');
}
