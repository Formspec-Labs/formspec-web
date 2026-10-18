import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/** Selects one of a principal's scopes on Source and WOS (ADR 0168 §1.1). */
export const SCOPE_KEY_HEADER = 'x-stack-scope-key';

/**
 * The scope key (ADR 0168 §1.1): 64 lowercase hex digits, the only form of a deployment scope that
 * crosses a boundary. Every adapter sends it as `x-stack-scope-key` and compares Source payload
 * `scope` keys against it. Knowing it grants nothing; the server admits only scopes it serves.
 */
export type ScopeKey = string & { readonly __scopeKey: unique symbol };

/**
 * A scope as names: DNS labels (`[a-z][a-z0-9-]*`, at most 63, ending in a letter or digit). An
 * absent environment is the workspace's unbound scope. The cell is placement, not identity, and is
 * not part of a scope (ADR 0168 §3.1).
 */
export interface ScopeNames {
  readonly tenant: string;
  readonly workspace: string;
  readonly environment?: string;
}

/** The preimage tag; a new formula takes `stack-scope-key-v2`, never this one. */
const SCOPE_KEY_TAG = 'stack-scope-key-v1';
const DNS_LABEL = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Accepts exactly 64 lowercase hex digits: one spelling per key. */
export function parseScopeKey(value: unknown): ScopeKey {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('A scope key is 64 lowercase hex digits');
  }
  return value as ScopeKey;
}

/**
 * `SHA-256(be32(len tag) ‖ tag ‖ be32(len fields) ‖ fields)`, where `fields` frames the tenant, the
 * workspace and the environment each as `be32(len) ‖ utf8`, an unbound environment as `""` (the
 * grammar forbids an empty name, so it cannot collide): Rust `stack_common_scope::ScopeKey`'s
 * formula, pinned here by its golden vectors.
 *
 * For hosts, provisioning and tests that hold a deployment's names. The respondent app is
 * configured with the key itself, so SHA-256 stays out of its first-paint bundle (whose budget
 * `check:bundle-budget` fixes).
 */
export function deriveScopeKey(names: ScopeNames): ScopeKey {
  const { tenant, workspace, environment } = names;
  const named = environment === undefined ? [tenant, workspace] : [tenant, workspace, environment];
  if (!named.every(name => typeof name === 'string' && DNS_LABEL.test(name))) {
    throw new Error('Scope names are DNS labels ([a-z][a-z0-9-]*, at most 63)');
  }
  const fields = concatBytes(...[tenant, workspace, environment ?? ''].map(name => framed(utf8ToBytes(name))));
  return bytesToHex(sha256(concatBytes(framed(utf8ToBytes(SCOPE_KEY_TAG)), framed(fields)))) as ScopeKey;
}

/** True only when the deployment binds a key and a Source payload's `scope` is that key. */
export function selectsScope(key: ScopeKey | undefined, scope: unknown): boolean {
  return key !== undefined && key === scope;
}

/** The selector header for `key`, or none when the deployment binds no scope. */
export function scopeKeyHeaders(key: ScopeKey | undefined): Readonly<Record<string, string>> {
  return key === undefined ? {} : { [SCOPE_KEY_HEADER]: key };
}

function framed(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + bytes.byteLength);
  new DataView(out.buffer).setUint32(0, bytes.byteLength);
  out.set(bytes, 4);
  return out;
}
