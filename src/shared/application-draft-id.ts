/**
 * Application draft identifiers supported by the Source/WOS boundary.
 * Preserve the supplied value: native DraftService IDs use the draft_ prefix
 * and UUIDv7 simple spelling; existing canonical UUID IDs remain supported.
 */
export function isApplicationDraftId(value: unknown): value is string {
  return typeof value === 'string' && (
    value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    || value.length === 38 && /^draft_[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(value)
  );
}
