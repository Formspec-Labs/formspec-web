/**
 * Replace `{param}` placeholders in a component tree node with values from
 * a params object. Walks string properties, arrays, and nested objects
 * recursively. Used during custom component expansion to substitute
 * parameterized values declared in component document templates.
 *
 * @param node   - The component descriptor (or subtree) to mutate in place.
 * @param params - Key/value map of parameter names to replacement values.
 */
export declare function interpolateParams(node: any, params: any): void;
