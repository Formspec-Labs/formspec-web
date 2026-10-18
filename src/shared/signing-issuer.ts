import addFormats from 'ajv-formats';

const uriFormat = addFormats.get('uri');

/** Reuse the canonical schemas' URI format without changing the trusted string. */
export function requireSigningIssuer(value: unknown): string {
  if (typeof value !== 'string' || !value
    || !(typeof uriFormat === 'function' ? uriFormat(value) === true
      : uriFormat instanceof RegExp && uriFormat.test(value))) {
    throw new TypeError('Delegated signing issuer must be an absolute URI');
  }
  return value;
}
