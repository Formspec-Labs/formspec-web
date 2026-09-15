/** @filedesc Rich-text subset parser — Core §4.2.1 Markdown subset for label, hint, and display text. */
/**
 * An inline run inside a {@link RichBlock}.
 *
 * `strong`, `em` and `link` nest inline children; `text` is a literal run. There is no node kind for a
 * construct outside the subset, by design: anything the subset does not define stays `text`.
 */
export type RichInline = {
    kind: 'text';
    value: string;
} | {
    kind: 'strong';
    children: RichInline[];
} | {
    kind: 'em';
    children: RichInline[];
} | {
    kind: 'link';
    href: string;
    children: RichInline[];
};
/** A block in the subset: a paragraph, or one unordered list with an inline run per entry. */
export type RichBlock = {
    kind: 'paragraph';
    children: RichInline[];
} | {
    kind: 'list';
    items: RichInline[][];
};
/**
 * True when `source` contains a character sequence the subset could turn into markup.
 *
 * A negative answer is the fast path *and* the guarantee behind "plain strings render unchanged": a caller
 * that sees `false` can write the string as-is, byte for byte, instead of round-tripping it through the
 * parser. Deliberately over-inclusive — a `_` in `field_name` answers `true` and then parses to one literal
 * text run, which is correct, just not free.
 */
export declare function isRichText(source: string): boolean;
/**
 * Parse the core §4.2.1 rich-text subset: paragraphs, `- ` / `* ` lists, `**strong**`, `_emphasis_`, and
 * `[text](https|http|mailto URI)`. Nothing else is markup — headings, images, code, tables and raw HTML
 * are literal text, as is any link with another scheme.
 *
 * **Callers MUST interpolate `{{ }}` before calling.** The parser has no notion of interpolation, so a value
 * substituted in beforehand is parsed like any other text and CANNOT re-open the markup boundary in the other
 * direction — see the emitter, which never builds markup from a node's text. The rule that protects the
 * respondent (an answer containing `**` is never bold) is the emitter's, enforced by parsing once.
 */
export declare function parseRichText(source: string): RichBlock[];
/** Flatten an inline tree back to its text content — the plain-text rendering of a parsed string. */
export declare function richTextToPlain(blocks: RichBlock[]): string;
