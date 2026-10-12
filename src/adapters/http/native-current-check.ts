import Ajv2020 from 'ajv/dist/2020.js';
import { snapshotFiniteJson } from '@formspec-org/surface';
import schema from './source-schemas/native-current-check-selector.schema.json';
import type { NativeCurrentCheck } from '../../ports/screener-retention.ts';
const validate = new Ajv2020({ strict: false, strictNumbers: true }).compile<NativeCurrentCheck>(schema);
/** Owning Source schema only; a valid selector supplies no proof authority. */
export function snapshotNativeCurrentCheck(value: unknown): NativeCurrentCheck {
  const selected = snapshotFiniteJson(value);
  if (!validate(selected)) throw new Error('Invalid native selector');
  if (!Number.isSafeInteger(selected.runRevision)) throw new Error('Invalid native selector revision');
  return selected;
}
