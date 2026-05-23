/**
 * Replace `{param}` placeholders in a component tree node with values from
 * a params object. Walks string properties, arrays, and nested objects
 * recursively. Used during custom component expansion to substitute
 * parameterized values declared in component document templates.
 *
 * @param node   - The component descriptor (or subtree) to mutate in place.
 * @param params - Key/value map of parameter names to replacement values.
 */
export function interpolateParams(node, params) {
    for (const key of Object.keys(node)) {
        if (typeof node[key] === 'string') {
            node[key] = node[key].replace(/\{(\w+)\}/g, (_, param) => {
                return params[param] !== undefined ? params[param] : `{${param}}`;
            });
        }
        else if (Array.isArray(node[key])) {
            for (const child of node[key]) {
                if (typeof child === 'object' && child !== null) {
                    interpolateParams(child, params);
                }
            }
        }
        else if (typeof node[key] === 'object' && node[key] !== null) {
            interpolateParams(node[key], params);
        }
    }
}
