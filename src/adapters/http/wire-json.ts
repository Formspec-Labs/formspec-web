/** Reject non-wire values without silently changing opaque data through JSON normalization. */
export function requireWireJson(value: unknown, ancestors = new Set<object>(), depth = 0): void {
  if (depth > 256) throw new Error('Source evaluation hydration JSON nesting exceeds limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Invalid Source evaluation hydration JSON value');
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error('Invalid Source evaluation hydration JSON object');
  }
  ancestors.add(value);
  if (array && Object.keys(value).length !== value.length) throw new Error('Invalid Source evaluation hydration JSON array');
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !property.enumerable || !('value' in property)
      || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) {
      throw new Error('Invalid Source evaluation hydration JSON property');
    }
    requireWireJson(property.value, ancestors, depth + 1);
  }
  ancestors.delete(value);
}
export function freezeWireJson(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeWireJson(child);
    Object.freeze(value);
  }
}
