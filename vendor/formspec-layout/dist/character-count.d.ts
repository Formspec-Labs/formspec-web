/** @filedesc Character count copy for TextInput theme widgetConfig.maxLength (USWDS usa-character-count wording). */
/** The sr-only limit message a control's aria-describedby names. */
export declare function characterCountLimitMessage(maxLength: number): string;
/** The visible and announced count status (usa-character-count `getCountMessage`). */
export declare function characterCountStatus(length: number, maxLength: number): string;
/** Typing pause before the polite live status repeats the count, so screen readers are not flooded. */
export declare const CHARACTER_COUNT_ANNOUNCE_DELAY_MS = 1000;
