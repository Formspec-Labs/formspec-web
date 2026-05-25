/**
 * ScreenerDocumentSource port — web ADR-0009 / ADR-0011 / FW-0046.
 *
 * Loads a Screener Document by URN. The Screener Document itself is the
 * upstream substrate (per `formspec/specs/screener/screener-spec.md` +
 * `schemas/screener.schema.json`); this port is the SHAPE of "where does
 * the screener catalog live?" — bundled fixtures (demo / single-form
 * deployments), a tenant-side catalog service, a static IPFS-pinned JSON
 * file, an authoring-tool draft preview, etc. Adopters wire one
 * implementation per deployment.
 *
 * The port is read-only: the screener is published by an authoring tool
 * (formspec-studio per `formspec/specs/screener/screener-spec.md`); the
 * respondent-side surface never mutates it.
 *
 * The port is intentionally NOT collapsed into `DefinitionSource`. A
 * Screener Document is structurally distinct from a Form Definition (it
 * routes OUT to multiple definitions; it carries `evaluation` phases +
 * `targetDefinition` instead of `items` + `submission`). Per FW-0046
 * design, conflating the two would force every consumer to handle both
 * shapes — the screener belongs on its own port.
 *
 * Conformance contract (enforced by `defineScreenerDocumentSourceConformance`):
 *
 *   1. Round-trip — a returned `ScreenerDocumentInput` survives JSON
 *      string-parse without loss; `isScreenerDocumentInput` accepts the
 *      result.
 *   2. URN-keyed lookup — given a registered URN, the adapter returns
 *      the matching screener. Unknown URNs throw `ScreenerDocumentNotFoundError`.
 *   3. Closed `$formspecScreener` literal — every returned screener
 *      carries `$formspecScreener === '1.0'`.
 *   4. Required-fields guard — the adapter rejects fixtures missing
 *      `url`, `version`, `title`, `items`, or `evaluation`.
 *
 * Adopters who load screeners from a network catalog (fetch, GraphQL,
 * trellis bundle) accept transport handles through their own constructor,
 * NOT through `ScreenerDocumentQuery`. The query carries respondent intent
 * (the URN); the adapter owns transport.
 */

import type { ScreenerDocument } from '@formspec-org/types';

/**
 * Author-facing screener document: the canonical {@link ScreenerDocument}
 * from `@formspec-org/types` plus the two optional UI-runtime hints the
 * upstream `<FormspecScreener>` consumer reads (`submitLabel`,
 * `targetDefinition.url`). Mirrors the upstream `ScreenerDocumentInput`
 * shape (`@formspec-org/react/screener/types.ts`) without depending on a
 * subpath the vendored package does not export at runtime.
 *
 * When the upstream `@formspec-org/react` package opens a public subpath
 * export for `./screener` (or hoists `ScreenerDocumentInput` to the root
 * barrel), swap this local mirror for the upstream type per project
 * no-shims discipline.
 */
export type ScreenerDocumentInput = ScreenerDocument & {
  submitLabel?: string;
  targetDefinition?: { url?: string };
};

export interface ScreenerDocumentQuery {
  /** Canonical screener URN per screener-spec §2.2. */
  readonly url: string;
  /**
   * Optional semantic version. Omit to ask the adapter for the latest
   * published revision. Adapters MAY reject the call when ambiguous.
   */
  readonly version?: string;
}

export class ScreenerDocumentNotFoundError extends Error {
  readonly url: string;
  constructor(url: string, message?: string) {
    super(message ?? `Screener document not found: ${url}`);
    this.name = 'ScreenerDocumentNotFoundError';
    this.url = url;
  }
}

export interface ScreenerDocumentSource {
  /**
   * Resolves to the Screener Document for the requested URN.
   *
   * MUST throw `ScreenerDocumentNotFoundError` when the URN is not in the
   * adapter's catalog. MUST throw a plain `Error` (or subclass) for
   * transport / parse / validation failure so the runtime can render an
   * "adapter-error" view distinct from "not found."
   */
  readScreener(query: ScreenerDocumentQuery): Promise<ScreenerDocumentInput>;
}
