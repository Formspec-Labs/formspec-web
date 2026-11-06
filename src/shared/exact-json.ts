/** Exact JSON boundaries for mutable host state and operation identities. */
import { canonicalJsonBytes, parseJsonExact } from '@formspec-org/integrity-canonical';
export { cloneJsonValue } from '@formspec-org/engine/render';

/** Canonical identity with JSON's existing undefined-property omission semantics. */
export function canonicalJsonIdentity(value: unknown): string | undefined {
  const text = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new TypeError('JSON numbers must be finite');
    return item;
  });
  return text === undefined ? undefined : new TextDecoder().decode(canonicalJsonBytes(parseJsonExact(text)));
}
