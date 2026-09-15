/** @filedesc Character count copy for TextInput theme widgetConfig.maxLength (USWDS usa-character-count wording). */
import { UI_STRINGS, fillUiParams } from './ui-strings.js';
function chromeString(key, lookup) {
    return lookup?.(key) ?? UI_STRINGS[key];
}
/** The sr-only limit message a control's aria-describedby names. */
export function characterCountLimitMessage(maxLength, lookup) {
    return fillUiParams(chromeString('characterCount.limit', lookup), { max: maxLength });
}
/** The visible and announced count status (usa-character-count `getCountMessage`). */
export function characterCountStatus(length, maxLength, lookup) {
    if (length === 0) {
        return fillUiParams(chromeString('characterCount.allowed', lookup), { max: maxLength });
    }
    const remaining = maxLength - length;
    const count = Math.abs(remaining);
    const over = remaining < 0;
    const key = over
        ? (count === 1 ? 'characterCount.overOne' : 'characterCount.over')
        : (count === 1 ? 'characterCount.leftOne' : 'characterCount.left');
    return fillUiParams(chromeString(key, lookup), { count });
}
/** Typing pause before the polite live status repeats the count, so screen readers are not flooded. */
export const CHARACTER_COUNT_ANNOUNCE_DELAY_MS = 1000;
