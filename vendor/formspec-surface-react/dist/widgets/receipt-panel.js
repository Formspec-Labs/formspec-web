import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc `ReceiptPanel` — what a person keeps after they submit.
 *
 * A receipt is the artifact someone shows a landlord, a caseworker, or a court.
 * It is the reason the `proof` route class exists and refuses tenant branding:
 * *nobody can be shown a receipt styled to look more official than it is.*
 *
 * ## Every field here comes from the host, and there is a reason that is not lazy
 *
 * The spike's receipt invented a case reference and a layout, and showed the
 * signature facts it happened to have. What a receipt actually needs — the
 * submitted answers, the case reference, the issued artifact — is runtime state,
 * and a bundle export has `sessions: []` and no response documents (gap ledger
 * `no-runtime-state`). So this widget takes its facts from the host data
 * resolver, renders exactly what it is handed, and says plainly when it is
 * handed nothing. A receipt panel that fabricates a reference number is worse
 * than an empty one: the empty one cannot be mistaken for proof.
 *
 * The route's own parameters are the one exception, and only because the URL is
 * the fact: if the route is `/receipt/{caseRef}`, the reference in the address
 * bar IS the reference, and it is shown as such.
 */
import { WidgetEmptyState } from './empty-state.js';
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
function isValidIsoDateTime(value) {
    if (!ISO_DATE_TIME_RE.test(value))
        return false;
    if (!Number.isFinite(Date.parse(value)))
        return false;
    const [datePart] = value.split(/[Tt]/);
    const [year, month, day] = datePart.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}
function readReceiptInput(data) {
    if (typeof data !== 'object' || data === null)
        return {};
    const namedInputs = data;
    const receipt = namedInputs.receipt;
    if (typeof receipt !== 'object' || receipt === null)
        return {};
    const record = receipt;
    const text = (key) => typeof record[key] === 'string' && record[key] !== '' ? record[key] : undefined;
    const facts = Array.isArray(record.facts)
        ? record.facts.flatMap((entry) => {
            if (typeof entry !== 'object' || entry === null)
                return [];
            const row = entry;
            return typeof row.label === 'string' && typeof row.value === 'string'
                ? [{ label: row.label, value: row.value }]
                : [];
        })
        : [];
    const parsed = {};
    const caseRef = text('caseRef');
    const receiptId = text('receiptId');
    const rawSubmittedAt = text('submittedAt');
    const submittedAt = rawSubmittedAt !== undefined && isValidIsoDateTime(rawSubmittedAt)
        ? rawSubmittedAt
        : undefined;
    const fingerprint = text('fingerprint');
    const issuer = text('issuer');
    if (caseRef !== undefined)
        parsed.caseRef = caseRef;
    if (receiptId !== undefined)
        parsed.receiptId = receiptId;
    if (submittedAt !== undefined)
        parsed.submittedAt = submittedAt;
    if (fingerprint !== undefined)
        parsed.fingerprint = fingerprint;
    if (issuer !== undefined)
        parsed.issuer = issuer;
    if (facts.length > 0)
        parsed.facts = facts;
    return parsed;
}
function formatWhen(iso) {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}
export function ReceiptPanel({ data, route, config }) {
    const parsed = readReceiptInput(data);
    // The address bar is a fact about this page, not invented content: a
    // `/receipt/{caseRef}` route IS addressed by the reference.
    const caseRefParamName = typeof config.caseRefParam === 'string' ? config.caseRefParam : 'caseRef';
    const caseRef = parsed.caseRef ?? route.params[caseRefParamName];
    const rows = [
        ...(caseRef ? [{ label: 'Your reference', value: caseRef }] : []),
        ...(parsed.receiptId ? [{ label: 'Receipt ID', value: parsed.receiptId }] : []),
        ...(parsed.submittedAt ? [{ label: 'Sent', value: formatWhen(parsed.submittedAt) }] : []),
        ...(parsed.fingerprint ? [{ label: 'Fingerprint', value: parsed.fingerprint }] : []),
        ...(parsed.issuer ? [{ label: 'Issued by', value: parsed.issuer }] : []),
        ...(parsed.facts ?? []),
    ];
    return (_jsx("div", { className: "fs-surface-receipt", "data-widget": "receipt-panel", children: rows.length === 0 ? (_jsx(WidgetEmptyState, { children: "There is no receipt to show. Nothing has been submitted through this release yet." })) : (_jsx("dl", { className: "fs-surface-receipt__facts", "data-probe": "receipt-facts", children: rows.map((row) => (_jsxs("div", { className: "fs-surface-receipt__row", children: [_jsx("dt", { children: row.label }), _jsx("dd", { children: row.value })] }, `${row.label}:${row.value}`))) })) }));
}
