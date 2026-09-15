/** @filedesc Character count copy for TextInput theme widgetConfig.maxLength (USWDS usa-character-count wording). */
import { type ChromeStringKey } from './ui-strings.js';
/** A Locale-override lookup for one `$ui.<ChromeStringKey>` suffix; `null`/absent falls to {@link UI_STRINGS}. */
export type UiStringLookup = (key: ChromeStringKey) => string | null | undefined;
/** The sr-only limit message a control's aria-describedby names. */
export declare function characterCountLimitMessage(maxLength: number, lookup?: UiStringLookup): string;
/** The visible and announced count status (usa-character-count `getCountMessage`). */
export declare function characterCountStatus(length: number, maxLength: number, lookup?: UiStringLookup): string;
/** Typing pause before the polite live status repeats the count, so screen readers are not flooded. */
export declare const CHARACTER_COUNT_ANNOUNCE_DELAY_MS = 1000;
