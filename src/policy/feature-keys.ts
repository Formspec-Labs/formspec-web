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
 * Extended at FW-0033 slice 1 (file upload as a primary act):
 *   - fileUpload → gated against the AttachmentStore port (1:1 mapping, no
 *     transitional slot-sharing). First feature key whose form-policy
 *     extractor introspects definition content (looks for any field with
 *     dataType === 'attachment'); FW-0066 trigger pulse #2 for the
 *     FormRuntimePolicyExtractor port promotion.
 *
 * Extended at FW-0057 slice 1 (cross-issuer respondent history):
 *   - crossIssuerHistory → gated against the new RespondentHistorySource
 *     port (1:1 mapping; no transitional slot-sharing, port + key ship
 *     together). Fifth narrowed surface (`/history`) consumes it via the
 *     route-boundary synthesis pattern per ADR-0011 §"Non-form surface
 *     synthesis" addendum. Production posture is `unavailable` until XS-2
 *     (multi-issuer token bag) lands; demo posture is `demo-stub`.
 *
 * Extended at FW-0044 slice 1 (offline-capable form-fill with deferred
 * submit):
 *   - offlineSubmit → gated against the new OfflineSubmitQueue port (1:1
 *     mapping). IN-FORM consumer (no standalone route) — the runtime
 *     detects an offline network at submit time and routes through the
 *     queue when the resolved profile enables the feature; same engine,
 *     same draft path, same idempotency key. Form-policy extractor reads
 *     `definition.extensions['x-formspec-offline-submit'] === true` and
 *     declares `'optional'` (not `'required'`; see design §"Optional, not
 *     required"). SIXTH key — explicit FW-0080 trigger fired (the
 *     `consumes*` boolean ladder on `RouteNarrowing` should consolidate
 *     into a `ReadonlySet<RuntimeFeatureKey>`; see FW-0080 row body).
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
  'fileUpload',
  'crossIssuerHistory',
  'offlineSubmit',
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
