/** @filedesc Platform rendering defaults and theme builder that derives a ThemeDocument from the token registry. */
import tokenRegistry from './token-registry.json' with { type: 'json' };
// ── Platform Defaults ──────────────────────────────────────────────
/** Default presentation applied to all items before selector matching. */
export const platformDefaults = {
    labelPosition: 'top',
    accessibility: {
        liveRegion: 'off',
    },
};
/** Type-based selector rules applied in document order during theme cascade. */
export const platformSelectors = [
    {
        match: { type: 'group' },
        apply: {
            cssClass: 'formspec-themed-group',
            accessibility: { role: 'group' },
        },
    },
    {
        match: { type: 'display' },
        apply: {
            cssClass: 'formspec-themed-display',
        },
    },
    {
        match: { type: 'field' },
        apply: {
            cssClass: 'formspec-themed-field',
        },
    },
    {
        match: { dataType: 'boolean' },
        apply: {
            labelPosition: 'start',
        },
    },
];
// ── Theme Builder ──────────────────────────────────────────────────
/**
 * Extract all token values from the registry: light-mode defaults plus
 * dark-mode variants keyed under each category's `darkPrefix`.
 */
function extractTokens(registry) {
    const tokens = {};
    for (const category of Object.values(registry.categories)) {
        const { darkPrefix } = category;
        for (const [tokenName, entry] of Object.entries(category.tokens)) {
            tokens[tokenName] = entry.default;
            if (darkPrefix && entry.dark) {
                // "color.primary" with darkPrefix "color.dark" becomes "color.dark.primary"
                const suffix = tokenName.slice(tokenName.indexOf('.') + 1);
                const darkKey = `${darkPrefix}.${suffix}`;
                tokens[darkKey] = entry.dark;
            }
        }
    }
    return tokens;
}
/**
 * Build a complete ThemeDocument from the token registry and platform defaults.
 *
 * Light-mode tokens come from each entry's `default` value. Dark-mode tokens
 * are derived from `dark` values, keyed under the category's `darkPrefix`.
 */
export function buildPlatformTheme() {
    const tokens = extractTokens(tokenRegistry);
    return {
        $formspecTheme: '1.0',
        version: '1.0.0',
        name: 'formspec-default',
        targetDefinition: {
            url: 'urn:formspec:any',
            compatibleVersions: '>=1.0.0',
        },
        tokens,
        defaults: platformDefaults,
        selectors: platformSelectors,
    };
}
