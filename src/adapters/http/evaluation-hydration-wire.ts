import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from './source-schemas/evaluation-hydration.schema.json';
import compositionSchema from './source-schemas/evaluation-composition.schema.json';
import type { EvaluationHydrationWire } from '../../ports/evaluation-hydration.ts';

// Exact reviewed Source fcb53448 wire schema; no coercion, defaults or field removal.
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv);
const validateLegacy = ajv.compile<EvaluationHydrationWire>(schema);
// Source snapshot abd650e0: root also admits receipts/resolutions, so select only Hydration.
ajv.addSchema(compositionSchema);
const validateComposition = ajv.compile<EvaluationHydrationWire>({
  $ref: `${compositionSchema.$id}#/$defs/Hydration`,
});

/** Decode shape only; the authenticated adapter must separately verify all context, digests and clocks. */
export function decodeEvaluationHydrationWire(value: unknown): EvaluationHydrationWire {
  requireJson(value);
  const detached: unknown = structuredClone(value);
  if (!validateLegacy(detached) && !validateComposition(detached)) throw new Error('Invalid Source evaluation hydration wire shape');
  freeze(detached);
  return detached;
}

/** Reject non-wire values without silently changing opaque data through JSON normalization. */
function requireJson(value: unknown, ancestors = new Set<object>(), depth = 0): void {
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
    requireJson(property.value, ancestors, depth + 1);
  }
  ancestors.delete(value);
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}
