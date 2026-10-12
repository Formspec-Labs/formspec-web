import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from './source-schemas/evaluation-composition-v3.schema.json';
import type { MixedHydrationWire } from '../../ports/mixed-proof.ts';
import { freezeWireJson, requireWireJson } from './wire-json.ts';
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv); ajv.addSchema(schema);
const validate = ajv.compile<MixedHydrationWire>({ $ref: `${schema.$id}#/$defs/Hydration` });
/** Owning shape admission only; every proof decision stays in the selected Source verifier. */
export function decodeMixedHydration(value: unknown): MixedHydrationWire {
  requireWireJson(value); const detached: unknown = structuredClone(value);
  if (!validate(detached)) throw new Error('Invalid Source mixed hydration wire shape');
  freezeWireJson(detached); return detached;
}
