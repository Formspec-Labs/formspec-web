/**
 * DefinitionSource port — web ADR-0009 §MVP port inventory.
 *
 * Conformance invariant: returns a value conforming to
 * `formspec/schemas/definition.schema.json`.
 */

import type { ComponentGraphProjectionContext, LayoutHostEvidence } from '@formspec-org/layout';
import type { ComponentDocument, FormDefinition, LocaleDocument } from '@formspec-org/types';

export type { ComponentGraphProjectionContext, LayoutHostEvidence } from '@formspec-org/layout';
export type { ComponentDocument, FormDefinition, LocaleDocument } from '@formspec-org/types';

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

  /**
   * Optional Component-document sidecar. Sources that fetch a published
   * runtime payload MAY return the Component Document carried beside the
   * Definition. This does not widen `getDefinition`; callers that need layout
   * graph projection fetch the sidecar explicitly.
   */
  getComponentDocument?(url: string, version?: string): Promise<ComponentDocument | null>;

  /**
   * Optional host-validated Component graph context for inert renderer
   * metadata. The browser treats this as projection input only; route,
   * authorization, and validation authority remain with the host/runtime
   * graph producer.
   */
  getComponentGraphContext?(url: string, version?: string): Promise<ComponentGraphProjectionContext | null>;

  /**
   * Optional host-validated layout evidence. Sources that fetch a published
   * runtime payload MAY return the already host-validated LayoutHostEvidence
   * snapshot carried beside the Definition. Browser runtime code may use this
   * for inert renderer metadata and the ADR 0153 hidden-state consumer gate;
   * validation, route authority, and authorization remain host-owned.
   */
  getLayoutHostEvidence?(url: string, version?: string): Promise<LayoutHostEvidence | null>;
}
