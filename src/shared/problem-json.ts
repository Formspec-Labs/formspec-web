import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import errorSchema from '../../vendor/wos-api/error.schema.json';
import type { components } from '../api/generated/wos-public.d.ts';

/**
 * Stack Problem JSON (stack-common `schemas/error.schema.json`), as openapi-typescript generates
 * it from the WOS public document that carries that schema verbatim (ADR 0165 §1.3).
 */
export type ProblemJson = components['schemas']['Problem'];

// Admission compiles the same schema from its pinned copy (vendor/wos-api/provenance.json),
// including its closed error-code prefixes (ADR 0092a).
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validate = ajv.compile<ProblemJson>(errorSchema);

export function isProblemJson(value: unknown): value is ProblemJson {
  return validate(value);
}

export function assertProblemJson(value: unknown): asserts value is ProblemJson {
  if (!isProblemJson(value)) {
    throw new Error('Expected stack-common Problem JSON with required error_code');
  }
}
