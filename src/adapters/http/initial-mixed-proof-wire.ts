import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import compositionSchema from './source-schemas/evaluation-composition-v2.schema.json';
import proofSchema from './source-schemas/evaluation-instance-proof-read-v1.schema.json';
import type { InitialInstanceProof, InitialMixedHydrationWire } from '../../ports/initial-mixed-proof.ts';
import { requireWireJson, freezeWireJson } from './wire-json.ts';

// Exact Source draft schemas; no defaults, coercion, field removal or task fallback.
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv);
ajv.addSchema(compositionSchema);
ajv.addSchema(proofSchema);
const validateHydration = ajv.compile<InitialMixedHydrationWire>({ $ref: `${compositionSchema.$id}#/$defs/Hydration` });
const validateProof = ajv.compile<InitialInstanceProof>({ $ref: `${proofSchema.$id}#/$defs/Response` });

export function decodeInitialMixedHydration(value: unknown): InitialMixedHydrationWire {
  requireWireJson(value);
  const detached: unknown = structuredClone(value);
  if (!validateHydration(detached)) throw new Error('Invalid Source initial mixed hydration wire shape');
  // V2 schemas describe more leaf families than this initial consumer implements.
  if (detached.providerReceipt.contributions.some(({ receipt }) => receipt !== null
    && receipt.kind !== 'nativeScreenerMapping' && receipt.kind !== 'structuredImageMapping')) {
    throw new Error('Unsupported Source initial mixed proof family');
  }
  freezeWireJson(detached);
  return detached;
}

export function decodeInitialInstanceProof(value: unknown): InitialInstanceProof {
  requireWireJson(value);
  const detached: unknown = structuredClone(value);
  if (!validateProof(detached)) throw new Error('Invalid Source initial instance proof wire shape');
  if (detached.request.operation !== 'hydrate') throw new Error('Source initial proof operation mismatch');
  freezeWireJson(detached);
  return detached;
}
