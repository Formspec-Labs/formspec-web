/** @filedesc Renderer delivery contracts for Registry widgets: the one comparison, host selection, and graph check. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
export interface WidgetRenderedConfigNodeContract {
    pointerPattern: string;
    kind: string;
}
/** What a renderer publishes for one widget (registry.schema.json `widgetShape.deliveryContractId`). */
export interface WidgetRuntimeContract {
    deliveryContractId: string;
    registryEntryVersion: string;
    renderedConfigNodes: readonly WidgetRenderedConfigNodeContract[];
}
export type WidgetRuntimeContractMismatchReason = 'runtime-contract-missing' | 'registry-entry-version-mismatch' | 'delivery-contract-id-mismatch' | 'rendered-config-inventory-mismatch';
/** The Registry fields a delivery contract is compared against. */
export interface WidgetRuntimeContractEntry {
    version?: unknown;
    widgetShape?: unknown;
}
/**
 * Why a delivered contract does not implement a Registry widget entry; empty
 * when it does, or when the entry declares no runtime contract. The runtime
 * resolver (`@formspec-org/surface` `createWidgetRegistry`) and the authoring
 * check {@link validateHostWidgetContracts} both call this, so a refusal reads
 * the same at authoring and at publication.
 */
export declare function widgetContractMismatchReasons(entry: WidgetRuntimeContractEntry, contract: WidgetRuntimeContract | undefined): WidgetRuntimeContractMismatchReason[];
/**
 * `widgetShape.widgetName` → every contract variant the host can deliver for
 * it. A key with an empty list is a widget the host supplies with no delivery
 * contract; a missing key is a widget the host does not supply.
 */
export type HostWidgetContractSet = Readonly<Record<string, readonly WidgetRuntimeContract[]>>;
/**
 * The widget contracts a deployment host ships, as data. `modules` names hosts'
 * per-module sets; every other admitted module gets `anyModule`.
 */
export interface HostWidgetContracts {
    anyModule?: HostWidgetContractSet;
    modules?: Readonly<Record<string, HostWidgetContractSet>>;
}
/** The parts of a runtime widget module (`@formspec-org/surface` `WidgetModule`) the host set reads. */
export interface HostWidgetModuleShape {
    widgets: Readonly<Record<string, unknown>>;
    contracts?: Readonly<Record<string, WidgetRuntimeContract>>;
}
/**
 * Every widget the host's module variants supply (one variant per supported
 * version option), each with its distinct contracts in first-seen order; a
 * widget no variant gives a contract maps to an empty list.
 */
export declare function hostWidgetContractSet(modules: readonly HostWidgetModuleShape[]): HostWidgetContractSet;
/**
 * The variants the host delivers for one binding: undefined when the host does
 * not supply the widget, empty when it supplies it with no delivery contract.
 */
export declare function hostWidgetContractVariants(host: HostWidgetContracts, key: {
    moduleId: string;
    widgetName: string;
}): readonly WidgetRuntimeContract[] | undefined;
/**
 * The variant the host delivers for an entry: the first that implements it,
 * else the first with the fewest mismatch reasons, so the refusal names the
 * smallest gap; undefined when the host ships the widget with no contract.
 * Publication selects with this too.
 */
export declare function selectHostWidgetContract(variants: readonly WidgetRuntimeContract[], entry: WidgetRuntimeContractEntry | undefined): WidgetRuntimeContract | undefined;
export declare const HOST_WIDGET_CONTRACT_CODES: {
    readonly unimplemented: "WIDGET-UNIMPLEMENTED";
    readonly mismatch: "WIDGET-DELIVERY-CONTRACT-MISMATCH";
};
/**
 * Authoring-time half of the module-widget delivery check: every Surface
 * `module-widget` binding must resolve to a host-shipped contract the Registry
 * entry matches. Runs only when the request carries `hostWidgetContracts`; a
 * caller with no deployment host has nothing to check against.
 */
export declare function validateHostWidgetContracts(context: AppGraphContext): AppGraphDiagnostic[];
