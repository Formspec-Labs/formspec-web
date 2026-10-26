/** @filedesc Opens a `trigger: "auto"` Modal only while its `when` holds and its place in the form is rendered. */
/** The open-state controller for one auto-trigger `<dialog>`. */
export interface AutoModal {
    /** The Modal's `when` result (`true` when it has none). */
    setCondition(holds: boolean): void;
    dispose(): void;
}
/**
 * Component spec §6.16 opens a `trigger: "auto"` Modal "based on `when`", and §8.1 hides a component
 * whose ancestor is hidden: the dialog is open exactly while `when` holds AND its page, tab panel or
 * `when` wrapper is rendered. `showModal()` inside a hidden wizard page leaves an invisible open dialog
 * that makes the rest of the document inert.
 *
 * The dialog follows that conjunction's edges, not its level: a respondent who closes it is not
 * prompted again until it turns false and then true (they leave the page and come back, or `when`
 * flips). ResizeObserver on the dialog's ancestors (below `<body>`) reports a container appearing or
 * disappearing, the signal charting and grid libraries use to redraw inside a tab that just became
 * visible; `onOpen` runs after each automatic open.
 */
export declare function bindAutoModal(dialog: HTMLDialogElement, onOpen?: () => void): AutoModal;
