import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schemaV4 from './source-schemas/evaluation-composition-v4.schema.json';
import schemaV5 from './source-schemas/evaluation-composition-v5.schema.json';
import type { MixedHydrationWire } from '../../ports/mixed-proof.ts';
import { freezeWireJson, requireWireJson } from './wire-json.ts';
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv); ajv.addSchema(schemaV4); ajv.addSchema(schemaV5);
const validateRegistrationV4 = ajv.compile({ $ref: `${schemaV4.$id}#/$defs/CompositionRegistration` });
const validateRegistrationV5 = ajv.compile({ $ref: `${schemaV5.$id}#/$defs/CompositionRegistration` });
const validateV4 = ajv.compile<MixedHydrationWire>({ $ref: `${schemaV4.$id}#/$defs/Hydration` });
const validateV5 = ajv.compile<MixedHydrationWire>({ $ref: `${schemaV5.$id}#/$defs/Hydration` });
/** Owning shape admission only; every proof decision stays in the selected Source verifier. */
export function decodeMixedHydration(value: unknown): MixedHydrationWire {
  requireWireJson(value); const detached: unknown = structuredClone(value);
  if (!validateV4(detached) && !validateV5(detached)) throw new Error('Invalid Source mixed hydration wire shape');
  freezeWireJson(detached); return detached;
}

/** Selected configuration shape only; original proof admission remains in Source. */
export function assertMixedProofRegistration(value: unknown): void {
  requireWireJson(value);
  const detached: unknown = structuredClone(value);
  if (!validateRegistrationV4(detached) && !validateRegistrationV5(detached)) {
    throw new Error('Invalid Source mixed proof registration shape');
  }
}
