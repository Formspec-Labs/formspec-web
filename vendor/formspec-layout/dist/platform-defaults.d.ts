/** @filedesc Platform rendering defaults and theme builder that derives a ThemeDocument from the token registry. */
import type { PresentationBlock, ThemeSelector, ThemeDocument } from './theme-resolver.js';
/** Default presentation applied to all items before selector matching. */
export declare const platformDefaults: PresentationBlock;
/** Type-based selector rules applied in document order during theme cascade. */
export declare const platformSelectors: ThemeSelector[];
/**
 * Build a complete ThemeDocument from the token registry and platform defaults.
 *
 * Light-mode tokens come from each entry's `default` value. Dark-mode tokens
 * are derived from `dark` values, keyed under the category's `darkPrefix`.
 */
export declare function buildPlatformTheme(): ThemeDocument;
