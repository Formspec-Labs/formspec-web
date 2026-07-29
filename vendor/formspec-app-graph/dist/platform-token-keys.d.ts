/** @filedesc Declared platform token keys — generated from schemas/token-registry.json. */
/**
 * Every token key the platform Token Registry declares, light keys plus the
 * `darkPrefix`-derived dark keys. A Theme token outside this set and outside the
 * `x-` extension namespace names nothing: no stylesheet reads it, no
 * `tokenMeta` describes it, and emitting it produces a CSS custom property with
 * no consumer. That is what THEME-TOKEN-UNREGISTERED reports
 * (token-registry-spec §5.3).
 */
export declare const PLATFORM_TOKEN_KEYS: ReadonlySet<string>;
/**
 * THE brand token (token-registry-spec §2.4). Named here so a consumer that
 * needs to talk about the brand key does not restate the string; there is no
 * second brand key and no alias for one.
 */
export declare const PLATFORM_BRAND_TOKEN_KEY = "color.primary";
