/** Bounded opaque durable case selector; no task or permission comes from it. */
export function captureStatusCaseLedgerId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2048 || value.trim() !== value
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new Error('Invalid status case selection');
  const rawId = value.startsWith('urn:wos:') ? value.slice(8) : value;
  if (!rawId || rawId === '.' || rawId === '..') throw new Error('Invalid status case selection');
  encodeURIComponent(value);
  return value;
}
