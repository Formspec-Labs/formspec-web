import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Shared receipt reference formatting and filing status label helpers. */
import { Fragment } from 'react';
const FILING_STATUS_STRING_KEYS = {
    filed: 'formStatusFiled',
    returned: 'formStatusReturned',
    accepted: 'formStatusAccepted',
    'closed-without-acceptance': 'formStatusClosedWithoutAcceptance',
    reopened: 'formStatusReopened',
};
export function filingStatusLabel(status, strings) {
    return strings(FILING_STATUS_STRING_KEYS[status]);
}
/**
 * Insert zero-width `<wbr />` break opportunities after URN colons so long
 * receipt identifiers wrap at segment boundaries instead of leaving single-character
 * orphans, while preserving exact `textContent`.
 */
export function FormattedReceiptRef({ reference }) {
    const parts = reference.split(':');
    if (parts.length <= 1)
        return reference;
    return parts.map((part, index) => (_jsxs(Fragment, { children: [index > 0 ? _jsxs(_Fragment, { children: [":", _jsx("wbr", {})] }) : null, part] }, index)));
}
