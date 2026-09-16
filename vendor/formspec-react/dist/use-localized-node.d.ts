import type { LayoutNode } from '@formspec-org/layout';
import type { IFormEngine } from '@formspec-org/engine/render';
/** The innermost repeat instance (`jobs[1]`) around the node being rendered; '' outside repeats. */
export declare const RepeatInstanceContext: import("react").Context<string>;
/**
 * The live title of a node the planner titled (same rule as the web component's `plannedTitle`): a page
 * made from a group is titled by that group's label (`titleBind`), a page nobody authored by its `$ui`
 * chrome key (`titleKey`); undefined for any other node. Read inside a locale-signal subscription.
 */
export declare function plannedTitle(engine: IFormEngine, props: Record<string, unknown> | undefined): string | undefined;
/**
 * The node renderers see, live:
 * - an authored node's string props, and string elements of its array props (`tabLabels[0]`,
 *   `columns[0].header`), replaced by `$component.<id>.<prop>` Locale strings, `{{}}` evaluated in
 *   form scope, or in the innermost repeat instance scope inside a repeat (Locale §3.3.2);
 * - a group node titled with its group's inline label titled with that group's live label instead
 *   (`engine.getItemLabelSignal`: Locale, label context, `{{}}`).
 * Same rules as webcomponent `resolveCompText` and emit-node's group heading.
 */
export declare function useLocalizedNode(node: LayoutNode): LayoutNode;
