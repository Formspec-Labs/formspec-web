/**
 * DefinitionSource port — web ADR-0009 §MVP port inventory.
 *
 * Conformance invariant: returns a value conforming to
 * `formspec/schemas/definition.schema.json`.
 */

import type { FormDefinition, LocaleDocument } from '@formspec-org/types';

export type { FormDefinition, LocaleDocument } from '@formspec-org/types';

export interface DefinitionSource {
  /**
   * Fetch a Definition by URL + optional version.
   *
   * Reference adapter for the formspec-stack composition fetches over HTTP
   * with CDN-fronted caching (web ADR-0008 §`DefinitionSource`).
   * Other compositions wire static-bundle / CMS / GraphQL adapters.
   */
  getDefinition(url: string, version?: string): Promise<FormDefinition>;

  /**
   * Optional FW-0019 sidecar hook. Sources that fetch a runtime payload MAY
   * return the Locale Documents carried beside the Definition. Legacy
   * definition-only sources omit this method and the runtime falls back to
   * inline Definition strings.
   *
   * Callers pass the same source URL used for `getDefinition`, not the
   * returned canonical `definition.url`, so adapters that resolve server
   * form ids keep locale sidecars attached to the original runtime payload.
   */
  getLocaleDocuments?(url: string, version?: string): Promise<LocaleDocument[]>;
}
