import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { requireWireJson, freezeWireJson } from './wire-json.ts';
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
  requireWireJson(value);
  const detached: unknown = structuredClone(value);
  if (!validateLegacy(detached) && !validateComposition(detached)) throw new Error('Invalid Source evaluation hydration wire shape');
  freezeWireJson(detached);
  return detached;
}
