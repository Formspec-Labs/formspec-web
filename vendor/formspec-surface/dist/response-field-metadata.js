/**
 * Capture only Definition paths present in retained Response data, including
 * indexed repeat rows. Copy metadata so subsequent reader changes cannot alter
 * this snapshot. Reader refusals propagate. No evaluation or Locale lookup occurs.
 */
export function captureResponseFieldMetadata(definition, response, reader) {
    const fields = {};
    function walk(items, values, prefix = '') {
        for (const item of items) {
            if (!Object.hasOwn(values, item.key))
                continue;
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const label = reader.label(path);
            if (typeof label !== 'string' || !label)
                throw new Error('response-review-label-unavailable');
            const supplied = item.type === 'field' ? reader.options(path) : [];
            if (supplied === undefined)
                throw new Error('response-review-field-unavailable');
            const options = supplied.map(option => ({ value: option.value, label: option.label }));
            // Define an own data property even for a legitimate Item key such as __proto__.
            Object.defineProperty(fields, path, {
                value: { label, ...(options.length ? { options } : {}) },
                enumerable: true, configurable: true, writable: true,
            });
            if (item.type === 'group' && item.children) {
                const value = values[item.key];
                if (Array.isArray(value)) {
                    value.forEach((row, index) => {
                        if (!row || typeof row !== 'object' || Array.isArray(row)) {
                            throw new Error('response-review-data-invalid');
                        }
                        walk(item.children, row, `${path}[${index}]`);
                    });
                }
                else if (value && typeof value === 'object') {
                    walk(item.children, value, path);
                }
            }
        }
    }
    walk(definition.items, response.data);
    return fields;
}
