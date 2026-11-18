/** @filedesc Declared platform token keys — generated from schemas/token-registry.json. */
/**
 * Every token key the platform Token Registry declares, light keys plus the
 * `darkPrefix`-derived dark keys. Authoring tools can use this vocabulary
 * without loading a registry at runtime (token-registry-spec §2.4).
 * Rust lint owns W708 (THEME-TOKEN-UNREGISTERED); hosts opt in through
 * `documentLintValidator(lintDocument)` (token-registry-spec §5.3).
 */
export declare const PLATFORM_TOKEN_KEYS: ReadonlySet<string>;
/**
 * THE brand token (token-registry-spec §2.4). Named here so a consumer that
 * needs to talk about the brand key does not restate the string; there is no
 * second brand key and no alias for one.
 */
export declare const PLATFORM_BRAND_TOKEN_KEY = "color.primary";
