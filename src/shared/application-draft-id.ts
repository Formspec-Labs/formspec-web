/** A bounded opaque Source locator; scoped owner-qualified reads establish authority. */
export function isApplicationDraftId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255
    && value !== '.' && value !== '..' && /^[A-Za-z0-9_.-]+$/.test(value)
    && !/[\s]/.test(value);
}
