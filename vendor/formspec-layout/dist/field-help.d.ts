/** @filedesc Field-help rule shared by the React and webcomponent renderers — which References qualify, which URIs are admitted. */
/** A human-facing Reference as a renderer needs it (References spec §2.1). */
export interface FieldHelpReference {
    id?: string;
    title: string;
    description?: string;
    content?: string;
    uri?: string;
    type?: string;
    /** Direct current Need anchors on this exact rendered reference (References spec §7). */
    needAnchors: readonly string[];
}
/**
 * Host policy for turning a References URI into a browser destination.
 *
 * Returning `undefined` keeps the human-readable reference but renders its title as text. A host may
 * translate a non-browser scheme into a trusted internal route; {@link admitFieldHelpUri} is the default.
 */
export type FieldHelpUriAdmission = (uri: string) => string | undefined;
/**
 * Fail-closed browser policy for human Reference links: HTTPS, or a same-app relative URI, and nothing else.
 *
 * Deliberately narrower than the rich-text link rule (core §4.2.1 admits `http:` and `mailto:` too). A help
 * link is a destination a form hands a respondent under the form's own authority — a downgrade to `http:`, an
 * embedded credential, or a protocol-relative `//host` that inherits whatever scheme the page loaded under are
 * all things a References Document should not be able to introduce. One rule, both renderers.
 */
export declare function admitFieldHelpUri(uri: string): string | undefined;
/** A References Document as the schema shapes it (References spec §4.1). */
export interface ReferencesDocumentLike {
    references?: unknown;
}
/**
 * The human-facing References bound to `fieldPath`, in presentation order.
 *
 * Qualifying (References spec §2.1, §4.2, §8.2): `audience` is `"human"` or `"both"` — agent-only entries are
 * never rendered — and `target` names this item. A `target` matches when it equals the path, equals the path
 * with its repeat indices stripped, or is the `items[*].field` wildcard form of it; `"#"` is form-level and
 * belongs to no field. Order is by effective priority tier (absent means `"supplementary"`, §2.1), then
 * authoring order within the tier (§2.4).
 */
export declare function resolveFieldHelp(document: ReferencesDocumentLike | null | undefined, fieldPath: string): readonly FieldHelpReference[];
