import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { requireWireJson, freezeWireJson } from './wire-json.ts';
import schema from './source-schemas/evaluation-hydration.schema.json';
import compositionSchema from './source-schemas/evaluation-composition.schema.json';
import compositionV2Schema from './source-schemas/evaluation-composition-v2.schema.json';
import compositionV4Schema from './source-schemas/evaluation-composition-v4.schema.json';
import compositionV5Schema from './source-schemas/evaluation-composition-v5.schema.json';
import type { CanonicalEvaluationHydrationWire, EvaluationHydrationWire } from '../../ports/evaluation-hydration.ts';

// Pinned canonical Source schemas; no coercion, defaults or field removal.
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv);
// The hydration schema references all four closed receipt families (v1, v2, v4, v5).
for (const dependency of [compositionSchema, compositionV2Schema, compositionV4Schema, compositionV5Schema]) {
  ajv.addSchema(dependency);
}
const validateCanonical = ajv.compile<CanonicalEvaluationHydrationWire>(schema);
// Composition roots also admit receipts/resolutions, so select only Hydration.
const validateComposition = ajv.compile<EvaluationHydrationWire>({
  $ref: `${compositionSchema.$id}#/$defs/Hydration`,
});

/** Decode shape only; the authenticated adapter must separately verify all context, digests and clocks. */
export function decodeEvaluationHydrationWire(value: unknown): CanonicalEvaluationHydrationWire {
  requireWireJson(value);
  const detached: unknown = structuredClone(value);
  if (!validateCanonical(detached) && !validateComposition(detached)) throw new Error('Invalid Source evaluation hydration wire shape');
  freezeWireJson(detached);
  return detached;
}
