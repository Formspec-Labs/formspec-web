/**
 * RespondentHistorySource port — web ADR-0009 / ADR-0011 / FW-0057.
 *
 * Reads the respondent's backward-looking history (drafts, submissions, signed
 * records) aggregated across multiple senders. The port is the SHAPE of
 * cross-issuer history; the SUBSTRATE — multi-issuer authorization (XS-2
 * client-side token bag per stack-root ADR-0068 D-1 + D-3) — is the adapter's
 * concern. Adopters wiring a real production adapter accept tokens through
 * their own constructor, not through `HistoryQuery`.
 *
 * Separation from `RespondentPlaceSource` (FW-0057 §"Decision on port shape"):
 *   - RespondentPlaceSource models the single-deployment Respondent Library
 *     sidecar (obligations + documents + submissions from one wallet).
 *   - RespondentHistorySource models the cross-deployment cross-issuer
 *     timeline. Its `HistoryEntry` carries a discriminator across draft /
 *     submission / signed-record kinds none of which the place snapshot
 *     models uniformly.
 *
 * Per-kind enriched fields (signed-record `verifiedAt`, draft `lastEditedAt`,
 * submission `statusEvent`) are deferred — adding them now would couple this
 * slice to FW-0034 (record lifecycle) / FW-0009 (verifier surface) work that
 * hasn't shipped. The slice-1 shape is the minimum every kind needs.
 *
 * Conformance contract (enforced by `defineRespondentHistorySourceConformance`):
 *
 * 1. Round-trip — a returned `HistorySnapshot` survives `JSON.stringify` /
 *    `JSON.parse` without loss; `isHistorySnapshot` accepts the result.
 * 2. Closed-set kind taxonomy — every `HistoryEntry.kind` is one of
 *    `'draft' | 'submission' | 'signed-record'`.
 * 3. Per-entry minimum fields — `id`, `kind`, `issuer.name`, `timestamp`,
 *    `title` MUST be present on every entry.
 * 4. Non-array `entries` rejection — adapters reject malformed input.
 * 5. Empty `entries[]` is valid — returns a well-formed snapshot, no throw.
 * 6. `aggregationMode` is the closed string literal `'client-wallet'` per
 *    web ADR-0010 §"server aggregation forbidden."
 */

export type HistoryEntryKind = 'draft' | 'submission' | 'signed-record';

export interface HistoryIssuerRef {
  name: string;
  url?: string;
  identifier?: string;
}

export interface HistoryDefinitionRef {
  url: string;
  version?: string;
}

export interface HistoryEntry {
  id: string;
  kind: HistoryEntryKind;
  issuer: HistoryIssuerRef;
  /**
   * ISO-8601 timestamp. Per-kind semantics: drafts = last edited;
   * submissions = submitted; signed records = signed. The surface
   * sort uses lexical comparison (chronological for ISO-8601).
   */
  timestamp: string;
  /**
   * Short display title (e.g., "Benefits intake", "Q2 tax filing draft").
   * Issuer-supplied display string; rendered as-is with no labelFromToken pass.
   */
  title: string;
  /**
   * Optional applicant-status URN. Set only when the entry's case is
   * reachable from the WOS applicant API; when present, the surface
   * renders a "Track this application" link to /status?case={urn}.
   */
  applicantStatusRef?: string;
  /**
   * Optional opaque receipt URI. Set only for signed-record entries
   * with a published receipt. Slice 1 does NOT render the receipt body
   * — FW-0009 / FW-0010 territory.
   */
  receiptRef?: string;
  /**
   * Optional document refs from the respondent's library. When the array
   * is non-empty, the surface renders a "Documents (N)" line linking to
   * /documents (no per-document deep-link in slice 1).
   */
  documentRefs?: readonly string[];
  /** Optional form definition reference. */
  definitionRef?: HistoryDefinitionRef;
}

export interface HistorySnapshot {
  $formspecRespondentHistory: '1.0';
  /**
   * Closed-set string literal per web ADR-0010 §"server aggregation forbidden."
   * Mirrors the RespondentPlaceSnapshot aggregation-mode constraint.
   */
  aggregationMode: 'client-wallet';
  /** The subject ref the snapshot was assembled for. */
  subjectRef: string;
  entries: readonly HistoryEntry[];
}

export interface HistoryQuery {
  subjectRef?: string;
  /**
   * Optional list of issuer URLs to scope the fan-out (post-XS-2 multi-issuer
   * token bag). Slice 1 stubs ignore this hint; production adapters use it
   * when the respondent narrows the cross-issuer scope explicitly.
   */
  issuerUrls?: readonly string[];
}

export interface RespondentHistorySource {
  readHistory(query: HistoryQuery): Promise<HistorySnapshot>;
}
