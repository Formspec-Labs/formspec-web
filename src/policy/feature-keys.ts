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
 *     required"). SIXTH key — landing fired FW-0080, which consolidated
 *     the `consumes*` boolean ladder on `RouteNarrowing` into a
 *     `consumes: ReadonlySet<RuntimeFeatureKey>` field.
 *
 * Extended at FW-0027 slice 1 (multi-rail payment with atomic submit):
 *   - payment → gated against the new PaymentRailAdapter port (1:1
 *     mapping). IN-FORM consumer (no standalone route) — the runtime
 *     orchestrates authorize → submit → capture-or-void around the
 *     existing submit path when the resolved profile enables the feature.
 *     Form-policy extractor reads `definition.extensions['x-formspec-payment-required']
 *     === true` and declares `'required'` (matching the FW-0033 attachment
 *     shape; payment is a hard blocker, not a graceful enhancement). SEVENTH
 *     key in the closed taxonomy.
 *
 * Extended at FW-0040 slice 1 (embed: form-in-host-page substrate):
 *   - embed → gated against the new EmbedTransport port (1:1 mapping).
 *     IN-FORM consumer (no standalone route) — the runtime detects an
 *     iframe context at form load and verifies the host origin against
 *     `orgRuntimePolicy.limits.embed.allowedOrigins`. Form-policy
 *     extractor reads `definition.extensions['x-formspec-embeddable']
 *     === true` and declares `'optional'` (an embeddable form still
 *     mounts directly on its issuer's URL; declaring `required` would
 *     fail-load every embeddable form when accessed directly). EIGHTH
 *     key in the closed taxonomy. Custom Element wrapper defers to
 *     FW-0053; production transport adapters (postMessage RPC, penpal /
 *     comlink) defer to FW-0102.
 *
 * Extended at FW-0046 slice 1 (pre-flight routing: the screener surface):
 *   - screener → gated against the new ScreenerDocumentSource port
 *     (1:1 mapping). Standalone-route consumer (`/screener?doc={urn}`) —
 *     no form is mounted; the surface loads a Screener Document
 *     (`formspec/specs/screener/screener-spec.md`), renders the upstream
 *     `<FormspecScreener>` (`@formspec-org/react`), shows the
 *     determination's reasoning, and links to the routed form. NINTH key
 *     in the closed taxonomy. Form-policy is synthesized at the route
 *     boundary as `'optional'` (web ADR-0011 §"Non-form surface synthesis"
 *     addendum) — the route itself IS the opt-in; declaring `'required'`
 *     would raise the typed form-load error on instances that don't
 *     publish a screener catalog. Production declares `'unavailable'`
 *     until an adopter wires a real catalog adapter; demo wires
 *     `stubScreenerDocumentSource` seeded with the bundled three-question
 *     fixture.
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
  'payment',
  'embed',
  'screener',
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
