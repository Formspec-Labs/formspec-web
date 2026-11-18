/** @filedesc Validate an optional service acceptance timestamp before displaying it. */
import type { FormatDefinition } from 'ajv';
import addFormats from 'ajv-formats';

const dateTime = addFormats.get('date-time') as FormatDefinition<string>;

export function isAcceptanceTime(value: unknown): value is string {
  return typeof value === 'string' && typeof dateTime.validate === 'function'
    && dateTime.validate(value) && Number.isFinite(Date.parse(value));
}
