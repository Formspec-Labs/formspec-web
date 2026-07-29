/** @filedesc Shared Registry identity lookup for Surface module widgets. */
export interface WidgetContributionIdentity {
    moduleId: string;
    /** Surface vocabulary: `widgetShape.widgetName`, not a contribution id. */
    widgetName: string;
}
/**
 * The smallest Registry entry shape needed to resolve a widget contribution.
 *
 * Callers may supply generated Registry entries or ModuleResolver-normalized
 * entries. The helper deliberately knows nothing about renderer components.
 */
export interface WidgetContributionEntry {
    name: string;
    category: string;
    contributes?: readonly string[];
    widgetShape?: unknown;
}
/**
 * Resolve one Surface widget name through the named module's `contributes[]`.
 *
 * Module scoping is part of the identity. A widget entry with the same
 * `widgetShape.widgetName` cannot satisfy a different module, and a Registry
 * contribution id cannot stand in for the Surface widget name unless the two
 * strings genuinely coincide.
 */
export declare function resolveWidgetContribution<TEntry extends WidgetContributionEntry>(identity: WidgetContributionIdentity, entries: readonly TEntry[]): TEntry | undefined;
