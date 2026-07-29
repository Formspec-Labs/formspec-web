/** @filedesc Theme token validation against the declared platform Token Registry. */
import { type AppGraphContext, type AppGraphDiagnostic } from './types.js';
/**
 * `THEME-TOKEN-UNREGISTERED` — token-registry-spec §5.3.
 *
 * A Theme token under a platform-owned category prefix that the registry does
 * not declare names nothing. It is accepted by authoring, passes schema
 * validation, is signed into the release, is emitted by the renderer and
 * resolves in the cascade — and changes nothing on screen. The whole chain
 * succeeds and the tenant sees no difference.
 *
 * Scoped to owned prefixes on purpose — see {@link OWNED_CATEGORY_PREFIXES}.
 *
 * Warning, not error: a theme carrying an unregistered token is still a
 * renderable theme, and §5.3 forbids rejecting a document on registry grounds.
 * The point is that the chain stops being silent.
 */
export declare function validateThemeTokenRegistry(context: AppGraphContext): AppGraphDiagnostic[];
