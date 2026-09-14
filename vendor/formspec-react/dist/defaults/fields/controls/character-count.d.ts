/** Id of the sr-only limit message; the control's aria-describedby must name it. */
export declare const characterCountInfoId: (fieldId: string) => string;
/**
 * Theme `widgetConfig.maxLength` (theme §4.2): an sr-only limit message (linked from the control's
 * aria-describedby), a visual status (aria-hidden), and a polite live status updated after a 1s typing
 * pause. Same markup and copy as the default webcomponent TextInput adapter.
 */
export declare function CharacterCount({ fieldId, length, maxLength }: {
    fieldId: string;
    length: number;
    maxLength: number;
}): import("react/jsx-runtime").JSX.Element;
