/**
 * @filedesc References sidecar processing: target-Definition matching and per-field reference resolution.
 *
 * Pure References-spec behavior shared by every consumer — the Assist provider
 * (`assist-spec.md` §5.2) and renderers showing human help alike — so it lives
 * at the openly licensed bottom layer rather than inside any one consumer.
 */
import type { Reference, ReferencesDocument } from './generated/references.js';
/** Who a reference is resolved for (`references-spec.md` §2.1 `audience`). */
export type ReferenceAudience = 'human' | 'agent' | 'both';
/** The parts of a References Document that field resolution reads. */
export type ReferenceBindings = Pick<ReferencesDocument, 'references' | 'referenceDefs'>;
/**
 * Whether a sidecar's `targetDefinition` binds to `definition`: the URL is
 * equal and, when both a `compatibleVersions` range and a Definition version
 * are present, the version satisfies one `||` branch of the range.
 */
export declare function targetDefinitionMatches(target: {
    url?: string;
    compatibleVersions?: string;
} | undefined, definition: {
    url: string;
    version?: string;
}): boolean;
/**
 * The `$ref` values in `document` that name no `referenceDefs` entry — a
 * document error processors must report, never skip (`references-spec.md`
 * §4.6.3 rule 2). Empty when every pointer resolves.
 */
export declare function unresolvedReferenceRefs(document: ReferenceBindings): string[];
/**
 * The references that apply to `path` for `audience`, grouped by `type`
 * (`assist-spec.md` §5.2; `references-spec.md` §5.1). Collects bindings that
 * target the exact path, an explicitly walked ancestor (index-stripped and
 * `[*]` forms for repeat paths), or `#` — an explicit walk, not inheritance
 * (`references-spec.md` §4.5). `$ref` bindings resolve with shallow sibling
 * overrides and take the `referenceDefs` key as `id` (§4.6.3 rule 5), so one
 * definition bound to a group and to its child is collected once, not twice —
 * that is one reference reused, not a duplicate id (§2.3). Each group sorts
 * primary → supplementary → background, keeping document order within a tier.
 * Resolved entries drop their `target`.
 *
 * Throws when any binding in any document carries an unresolvable `$ref`: a
 * broken document is an error, not a silently thinner answer.
 */
export declare function resolveFieldReferences(documents: readonly ReferenceBindings[], path: string, audience: ReferenceAudience): Partial<Record<string, Reference[]>>;
