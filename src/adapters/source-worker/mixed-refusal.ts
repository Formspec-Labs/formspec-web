/** Exact Source mixed-proof-browser native byte refusal vocabulary. This is
 * separate from the older worker transport/initial-proof refusal family. */
const codes = new Set([
  'not_initialized', 'invalid_initialization', 'input_limit', 'invalid_json', 'invalid_selection', 'invalid_hydration',
  'invalid_proof_index', 'unsupported_family', 'missing_proof', 'extra_proof', 'invalid_original', 'recursive_original',
  'proof_refused', 'expired', 'unsupported_numeric_domain', 'output_limit', 'internal_failure',
] as const);
export type SourceMixedProofRefusalCode = typeof codes extends Set<infer Code> ? Code : never;
export function isSourceMixedProofRefusalCode(value: unknown): value is SourceMixedProofRefusalCode {
  return typeof value === 'string' && codes.has(value as SourceMixedProofRefusalCode);
}
export class SourceMixedProofRefusalError extends Error {
  readonly code: SourceMixedProofRefusalCode;
  constructor(code: SourceMixedProofRefusalCode) {
    super(code);
    if (!isSourceMixedProofRefusalCode(code)) throw new Error('output');
    this.name = 'SourceMixedProofRefusalError'; this.code = code;
  }
}
/** Refusal is a terminal owning result, never a partially verified success. */
export function throwIfSourceMixedProofRefusal(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const result = value as Record<string, unknown>;
  if (result.status !== 'refused' && !Object.hasOwn(result, 'code')) return;
  if (Object.keys(result).length !== 3 || !['version', 'status', 'code'].every(key => Object.hasOwn(result, key))
    || result.version !== 1 || result.status !== 'refused' || !isSourceMixedProofRefusalCode(result.code)) throw new Error('output');
  throw new SourceMixedProofRefusalError(result.code);
}
