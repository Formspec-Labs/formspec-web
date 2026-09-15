/**
 * @filedesc The starter widget set, and the module that publishes it.
 *
 * The focused v10 widgets remain: a lead-in banner, signing frame, receipt
 * panel, and operator queue. `StructuredPanel` adds the generic data-only
 * primitive: authored JSON selects common information blocks and mapped
 * actions without adding product-specific React.
 *
 * ## The names, and which vocabulary they are in
 *
 * The keys of {@link STARTER_WIDGETS} are `widgetShape.widgetName` values — the
 * name a Surface `module-widget` binding writes, which the schema leaves
 * unpatterned (ADR 0160 §2.4). They are NOT `RegistryEntry.name` contribution
 * ids and NOT Theme's `CustomWidgetName`. `@formspec-org/surface`'s
 * `widgetContributionFor` maps between the first two; nothing here should.
 *
 * ## Rebinding
 *
 * {@link starterWidgetModule} takes the module id, so the same components can be
 * published under whichever module a bundle declares. A tenant that wants its
 * own banner ships its own module and its own component; a tenant that wants the
 * platform's binds this one. Both go through the same seam.
 */
import type { SurfaceWidget, SurfaceWidgetModule } from '../widget-api.js';
export { IntakeBanner } from './intake-banner.js';
export { CeremonyFrame } from './ceremony-frame.js';
export { ReceiptPanel } from './receipt-panel.js';
export { QueueTable } from './queue-table.js';
export { StructuredPanel, readStructuredPanelPath } from './structured-panel.js';
export { WidgetEmptyState } from './empty-state.js';
export type { IntakeBannerConfig } from './intake-banner.js';
export type { CeremonyFrameConfig } from './ceremony-frame.js';
export type { ReceiptFact, ReceiptPanelData } from './receipt-panel.js';
export type { QueueColumn, QueueRow, QueueTableActionPayloadConfig, QueueTableActionPayloadSelector, QueueTableConfig, QueueTableData, QueueTableRowActionConfig, } from './queue-table.js';
export type { StructuredKeyValueBlockConfig, StructuredKeyValueItemConfig, StructuredListBlockConfig, StructuredMetricBlockConfig, StructuredActionConfirmationConfig, StructuredActionPayloadConfig, StructuredActionPayloadSelector, StructuredPanelActionConfig, StructuredPanelBlockConfig, StructuredPanelConfig, StructuredProgressBlockConfig, StructuredTableBlockConfig, StructuredTableColumnConfig, StructuredTableRowActionConfig, } from './structured-panel.js';
/**
 * `widgetShape.widgetName` → component, for the starter set.
 *
 * The `x-` prefixed spellings are the names the surface-render-v10 bundle
 * authors, kept so a signed bundle binds without re-signing. The bare spellings
 * are the same components under names a new module would more naturally write —
 * the schema permits both, since this field carries no pattern.
 */
export declare const STARTER_WIDGETS: Readonly<Record<string, SurfaceWidget>>;
export declare const STRUCTURED_PANEL_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/StructuredPanel@0.1";
export declare const QUEUE_TABLE_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/QueueTable@0.1";
export declare const RECEIPT_PANEL_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/ReceiptPanel@0.1";
export declare const CEREMONY_FRAME_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/CeremonyFrame@0.1";
export declare const STRUCTURED_PANEL_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "";
    readonly kind: "structured-panel";
}, {
    readonly pointerPattern: "/blocks/*";
    readonly kind: "structured-panel-block";
}, {
    readonly pointerPattern: "/blocks/*/items/*";
    readonly kind: "structured-panel-field";
}, {
    readonly pointerPattern: "/blocks/*/columns/*";
    readonly kind: "structured-panel-column";
}, {
    readonly pointerPattern: "/blocks/*/rowAction";
    readonly kind: "structured-panel-row-action";
}, {
    readonly pointerPattern: "/blocks/*/rowAction/confirmation";
    readonly kind: "structured-panel-action-confirmation";
}, {
    readonly pointerPattern: "/actions/*";
    readonly kind: "structured-panel-action";
}, {
    readonly pointerPattern: "/actions/*/confirmation";
    readonly kind: "structured-panel-action-confirmation";
}, {
    readonly pointerPattern: "/stateViews/*";
    readonly kind: "module-widget-state-view";
}, {
    readonly pointerPattern: "/stateViews/*/actions/*";
    readonly kind: "module-widget-state-action";
}];
export declare const QUEUE_TABLE_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "";
    readonly kind: "queue-table";
}, {
    readonly pointerPattern: "/columns/*";
    readonly kind: "queue-table-column";
}, {
    readonly pointerPattern: "/rowAction";
    readonly kind: "queue-table-row-action";
}];
export declare const RECEIPT_PANEL_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "";
    readonly kind: "receipt-panel";
}];
export declare const CEREMONY_FRAME_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "";
    readonly kind: "ceremony-frame";
}];
export declare function starterWidgetModule(moduleId: string): SurfaceWidgetModule;
