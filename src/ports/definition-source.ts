/**
 * DefinitionSource port — web ADR-0009 §MVP port inventory.
 *
 * Conformance invariant: returns a value conforming to
 * `formspec/schemas/definition.schema.json`.
 */

import type { FormDefinition } from '@formspec-org/types';

export type { FormDefinition } from '@formspec-org/types';

export interface DefinitionSource {
  /**
   * Fetch a Definition by URL + optional version.
   *
   * Reference adapter for the formspec-stack composition fetches over HTTP
   * with CDN-fronted caching (web ADR-0008 §`DefinitionSource`).
   * Other compositions wire static-bundle / CMS / GraphQL adapters.
   */
  getDefinition(url: string, version?: string): Promise<FormDefinition>;
}
