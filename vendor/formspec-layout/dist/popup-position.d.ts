/**
 * Position anchored overlays (modal, popover) near a trigger.
 * Shared by React and web component renderers; optional for native centered dialogs.
 */
export type PopupPlacement = 'top' | 'right' | 'bottom' | 'left';
export declare const POPUP_EDGE_PADDING = 8;
export declare const POPUP_TRIGGER_GAP = 8;
/** First focusable in modal/dialog content (disabled controls skipped). */
export declare const MODAL_FIRST_FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
/**
 * Pin `overlayEl` with fixed coordinates near `triggerEl`. Call only when a placement is chosen;
 * omit to keep native dialog centered presentation.
 */
export declare function positionPopupNearTrigger(triggerEl: HTMLElement, overlayEl: HTMLElement, placement?: PopupPlacement): void;
/** Clear inline positioning from a previous anchored open so the dialog can use default centering. */
export declare function clearPopupFixedPosition(overlayEl: HTMLElement): void;
