/**
 * @filedesc The shell's own person-facing vocabulary — enumerable, in one
 * place, and host-overridable.
 *
 * ## Why a shell authors any copy at all
 *
 * A shell renders what the bundle carries and invents nothing. But four states
 * exist that no artifact describes, because they are facts about the *render*
 * rather than about the app: a slot whose target is absent, a widget handed
 * nothing to show, a transition nothing can fire, an address the app does not
 * carry. Those need words, and the words are the shell's.
 *
 * ## Why they live here rather than beside the elements that render them
 *
 * `surface-shell-spec.md` §3.0: the set "MUST be small, MUST be enumerable, and
 * MUST be overridable by the host, because a shell that hard-codes them in one
 * language makes every deployment monolingual regardless of what the bundle's
 * Locale document says. The strings are the shell's; the language is not the
 * shell's to fix."
 *
 * Locale 2.0 addresses this inventory through
 * `$module.x-formspec-surface.shell.<SurfaceStringKey>`. The adapter at the end
 * of this module binds a target-aware Locale lookup and the host's FEL
 * evaluator to that exact family. The core still owns no locale selection or
 * expression engine.
 *
 * Deliberately NOT here: `ROUTE_CLASS_THEME_REASON` and
 * `UNCLASSIFIED_THEME_REASON` (`theme-authority.ts`). Those answer a different
 * requirement — §4.3.1 makes them keyed *by the route-class vocabulary* so they
 * cannot drift out of sync with it, and that keying is the point of where they
 * live.
 */
/** Interpolation inputs. Every value is already a string the shell can print. */
export type SurfaceStringVars = Readonly<Record<string, string>>;
/**
 * The closed key set. Small enough to translate in one sitting, which is the
 * property that makes F7 closable.
 */
export declare const SURFACE_STRING_KEYS: readonly ["slotUnavailableDefinitionForm", "slotUnavailableExperienceUnit", "slotUnavailableWidgetUnimplemented", "slotUnavailableWidgetUndeclared", "slotUnavailableWidgetData", "slotUnavailableStaticContent", "slotUnavailableEmbedUnresolved", "slotUnavailableEmbedCycle", "widgetEmpty", "notFoundTitle", "notFoundBody", "navigationLabel", "transitionContinue", "transitionPending", "transitionFailed", "transitionTargetUnresolved", "transitionTargetCollision", "transitionNoResponseActions", "transitionTriggerUnresolved", "transitionTriggerAmbiguous", "transitionNoExecutor", "transitionSuppliedBySlot", "transitionFireable"];
export type SurfaceStringKey = (typeof SURFACE_STRING_KEYS)[number];
/** One string, possibly interpolated from the vars its call site supplies. */
export type SurfaceStringTemplate = (vars: SurfaceStringVars) => string;
/**
 * Host override. A plain string replaces the default exactly. Dynamic host
 * overrides use a function; authored Locale strings use the FEL adapter below.
 */
export type SurfaceStringOverride = string | SurfaceStringTemplate;
export type SurfaceStringOverrides = Partial<Record<SurfaceStringKey, SurfaceStringOverride>>;
/** A total table: every key resolves, whether or not the host overrode it. */
export type SurfaceStrings = (key: SurfaceStringKey, vars?: SurfaceStringVars) => string;
/** Canonical Locale 2.0 prefix for the closed shell string family. */
export declare const SURFACE_LOCALE_KEY_PREFIX = "$module.x-formspec-surface.shell.";
/** Target-aware Locale lookup already bound to the active app and locale. */
export type SurfaceLocaleLookup = (key: string) => string | null | undefined;
/**
 * FEL interpolation supplied by the host's Locale engine.
 *
 * Keeping evaluation injected prevents the renderer-independent package from
 * owning a second FEL implementation. The implementation receives only the
 * shell variables declared by Locale 2.0.
 */
export type SurfaceLocaleInterpolator = (template: string, vars: SurfaceStringVars) => string;
export interface SurfaceLocaleStringsInput {
    lookup: SurfaceLocaleLookup;
    interpolate: SurfaceLocaleInterpolator;
}
/**
 * The shipped English defaults. Total over {@link SURFACE_STRING_KEYS} by
 * construction — a new key with no default fails to compile here.
 */
export declare const DEFAULT_SURFACE_STRINGS: {
    readonly slotUnavailableDefinitionForm: () => string;
    readonly slotUnavailableExperienceUnit: () => string;
    readonly slotUnavailableWidgetUnimplemented: (vars: Readonly<Record<string, string>>) => string;
    readonly slotUnavailableWidgetUndeclared: (vars: Readonly<Record<string, string>>) => string;
    readonly slotUnavailableWidgetData: () => string;
    readonly slotUnavailableStaticContent: () => string;
    readonly slotUnavailableEmbedUnresolved: () => string;
    readonly slotUnavailableEmbedCycle: () => string;
    readonly widgetEmpty: () => string;
    readonly notFoundTitle: () => string;
    readonly notFoundBody: () => string;
    readonly navigationLabel: () => string;
    readonly transitionContinue: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionPending: () => string;
    readonly transitionFailed: () => string;
    readonly transitionTargetUnresolved: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionTargetCollision: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionNoResponseActions: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionTriggerUnresolved: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionTriggerAmbiguous: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionNoExecutor: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionSuppliedBySlot: (vars: Readonly<Record<string, string>>) => string;
    readonly transitionFireable: (vars: Readonly<Record<string, string>>) => string;
};
/**
 * The table a shell reads. Overrides win; anything the host leaves out falls
 * back to the shipped default, so a partial translation degrades to mixed
 * language rather than to a blank page.
 */
export declare function resolveSurfaceStrings(overrides?: SurfaceStringOverrides): SurfaceStrings;
/**
 * Adapt the active app-target Locale cascade to the shell's closed string set.
 *
 * `lookup` owns target-aware regional/base fallback. This adapter adds only the
 * canonical key prefix, FEL evaluation, and the final built-in English default
 * when the target-local cascade has no value.
 */
export declare function resolveSurfaceLocaleStrings(input: SurfaceLocaleStringsInput): SurfaceStrings;
