/**
 * @filedesc React-free table of the delivery contracts the starter widget set ships.
 *
 * `starterWidgetModule` publishes exactly this table beside its components, and
 * hosts read it without loading React to state what they ship at authoring
 * time (`@formspec-org/app-graph` `HostWidgetContracts`). One table, so the
 * authored check and the runtime resolver cannot disagree.
 */
import type { WidgetRuntimeContract } from '@formspec-org/app-graph';
/** Registry inventory entries required by the generic shell state renderer (`widget-state.tsx`). */
export declare const MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "/stateViews/*";
    readonly kind: "module-widget-state-view";
}, {
    readonly pointerPattern: "/stateViews/*/actions/*";
    readonly kind: "module-widget-state-action";
}];
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
/** StructuredPanel Registry entry versions the starter set ships; 0.1.0 is the default. */
export declare const STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS: readonly ["0.1.0", "0.1.1", "0.1.2"];
/** AcceptedResponseReview Registry entry versions the starter set ships; 0.1.0 is the default. */
export declare const ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS: readonly ["0.1.0", "0.1.1"];
export type StructuredPanelRegistryEntryVersion = typeof STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS[number];
export type AcceptedResponseReviewRegistryEntryVersion = typeof ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS[number];
export interface StarterWidgetContractOptions {
    /** Explicit deployment support for the maintained whole-panel props schema. */
    structuredPanelRegistryEntryVersion?: StructuredPanelRegistryEntryVersion;
    /** Explicit support for authored accepted-record field selection. */
    acceptedResponseReviewRegistryEntryVersion?: AcceptedResponseReviewRegistryEntryVersion;
}
/** `widgetShape.widgetName` → the contract the starter module delivers under these options. */
export declare function starterWidgetContracts(options?: StarterWidgetContractOptions): Record<string, WidgetRuntimeContract>;
