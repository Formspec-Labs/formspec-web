import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const byteHash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function checkJsonTree(root) {
  const pending = [[root, 0]];
  let count = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (++count > 100_000 || depth > 64) throw new Error('JSON complexity exceeds budget');
    if (typeof value === 'string' && !value.isWellFormed()) throw new Error('invalid Unicode');
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('unsupported numeric precision');
    if (value !== null && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (!key.isWellFormed()) throw new Error('invalid Unicode key');
      pending.push([child, depth + 1]);
    }
  }
}
/** Plain JCS, matching Source canonical_json_hash; no signing/handoff domain. */
export function jsonHash(value) { checkJsonTree(value); return byteHash(canonicalize(value)); }
export function equalJson(left, right) { return jsonHash(left) === jsonHash(right); }
export function atPointer(root, pointer) {
  let value = root;
  for (const part of pointer.slice(1).split('/')) {
    if (/~(?![01])/.test(part)) throw new Error('invalid JSON pointer');
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('selected JSON pointer absent');
    value = value[key];
  }
  return value;
}
