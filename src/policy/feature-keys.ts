/**
 * Closed taxonomy of runtime feature keys (web ADR-0011).
 *
 * Seeded with the two post-MVP capabilities that already had ports at FW-0065:
 *   - respondentPlace      → RespondentPlaceSource (web ADR-0010)
 *   - status               → StatusReader (web ADR-0010, FW-0039)
 *
 * Extended at FW-0056 slice 1 (first feature ADR beyond the seeded pair):
 *   - documentPresentation → transitional: gated against the respondent-place
 *     port slot (see feature-port-map.ts) until SC-4 / EXT-18 ratify a real
 *     VP port. FW-0056 §"Decision on runtime feature key" carries the
 *     rationale; FW-0066 row carries the port-promotion follow-on.
 *
 * Extension protocol: every future feature ADR adds its key here and to the
 * Composition's InstanceCapabilities declaration. No string-typed feature keys
 * outside this set — the resolver rejects unknown keys with
 * InvalidRuntimePolicyError so that drift is caught at boot, not at feature-use.
 *
 * Recompute triggers (ADR-0011 §Resolution): the React shell MUST recompute
 * the profile on identity / issuer / locale / form-version change "in a way
 * that affects policy." Identity and form-version triggers always recompute.
 * Locale recompute is conditional: feature ADRs whose policy depends on
 * locale (e.g., jurisdictional safe-address handling) add their key to
 * LOCALE_CONDITIONAL_FEATURE_KEYS. The shell's locale-change handler checks
 * the set before restarting the form-load boundary.
 */
// Append-only ordering. Feature ADRs add their key at the end of the tuple;
// re-sorting alphabetically would silently change the iteration order of the
// resolver loop and the contract of `RUNTIME_FEATURE_KEYS.toEqual(...)` tests.
export const RUNTIME_FEATURE_KEYS = [
  'respondentPlace',
  'status',
  'documentPresentation',
] as const;

export type RuntimeFeatureKey = (typeof RUNTIME_FEATURE_KEYS)[number];

const KNOWN: ReadonlySet<string> = new Set<string>(RUNTIME_FEATURE_KEYS);

export function isRuntimeFeatureKey(value: string): value is RuntimeFeatureKey {
  return KNOWN.has(value);
}

/**
 * Feature keys whose resolved profile depends on the active locale.
 * Empty today; future feature ADRs (e.g., jurisdictional safe-address per
 * FW-0049/0060) add their key here. The shell consults this set to decide
 * whether locale change triggers a profile recompute.
 */
export const LOCALE_CONDITIONAL_FEATURE_KEYS: ReadonlySet<RuntimeFeatureKey> =
  new Set<RuntimeFeatureKey>();

export function isLocaleConditionalFeatureKey(
  value: string,
): value is RuntimeFeatureKey {
  return isRuntimeFeatureKey(value) && LOCALE_CONDITIONAL_FEATURE_KEYS.has(value);
}

export function anyEnabledFeatureIsLocaleConditional(
  enabled: ReadonlySet<RuntimeFeatureKey>,
): boolean {
  for (const key of enabled) {
    if (LOCALE_CONDITIONAL_FEATURE_KEYS.has(key)) return true;
  }
  return false;
}
