/** @filedesc Accessible character count for TextInput theme widgetConfig.maxLength (a display, not a hard cap). */
'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { CHARACTER_COUNT_ANNOUNCE_DELAY_MS, characterCountLimitMessage, characterCountStatus, } from '@formspec-org/layout';
/** Id of the sr-only limit message; the control's aria-describedby must name it. */
export const characterCountInfoId = (fieldId) => `${fieldId}-count-info`;
/**
 * Theme `widgetConfig.maxLength` (theme §4.2): an sr-only limit message (linked from the control's
 * aria-describedby), a visual status (aria-hidden), and a polite live status updated after a 1s typing
 * pause. Same markup and copy as the default webcomponent TextInput adapter.
 */
export function CharacterCount({ fieldId, length, maxLength }) {
    const status = characterCountStatus(length, maxLength);
    const [announced, setAnnounced] = useState(status);
    useEffect(() => {
        const timer = setTimeout(() => setAnnounced(status), CHARACTER_COUNT_ANNOUNCE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [status]);
    return (_jsxs(_Fragment, { children: [_jsx("span", { id: characterCountInfoId(fieldId), className: "formspec-sr-only", children: characterCountLimitMessage(maxLength) }), _jsx("p", { className: `formspec-hint formspec-character-count${length > maxLength ? ' formspec-character-count--over-limit' : ''}`, "aria-hidden": "true", children: status }), _jsx("div", { className: "formspec-sr-only formspec-character-count-sr-status", "aria-live": "polite", children: announced })] }));
}
