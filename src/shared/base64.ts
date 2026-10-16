/** The one standard-base64 decoder for bytes carried in JSON: canonical text only, bounded before and after decoding. */
export function decodeBase64(encoded: string, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (encoded.length > 4 * Math.ceil(maxBytes / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error('base64 encoding or byte cap mismatch');
  const text = atob(encoded);
  if (!text.length || text.length > maxBytes || btoa(text) !== encoded) throw new Error('decoded byte cap or encoding mismatch');
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return bytes;
}
