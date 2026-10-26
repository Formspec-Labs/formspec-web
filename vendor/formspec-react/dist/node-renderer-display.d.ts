import type { LayoutNode } from '@formspec-org/layout';
/**
 * Sanitized markdown-to-HTML parser preventing XSS, script injection, srcdoc,
 * attribute injection, and unescaped HTML vectors.
 */
export declare function renderSanitizedMarkdown(text: string): string;
/** Backward-compatible alias for renderSanitizedMarkdown. */
export declare const simpleMarkdown: typeof renderSanitizedMarkdown;
/** Renders a display node — checks for user override before built-in rendering. */
export declare function DisplayNode({ node }: {
    node: LayoutNode;
}): import("react/jsx-runtime").JSX.Element | null;
