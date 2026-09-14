/** @filedesc Cross-artifact semantic lint for the generic StructuredPanel widget. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
export declare const STRUCTURED_PANEL_CONTRACT_CODES: {
    readonly duplicateBlockId: "STRUCTURED-PANEL-BLOCK-ID-DUPLICATE";
    readonly duplicateKeyValueItemId: "STRUCTURED-PANEL-KEY-VALUE-ITEM-ID-DUPLICATE";
    readonly duplicateTableColumnId: "STRUCTURED-PANEL-TABLE-COLUMN-ID-DUPLICATE";
    readonly duplicateActionOutput: "STRUCTURED-PANEL-ACTION-OUTPUT-DUPLICATE";
    readonly actionUnbound: "STRUCTURED-PANEL-ACTION-UNBOUND";
    readonly actionLabelNonLiteral: "STRUCTURED-PANEL-ACTION-LABEL-NON-LITERAL";
    readonly actionConfirmationInvalid: "STRUCTURED-PANEL-ACTION-CONFIRMATION-INVALID";
    readonly dataPathImpossible: "STRUCTURED-PANEL-DATA-PATH-IMPOSSIBLE";
};
/** A confirmation a StructuredPanel renderer can show: every label plus its own Need trace. */
export interface AdmittedStructuredPanelConfirmation {
    heading: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    anchors: string[];
}
export type StructuredPanelConfirmationAdmission = {
    status: 'absent';
} | {
    status: 'admitted';
    confirmation: AdmittedStructuredPanelConfirmation;
} | {
    status: 'inadmissible';
    missing: string[];
};
/**
 * The single admission rule for a StructuredPanel action `confirmation`, shared
 * by the renderer and this lint so neither can drift. An inadmissible
 * confirmation withholds its action; it never degrades to one click.
 */
export declare function structuredPanelConfirmationAdmission(action: unknown): StructuredPanelConfirmationAdmission;
/**
 * Validate authored StructuredPanel configuration against the exact Surface
 * bindings and loaded Data Source and Response Actions documents.
 *
 * Runtime payload absence remains a runtime diagnostic. This pass reports only
 * authored collisions and render failures proven by the loaded graph.
 */
export declare function validateStructuredPanelContracts(context: AppGraphContext): AppGraphDiagnostic[];
