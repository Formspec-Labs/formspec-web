import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Lossless frozen Response review with qualified labels and owned attachment previews. */
import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import canonicalize from "canonicalize";
import { jsonNumberText } from "@formspec-org/engine";
import { getDraftReviewIrrelevantPaths, isQualifiedDraftReview } from '../internal/draft-review-qualification.js';
import { canonicalFiniteJson, snapshotFiniteJson, } from "@formspec-org/surface";
import { Heading, nextLevel } from "../heading.js";
import { WidgetEmptyState } from "./empty-state.js";
import { RESPONSE_REVIEW_COPY_KEYS, ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA, ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA, ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011, ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011, } from './response-review-metadata.js';
export * from './response-review-metadata.js';
import { createAcceptedReviewFieldSelection, resolveAcceptedResponseReviewFieldSelection } from './response-review-selection.js';
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.length > 0;
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const hash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
/** Full RFC 8785 JCS/SHA-256 identity. This is not an authored-signature profile or crypto verification. */
export async function responseReviewHash(value) {
    const snapshot = snapshotFiniteJson(value);
    assertUnicode(snapshot);
    const bytes = new TextEncoder().encode(canonicalize(snapshot));
    return sha256(bytes);
}
async function sha256(bytes) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Bare SHA-256 hex of the complete Response under the maintained handoff profile. */
export async function responseReviewHandoffHash(response, produce) {
    if (!produce)
        throw Error("Response handoff byte producer unavailable");
    const snapshot = snapshotFiniteJson(response);
    assertUnicode(snapshot);
    const bytes = produce(snapshot);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0)
        throw Error("Invalid Response handoff bytes");
    return sha256(new Uint8Array(bytes));
}
// Reuse SigningContent's scalar admission rule: check Unicode, never normalize it.
function assertUnicode(value) {
    if (typeof value === "string") {
        if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
            throw Error("Invalid Unicode in review identity");
    }
    else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
            assertUnicode(key);
            assertUnicode(child);
        }
    }
}
function isStaticRelevantFalse(value) {
    return value === false || (typeof value === "string" && value.trim().toLowerCase() === "false");
}
function collectBindHints(definition) {
    const hints = new Map();
    const binds = definition.binds;
    if (!Array.isArray(binds))
        return hints;
    for (const bind of binds) {
        if (!object(bind) || !text(bind.path))
            continue;
        const isReadonly = bind.readonly !== undefined && bind.readonly !== false && bind.readonly !== "false";
        const isCalculate = bind.calculate !== undefined && bind.calculate !== "";
        const isRelevantFalse = isStaticRelevantFalse(bind.relevant);
        if (!isReadonly && !isCalculate && !isRelevantFalse)
            continue;
        const prev = hints.get(bind.path);
        hints.set(bind.path, {
            readonly: Boolean(prev?.readonly || isReadonly),
            calculate: Boolean(prev?.calculate || isCalculate),
            relevantFalse: Boolean(prev?.relevantFalse || isRelevantFalse),
        });
    }
    return hints;
}
function lookupBindHint(bindHints, path) {
    if (!bindHints)
        return undefined;
    return (bindHints.get(path) ??
        bindHints.get(path.replace(/\[\d+\]/g, "[*]")) ??
        bindHints.get(path.replace(/\[\d+\]/g, "")));
}
function isMoneyObject(value) {
    if (!object(value))
        return false;
    const keys = Object.keys(value);
    if (keys.length !== 2 || !own(value, "amount") || !own(value, "currency"))
        return false;
    const { amount, currency } = value;
    const validAmount = jsonNumberText(amount) !== undefined ||
        (typeof amount === "string" && /^-?\d+(?:\.\d+)?$/.test(amount.trim()));
    return validAmount && typeof currency === "string" && /^[A-Z]{3}$/.test(currency);
}
function formatMoneyValue(amount, currency, locale, options) {
    const rawStr = jsonNumberText(amount) ?? (typeof amount === "string" ? amount.trim() : String(amount));
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(rawStr);
    const effectiveLocale = locale || "en-US";
    if (match) {
        const [, sign, intPart, fracPart] = match;
        const trimmedFrac = fracPart ? fracPart.replace(/0+$/, "") : "";
        const exactFracLen = fracPart ? fracPart.length : 0;
        const significantDigits = intPart.replace(/^0+/, "").length + (fracPart?.length ?? 0);
        // Preserve exact precision for high-precision or >2-decimal amounts without silent rounding.
        if (significantDigits <= 15) {
            const numeric = Number(rawStr);
            if (Number.isFinite(numeric)) {
                const minFrac = options?.lossless
                    ? exactFracLen
                    : trimmedFrac.length > 0
                        ? Math.max(2, trimmedFrac.length)
                        : 0;
                const maxFrac = options?.lossless
                    ? exactFracLen
                    : Math.max(2, trimmedFrac.length);
                try {
                    return new Intl.NumberFormat(effectiveLocale, {
                        style: "currency",
                        currency,
                        minimumFractionDigits: minFrac,
                        maximumFractionDigits: maxFrac,
                    }).format(numeric);
                }
                catch {
                    return `${currency} ${rawStr}`;
                }
            }
        }
        // High-precision (>15 significant digits) lossless formatting via BigInt grouping.
        try {
            const groupedInt = new Intl.NumberFormat(effectiveLocale, { useGrouping: true }).format(BigInt(intPart));
            const parts = new Intl.NumberFormat(effectiveLocale, { style: "currency", currency }).formatToParts(0);
            const currencyPart = parts.find((part) => part.type === "currency")?.value ?? `${currency} `;
            const decimalSep = parts.find((part) => part.type === "decimal")?.value ?? ".";
            const fractionSuffix = fracPart !== undefined
                ? (options?.lossless ? `${decimalSep}${fracPart}` : trimmedFrac ? `${decimalSep}${trimmedFrac}` : "")
                : "";
            return `${sign}${currencyPart}${groupedInt}${fractionSuffix}`;
        }
        catch {
            return `${currency} ${rawStr}`;
        }
    }
    const num = Number(rawStr);
    if (!Number.isFinite(num))
        return `${currency} ${rawStr}`;
    try {
        return new Intl.NumberFormat(effectiveLocale, {
            style: "currency",
            currency,
            minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
            maximumFractionDigits: 2,
        }).format(num);
    }
    catch {
        return `${currency} ${rawStr}`;
    }
}
function formatDateValue(value, locale) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        return value;
    const [, year, month, day] = match;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    if (parsed.getUTCFullYear() !== y ||
        parsed.getUTCMonth() !== m - 1 ||
        parsed.getUTCDate() !== d) {
        return value;
    }
    if (!locale || /^en\b/i.test(locale)) {
        return `${month}/${day}/${year}`;
    }
    try {
        return new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: "UTC",
        }).format(parsed);
    }
    catch {
        return `${month}/${day}/${year}`;
    }
}
function isYearIntegerField(rawDigits, node) {
    if (!/^\d{4}$/.test(rawDigits))
        return false;
    const value = Number(rawDigits);
    if (value < 1900 ||
        value > 2199 ||
        node.currency ||
        node.prefix ||
        node.suffix) {
        return false;
    }
    if (/\b(?:count|total|number\s+of|amount|participants|people|individuals|households|clients|hours|days|months)\b/i.test(node.label)) {
        return false;
    }
    const leafKey = node.path.split(".").pop()?.replace(/\[\d+\]/g, "") ?? "";
    return (/\b(?:fiscal|calendar|tax|birth|reporting|program|grant|school|award|graduation|model|plan)\s+year\b|^\s*year\b|\byear\s*(?:\([^)]*\))?\s*:?\s*$/i.test(node.label) ||
        /(?:^|[_-])(?:year|fy)(?:$|[_-])|year$/i.test(leafKey));
}
/**
 * Format an exact decimal/integer string with locale integer grouping via BigInt while preserving
 * every stored fractional digit verbatim (never rounds through IEEE-754 float or fixed max decimals).
 */
function formatExactDecimalText(rawDigits, effectiveLocale) {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(rawDigits);
    if (!match)
        return rawDigits;
    const [, sign, intPart, fracPart] = match;
    let groupedInt = intPart;
    let decimalSep = ".";
    try {
        groupedInt = new Intl.NumberFormat(effectiveLocale, {
            useGrouping: true,
        }).format(BigInt(intPart));
        if (fracPart !== undefined) {
            const parts = new Intl.NumberFormat(effectiveLocale).formatToParts(1.1);
            decimalSep = parts.find((part) => part.type === "decimal")?.value ?? ".";
        }
    }
    catch {
        groupedInt = intPart;
        decimalSep = ".";
    }
    return fracPart !== undefined
        ? `${sign}${groupedInt}${decimalSep}${fracPart}`
        : `${sign}${groupedInt}`;
}
function formatNumericValue(rawDigits, node, locale, options) {
    if (node.currency || node.prefix === "$") {
        return formatMoneyValue(rawDigits, node.currency ?? "USD", locale, options);
    }
    if (isYearIntegerField(rawDigits, node)) {
        return rawDigits;
    }
    const effectiveLocale = locale || "en-US";
    const formatted = formatExactDecimalText(rawDigits, effectiveLocale);
    const inferredPercent = !options?.lossless &&
        !node.suffix &&
        node.dataType === "decimal" &&
        /(?:\(%|\bpercentage\b|%)/i.test(node.label);
    const suffix = node.suffix ?? (inferredPercent ? "%" : undefined);
    const prefix = node.prefix ?? "";
    if (suffix) {
        const glue = suffix === "%" || suffix.startsWith(" ") ? "" : " ";
        return `${prefix}${formatted}${glue}${suffix}`;
    }
    return `${prefix}${formatted}`;
}
function isEmptyReviewValue(value) {
    return (value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0) ||
        (object(value) && Object.keys(value).length === 0));
}
function filterEmptyReviewNodes(nodes) {
    let unansweredCount = 0;
    let hasConcreteAnswer = false;
    const pendingCalculated = [];
    const entries = [];
    for (const node of nodes) {
        if (node.kind === "value") {
            if (isEmptyReviewValue(node.value)) {
                if (node.calculatedReadonly) {
                    pendingCalculated.push(node);
                    entries.push({ node, calculatedEmpty: true });
                }
                else {
                    unansweredCount += 1;
                }
            }
            else {
                hasConcreteAnswer = true;
                entries.push({ node });
            }
        }
        else {
            const childResult = filterEmptyReviewNodes(node.children);
            unansweredCount += childResult.unansweredCount;
            if (childResult.hasConcreteAnswer && childResult.answered.length > 0) {
                hasConcreteAnswer = true;
                entries.push({ node: { ...node, children: childResult.answered } });
            }
        }
    }
    if (!hasConcreteAnswer) {
        unansweredCount += pendingCalculated.length;
        return { answered: [], unansweredCount, hasConcreteAnswer: false };
    }
    return {
        answered: entries.map((entry) => entry.node),
        unansweredCount,
        hasConcreteAnswer: true,
    };
}
function capture(props, acceptedSelectionProfile) {
    try {
        // Reject accessors/cycles before reading values; detach everything the display can consume.
        const dataSnapshot = snapshotFiniteJson(props.data);
        const configSnapshot = snapshotFiniteJson(props.config);
        const data = dataSnapshot;
        const config = configSnapshot;
        const { definition: d, response: r, presentation: p } = data;
        const acceptedAlias = props.widgetName === "AcceptedResponseReview" || props.widgetName === "x-accepted-response-review";
        if (!object(p) || acceptedAlias !== (p.phase === "accepted-record"))
            return undefined;
        if (!object(d) ||
            d.$formspec !== "1.0" ||
            !text(d.url) ||
            !text(d.version) ||
            !Array.isArray(d.items) ||
            !object(r) ||
            r.$formspecResponse !== "1.0" ||
            !text(r.id) ||
            !object(r.data) ||
            !["in-progress", "completed", "amended"].includes(r.status) ||
            !object(p) ||
            d.url !== r.definitionUrl ||
            d.version !== r.definitionVersion ||
            !text(p.locale) ||
            !object(p.fields))
            return undefined;
        if (p.phase === 'draft-review') {
            if (!isQualifiedDraftReview(props.data) || !['in-progress', 'completed', 'amended'].includes(r.status) || !text(p.revision))
                return undefined;
        }
        else if (!['before-sign', 'before-submit', 'accepted-record'].includes(p.phase) ||
            p.definitionUrl !== d.url || p.definitionVersion !== d.version || !hash(p.responseHash) ||
            !object(r.displayedLocale) || r.displayedLocale.locale !== p.locale ||
            (p.phase === 'before-submit' && (!Array.isArray(r.authoredSignatures) || r.authoredSignatures.length === 0)))
            return undefined;
        const selected = own(config, 'fieldSelection');
        if ((acceptedSelectionProfile === 'selected' && !selected) ||
            (acceptedSelectionProfile === 'legacy' && selected))
            return undefined;
        let selection;
        let permittedPaths;
        if (selected) {
            if (p.phase !== 'accepted-record' || !own(p, 'fieldSelection'))
                return undefined;
            const policy = config.fieldSelection;
            const expected = resolveAcceptedResponseReviewFieldSelection(d, r, policy);
            if (canonicalize(expected) !== canonicalize(p.fieldSelection))
                return undefined;
            permittedPaths = new Set(expected.permittedPaths);
            selection = createAcceptedReviewFieldSelection(d.items, policy.fieldPaths);
        }
        else if (own(p, 'fieldSelection'))
            return undefined;
        if (p.phase === "accepted-record") {
            const task = own(p, "taskSign");
            const schema = selected
                ? (task ? ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011 : ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011)
                : (task ? ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA : ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA);
            if (Object.keys(p).some(key => !own(schema.properties, key)))
                return undefined;
            if (task) {
                if (!object(p.taskSign) || Object.keys(p.taskSign).some(key => key !== "recordRef" && key !== "recordHash") ||
                    typeof p.taskSign.recordHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(p.taskSign.recordHash) ||
                    p.taskSign.recordRef !== `urn:formspec:task-draft-sign:${p.taskSign.recordHash}` ||
                    !Array.isArray(r.authoredSignatures) || r.authoredSignatures.length === 0)
                    return undefined;
            }
            else if (!text(p.handoffId))
                return undefined;
        }
        else if (p.phase !== 'draft-review' && (!text(p.actorRef) || !object(p.draft) || !text(p.draft.id) ||
            !Number.isSafeInteger(p.draft.version) || p.draft.version < 0 || (own(p, "handoffId") || own(p, "taskSign"))))
            return undefined;
        for (const m of Object.values(p.fields)) {
            if (!object(m) ||
                !text(m.label) ||
                (m.options !== undefined &&
                    (!Array.isArray(m.options) ||
                        m.options.some((o) => !object(o) || !text(o.value) || !text(o.label)))))
                return undefined;
        }
        if (!object(config.copy))
            return undefined;
        const locales = Object.keys(config.copy).filter((k) => k.toLowerCase() === p.locale.toLowerCase());
        if (locales.length !== 1)
            return undefined;
        const c = config.copy[locales[0]];
        if (!object(c) || !RESPONSE_REVIEW_COPY_KEYS.every((k) => text(c[k])))
            return undefined;
        if (p.phase === "accepted-record" && !text(c.acceptedRecord))
            return undefined;
        const copy = c;
        const attachments = [];
        const bindHints = collectBindHints(d);
        const defaultCurrency = object(d.formPresentation) &&
            text(d.formPresentation.defaultCurrency)
            ? d.formPresentation.defaultCurrency
            : undefined;
        const irrelevantPaths = p.phase === "draft-review"
            ? getDraftReviewIrrelevantPaths(props.data)
            : undefined;
        const nodes = walk(d.items, r.data, "", p, copy, attachments, selection, bindHints, irrelevantPaths, defaultCurrency);
        const explanations = p.phase === 'accepted-record' ? (r.explanations ?? []).filter(entry => {
            if (!object(entry) || !object(entry.author) || !text(entry.author.id) || !text(entry.recorded) ||
                (entry.author.name !== undefined && typeof entry.author.name !== 'string')) {
                throw Error("Invalid recorded explanation stamp");
            }
            let paths;
            if ('group' in entry) {
                if (entry.group !== true || !text(entry.code) || !Array.isArray(entry.paths) ||
                    !entry.paths.length || !entry.paths.every(text) ||
                    (entry.partyRef !== undefined && !text(entry.partyRef)))
                    throw Error("Invalid acknowledgement");
                paths = entry.paths;
            }
            else {
                if (!text(entry.shapeId) || !text(entry.path) ||
                    (entry.text !== undefined && typeof entry.text !== 'string'))
                    throw Error("Invalid explanation");
                paths = [entry.path];
            }
            if (selection) {
                const authorized = paths.every(path => {
                    if (path === '#' || path.includes('*'))
                        return false;
                    if (permittedPaths.has(path))
                        return true;
                    try {
                        return selection.includes(path);
                    }
                    catch {
                        return false;
                    }
                });
                if (!authorized)
                    return false;
            }
            if (!paths.every(path => path === '#' || own(p.fields, path))) {
                throw Error("Missing recorded explanation label");
            }
            return true;
        }) : [];
        return {
            explanations,
            headingLevel: props.headingLevel,
            data,
            copy,
            nodes,
            attachments,
            identity: canonicalFiniteJson({ data: dataSnapshot, config: configSnapshot, headingLevel: props.headingLevel }),
        };
    }
    catch {
        return undefined;
    }
}
function walk(items, values, prefix, p, copy, attachments, selection, bindHints, irrelevantPaths, defaultCurrency) {
    const nodes = [];
    const consumed = new Set();
    const keys = new Set();
    const isDraftReview = p.phase === "draft-review";
    for (const item of items) {
        if (!object(item) ||
            !text(item.key) ||
            keys.has(item.key) ||
            !["group", "field", "display"].includes(String(item.type)))
            throw Error("Invalid Definition item");
        keys.add(item.key);
        if (!own(values, item.key))
            continue;
        const path = prefix ? `${prefix}.${item.key}` : item.key;
        if (selection && !(item.type === 'field' && selection.includes(path)) &&
            !(item.type === 'group' && selection.contains(path)))
            continue;
        const bindHint = lookupBindHint(bindHints, path);
        if (isDraftReview &&
            (irrelevantPaths?.has(path) || isStaticRelevantFalse(item.relevant) || bindHint?.relevantFalse)) {
            consumed.add(item.key);
            continue;
        }
        const value = values[item.key];
        const metadata = own(p.fields, path)
            ? p.fields[path]
            : undefined;
        if (!metadata)
            throw Error("Missing captured label");
        consumed.add(item.key);
        if (item.type === "group" && Array.isArray(item.children)) {
            if (Array.isArray(value) &&
                item.repeatable === true &&
                value.every(object)) {
                nodes.push({
                    kind: "group",
                    path,
                    label: metadata.label,
                    children: value.flatMap((row, i) => {
                        const rowPath = `${path}[${i}]`;
                        if (isDraftReview && irrelevantPaths?.has(rowPath))
                            return [];
                        if (selection && !selection.contains(rowPath))
                            return [];
                        return [{
                                kind: "group",
                                path: rowPath,
                                label: `${metadata.label} ${i + 1}`,
                                children: walk(item.children, row, rowPath, p, copy, attachments, selection, bindHints, irrelevantPaths, defaultCurrency),
                            }];
                    }).filter(row => !selection || row.children.length > 0),
                });
                // An empty repeated group is still a recorded value.
                if (!value.length && !selection)
                    nodes.push({
                        kind: "value",
                        path: `${path}:empty`,
                        label: metadata.label,
                        value: value,
                        attachment: false,
                    });
            }
            else if (object(value) && item.repeatable !== true) {
                const children = walk(item.children, value, path, p, copy, attachments, selection, bindHints, irrelevantPaths, defaultCurrency);
                if (selection && !children.length)
                    continue;
                nodes.push(children.length
                    ? { kind: "group", path, label: metadata.label, children }
                    : {
                        kind: "value",
                        path,
                        label: metadata.label,
                        value,
                        attachment: false,
                    });
            }
            else if (selection)
                throw Error("Invalid selected review group");
            else
                nodes.push({
                    kind: "value",
                    path,
                    label: metadata.label,
                    value,
                    attachment: false,
                });
        }
        else {
            // Empty recorded values have no file to preview. Preserve their value
            // display without introducing an attachment readiness requirement.
            const empty = value === null || value === "" || (Array.isArray(value) && !value.length);
            const attachment = item.dataType === "attachment" && !empty;
            if (attachment)
                attachments.push(...(Array.isArray(value) && value.length
                    ? value.map((_, i) => `${path}[${i}]`)
                    : [path]));
            const itemReadonly = item.readonly !== undefined && item.readonly !== false && item.readonly !== "false";
            const itemCalculate = item.calculate !== undefined && item.calculate !== "";
            const calculatedReadonly = Boolean(itemCalculate || bindHint?.calculate || (itemReadonly || bindHint?.readonly));
            const presentationObj = object(item.presentation) ? item.presentation : undefined;
            const prefixText = text(item.prefix)
                ? item.prefix
                : presentationObj && text(presentationObj.prefix)
                    ? presentationObj.prefix
                    : undefined;
            const explicitCurrency = text(item.currency)
                ? item.currency
                : presentationObj && text(presentationObj.currency)
                    ? presentationObj.currency
                    : undefined;
            const isCurrencyField = item.dataType === "money" ||
                prefixText === "$" ||
                (presentationObj && presentationObj.format === "currency");
            const currency = explicitCurrency ?? (isCurrencyField ? defaultCurrency : undefined);
            const suffixText = text(item.suffix)
                ? item.suffix
                : presentationObj && text(presentationObj.suffix)
                    ? presentationObj.suffix
                    : presentationObj && text(presentationObj.unit)
                        ? presentationObj.unit
                        : text(item.unit)
                            ? item.unit
                            : undefined;
            const precision = typeof item.precision === "number" && Number.isInteger(item.precision) && item.precision >= 0
                ? item.precision
                : undefined;
            nodes.push({
                kind: "value",
                path,
                label: metadata.label,
                value,
                attachment,
                ...(metadata.options ? { options: metadata.options } : {}),
                ...(text(item.dataType) ? { dataType: item.dataType } : {}),
                ...(currency ? { currency } : {}),
                ...(prefixText ? { prefix: prefixText } : {}),
                ...(suffixText ? { suffix: suffixText } : {}),
                ...(precision !== undefined ? { precision } : {}),
                ...(calculatedReadonly ? { calculatedReadonly: true } : {}),
            });
        }
    }
    for (const key of Object.keys(values))
        if (!selection && !consumed.has(key)) {
            const path = prefix ? `${prefix}.${key}` : key;
            nodes.push({
                kind: "value",
                path,
                label: `${copy.additionalAnswers}: ${JSON.stringify(key)}`,
                value: values[key],
                attachment: false,
            });
        }
    return nodes;
}
function Value({ node, copy, phase, locale, }) {
    const v = node.value;
    const isDraftReview = phase === "draft-review";
    if (v === null) {
        if (isDraftReview && node.calculatedReadonly) {
            return _jsx("span", { className: "fs-response-review-calculated-empty", children: "\u2014" });
        }
        return _jsx(_Fragment, { children: copy.nullValue });
    }
    if (typeof v === "boolean")
        return _jsx(_Fragment, { children: v ? copy.trueValue : copy.falseValue });
    if (v === "") {
        if (isDraftReview && node.calculatedReadonly) {
            return _jsx("span", { className: "fs-response-review-calculated-empty", children: "\u2014" });
        }
        return _jsx(_Fragment, { children: copy.emptyString });
    }
    if (Array.isArray(v) && !v.length)
        return _jsx(_Fragment, { children: copy.emptyArray });
    if (object(v) && !Object.keys(v).length)
        return _jsx(_Fragment, { children: copy.emptyObject });
    if (isMoneyObject(v)) {
        return (_jsx("span", { className: "fs-response-review-number", children: formatMoneyValue(v.amount, v.currency, locale ?? "en-US", { lossless: !isDraftReview }) }));
    }
    const numericText = jsonNumberText(v);
    if (numericText !== undefined) {
        return (_jsx("span", { className: "fs-response-review-number", children: formatNumericValue(numericText, node, locale ?? "en-US", { lossless: !isDraftReview }) }));
    }
    if (typeof v === "string") {
        const option = node.options?.filter((o) => o.value === v);
        if (option?.length === 1) {
            if (isDraftReview)
                return _jsx(_Fragment, { children: option[0].label });
            return (_jsxs(_Fragment, { children: [option[0].label, " ", _jsxs("span", { className: "fs-response-review-code", children: ["(", v, ")"] })] }));
        }
        if (isDraftReview && node.dataType === "date") {
            return _jsx(_Fragment, { children: formatDateValue(v, locale ?? "en-US") });
        }
        return _jsx(_Fragment, { children: v });
    }
    if (Array.isArray(v) && node.options)
        return (_jsx("ul", { className: "fs-response-review-list", children: v.map((entry, i) => {
                const option = node.options?.filter((o) => o.value === entry);
                return (_jsx("li", { children: option?.length === 1
                        ? isDraftReview
                            ? option[0].label
                            : `${option[0].label} (${String(entry)})`
                        : isDraftReview && typeof entry === "string"
                            ? entry
                            : JSON.stringify(entry) }, i));
            }) }));
    // JSON preserves all keys, values, array order and scalar types without string coercion.
    return (_jsx("pre", { className: "fs-response-review-json fs-surface-review__structured", children: JSON.stringify(v, null, 2) }));
}
const raster = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
function byteMedia(bytes) {
    const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
        return "image/png";
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        return "image/jpeg";
    if (["GIF87a", "GIF89a"].includes(ascii(0, 6)))
        return "image/gif";
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
        return "image/webp";
    return undefined;
}
async function verifiedPreview(blob, descriptor) {
    if (!object(descriptor))
        throw Error("Descriptor missing");
    const mime = descriptor.contentType ?? descriptor.mimeType;
    if (!text(mime) ||
        !raster.has(mime) ||
        (descriptor.contentType !== undefined &&
            descriptor.mimeType !== undefined &&
            descriptor.contentType !== descriptor.mimeType) ||
        !Number.isSafeInteger(descriptor.size) ||
        descriptor.size < 0 ||
        blob.size !== descriptor.size ||
        typeof descriptor.hash !== "string" ||
        !/^sha256:[a-f0-9]{64}$/.test(descriptor.hash) ||
        blob.type !== mime)
        throw Error("Unqualified attachment");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (byteMedia(bytes) !== mime)
        throw Error("Media does not match bytes");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    if (`sha256:${hex}` !== descriptor.hash)
        throw Error("Digest mismatch");
}
function acceptedAttachment(request) {
    return request.presentation.phase === "accepted-record";
}
function Attachment({ capture: c, node, read, onStatus, }) {
    const descriptors = Array.isArray(node.value) ? node.value : [node.value];
    useEffect(() => {
        if (!descriptors.length)
            onStatus(node.path, "unavailable");
    }, [node.path, descriptors.length, onStatus]);
    return (_jsxs(_Fragment, { children: [!descriptors.length ? (_jsx("p", { role: "status", children: c.copy.attachmentUnavailable })) : null, descriptors.map((descriptor, i) => (_jsx(AttachmentPreview, { capture: c, descriptor: descriptor, path: Array.isArray(node.value) ? `${node.path}[${i}]` : node.path, label: node.label, read: read, onStatus: onStatus }, i))), _jsxs("details", { children: [_jsx("summary", { children: c.copy.attachmentDetails }), _jsx(Value, { node: node, copy: c.copy, phase: c.data.presentation.phase, locale: c.data.presentation.locale })] })] }));
}
function AttachmentPreview({ capture: c, descriptor, path, label, read, onStatus, }) {
    const [view, setView] = useState({ state: "pending" });
    const activeUrl = useRef(undefined);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        let url;
        setView({ state: read ? "pending" : "unavailable" });
        onStatus(path, read ? "pending" : "unavailable");
        if (read && c.data.presentation.phase !== 'draft-review') {
            const request = { ...c.data, path, descriptor };
            void (async () => {
                try {
                    const blob = await read(request, { signal: controller.signal });
                    if (!active)
                        return;
                    await verifiedPreview(blob, descriptor);
                    if (!active)
                        return;
                    url = URL.createObjectURL(blob);
                    activeUrl.current = url;
                    setView({ state: "loaded", url });
                }
                catch {
                    if (active) {
                        setView({ state: "failed" });
                        onStatus(path, "unavailable");
                    }
                }
            })();
        }
        return () => {
            active = false;
            activeUrl.current = undefined;
            controller.abort();
            if (url)
                URL.revokeObjectURL(url);
        };
    }, [c.identity, descriptor, path, read, onStatus, attempt]);
    return (_jsxs("figure", { className: "fs-response-review-attachment", children: [view.url ? (_jsx("img", { src: view.url, alt: `${c.copy.attachmentPreview}: ${label}`, onLoad: () => {
                    if (!view.url || activeUrl.current !== view.url)
                        return;
                    setView((v) => ({ ...v, state: "ready" }));
                    onStatus(path, "ready");
                }, onError: () => {
                    if (!view.url || activeUrl.current !== view.url)
                        return;
                    setView((v) => ({ ...v, state: "failed" }));
                    onStatus(path, "unavailable");
                } })) : null, read && view.state === "failed" ? (_jsx("button", { type: "button", onClick: () => setAttempt((n) => n + 1), children: c.copy.retry })) : null, view.state !== "ready" ? (_jsx("figcaption", { role: "status", children: view.state === "failed"
                    ? c.copy.attachmentFailed
                    : view.state === "unavailable"
                        ? c.copy.attachmentUnavailable
                        : c.copy.attachmentPending })) : null] }));
}
function ReviewBody({ capture: c, options, }) {
    const { presentation: p, response: r } = c.data;
    const isDraftReview = p.phase === "draft-review";
    const [admitted, setAdmitted] = useState(isDraftReview);
    const [failed, setFailed] = useState(false);
    const [identity, setIdentity] = useState();
    const [previews, setPreviews] = useState({});
    const [showUnanswered, setShowUnanswered] = useState(false);
    const filtered = useMemo(() => (isDraftReview
        ? filterEmptyReviewNodes(c.nodes)
        : { answered: c.nodes, unansweredCount: 0, hasConcreteAnswer: true }), [isDraftReview, c.nodes]);
    const report = useCallback((status, contextIdentity) => {
        if (p.phase === 'draft-review')
            return;
        const common = { status, responseHash: p.responseHash, locale: p.locale,
            ...(contextIdentity ? { contextIdentity } : {}) };
        if (p.phase === "accepted-record") {
            options.onAcceptedReviewState?.(p.taskSign
                ? { ...common, phase: p.phase, taskSign: p.taskSign }
                : { ...common, phase: p.phase, handoffId: p.handoffId });
        }
        else {
            options.onReviewState?.({ ...common, phase: p.phase, actorRef: p.actorRef, draft: p.draft });
        }
    }, [options.onReviewState, options.onAcceptedReviewState, p]);
    const readAttachment = useMemo(() => {
        if (p.phase === 'draft-review')
            return undefined;
        if (p.phase === "accepted-record") {
            const read = options.readAcceptedAttachment;
            return read ? (request, context) => acceptedAttachment(request)
                ? read(request, context) : Promise.reject(Error("Review branch mismatch")) : undefined;
        }
        const read = options.readAttachment;
        return read ? (request, context) => !acceptedAttachment(request)
            ? read(request, context) : Promise.reject(Error("Review branch mismatch")) : undefined;
    }, [p.phase, options.readAttachment, options.readAcceptedAttachment]);
    const onStatus = useCallback((path, status) => setPreviews((previous) => ({ ...previous, [path]: status })), []);
    useEffect(() => {
        if (p.phase === 'draft-review')
            return;
        let active = true;
        report("pending");
        void Promise.all([
            responseReviewHandoffHash(r, options.canonicalResponseHandoffBytes),
            responseReviewHash(c.data),
        ])
            .then(([actual, id]) => {
            if (!active)
                return;
            if (actual !== p.responseHash) {
                setFailed(true);
                report("unavailable");
                return;
            }
            setIdentity(id);
            setAdmitted(true);
        })
            .catch(() => {
            if (active) {
                setFailed(true);
                report("unavailable");
            }
        });
        return () => {
            active = false;
            report("unavailable");
        };
    }, [c.identity, report]);
    useEffect(() => {
        if (!admitted || !identity)
            return;
        const statuses = c.attachments.map((path) => previews[path] ?? "pending");
        report(statuses.includes("unavailable")
            ? "unavailable"
            : statuses.includes("pending")
                ? "pending"
                : "ready", identity);
    }, [admitted, identity, previews, report, c]);
    if (!admitted)
        return (_jsx(WidgetEmptyState, { children: failed ? c.copy.unavailable : c.copy.pending }));
    const instances = new Map();
    const groups = [];
    for (const entry of c.explanations) {
        const stamp = _jsxs(_Fragment, { children: [entry.author.name ?? entry.author.id, " \u00B7 ", _jsx("time", { dateTime: entry.recorded, children: entry.recorded })] });
        if ('group' in entry) {
            const count = entry.paths.length;
            const summaryLabel = `${count} ${count === 1 ? 'question' : 'questions'} left unanswered (${entry.code})`;
            groups.push(_jsxs("details", { "data-explanation-code": entry.code, children: [_jsxs("summary", { children: [summaryLabel, " \u2014 accepted by ", entry.author.name ?? entry.author.id, " at ", _jsx("time", { dateTime: entry.recorded, children: entry.recorded })] }), _jsx("ul", { children: entry.paths.map(path => _jsx("li", { children: path === '#' ? c.copy.heading : p.fields[path].label }, path)) })] }, JSON.stringify([entry.code, entry.partyRef])));
        }
        else {
            const notes = instances.get(entry.path) ?? [];
            notes.push(_jsxs("p", { children: [entry.text && _jsxs(_Fragment, { children: [entry.text, " \u00B7 "] }), stamp] }, entry.shapeId));
            instances.set(entry.path, notes);
        }
    }
    function notesFor(path) {
        const notes = instances.get(path);
        instances.delete(path);
        return notes;
    }
    const displayedNodes = isDraftReview && !showUnanswered ? filtered.answered : c.nodes;
    const signatureCount = r.authoredSignatures?.length ?? 0;
    const showContext = !isDraftReview || signatureCount > 0;
    const showRecordDetails = !isDraftReview;
    const render = (nodes, level) => nodes.map((node) => node.kind === "group" ? (_jsxs("section", { className: "fs-response-review-group", children: [_jsx(Heading, { level: level, children: node.label }), notesFor(node.path), render(node.children, nextLevel(level))] }, node.path)) : (_jsxs("dl", { className: "fs-response-review-row", "data-response-path": node.path, children: [_jsx("dt", { children: node.label }), _jsxs("dd", { children: [node.attachment ? (_jsx(Attachment, { capture: c, node: node, read: readAttachment, onStatus: onStatus })) : (_jsx(Value, { node: node, copy: c.copy, phase: p.phase, locale: p.locale })), notesFor(node.path)] })] }, node.path)));
    return (_jsxs("section", { className: "fs-response-review", "aria-label": c.copy.heading, lang: p.locale, children: [_jsx(Heading, { level: c.headingLevel, children: c.copy.heading }), !isDraftReview && _jsx("p", { className: "fs-response-review-intro", children: p.phase === "accepted-record" ? c.copy.acceptedRecord
                    : p.phase === "before-sign" ? c.copy.beforeSign : c.copy.beforeSubmit }), showContext && (_jsxs("dl", { className: "fs-response-review-context fs-response-review__meta", children: [p.phase !== "accepted-record" && !isDraftReview ? _jsxs("div", { children: [_jsx("dt", { children: c.copy.draftVersion }), _jsx("dd", { children: p.draft.version })] }) : null, !isDraftReview && (_jsxs("div", { children: [_jsx("dt", { children: c.copy.locale }), _jsx("dd", { children: p.locale })] })), _jsxs("div", { children: [_jsx("dt", { children: c.copy.signatures }), _jsx("dd", { children: signatureCount })] })] })), isDraftReview && filtered.unansweredCount > 0 && (_jsx("div", { className: "fs-response-review-controls", children: _jsx("button", { type: "button", className: "fs-response-review-toggle", "aria-expanded": showUnanswered, onClick: () => setShowUnanswered((current) => !current), children: showUnanswered
                        ? `Hide ${filtered.unansweredCount} unanswered ${filtered.unansweredCount === 1 ? "item" : "items"}`
                        : `Show ${filtered.unansweredCount} unanswered ${filtered.unansweredCount === 1 ? "item" : "items"}` }) })), displayedNodes.length > 0 ? (render(displayedNodes, nextLevel(c.headingLevel))) : (isDraftReview && (_jsx("p", { className: "fs-response-review-empty", children: "No answers recorded yet." }))), [...instances].map(([path, notes]) => _jsxs("div", { children: [_jsx("strong", { children: path === '#' ? c.copy.heading : p.fields[path].label }), notes] }, path)), groups, showRecordDetails && (_jsxs("details", { className: "fs-response-review-record-details", children: [_jsx("summary", { children: c.copy.responseId }), _jsx("p", { children: r.id })] }))] }));
}
function unavailableCopy(props) {
    try {
        const input = snapshotFiniteJson({
            data: props.data,
            config: props.config,
        });
        const p = input.data.presentation;
        const copies = input.config.copy;
        if (!object(p) || !text(p.locale) || !object(copies))
            return undefined;
        const matches = Object.keys(copies).filter((k) => k.toLowerCase() === String(p.locale).toLowerCase());
        const copy = matches.length === 1 ? copies[matches[0]] : undefined;
        return object(copy) && text(copy.unavailable)
            ? copy.unavailable
            : undefined;
    }
    catch {
        return undefined;
    }
}
let nextReviewGeneration = 0;
function ProfiledResponseReview(props) {
    const c = capture(props, props.acceptedSelectionProfile);
    // Stable detached capture prevents a new snapshot object from restarting every preview render.
    const stable = useMemo(() => c, [c?.identity]);
    const generation = useMemo(() => ++nextReviewGeneration, [
        c?.identity,
        props.readAttachment,
        props.readAcceptedAttachment,
        props.onAcceptedReviewState,
        props.onReviewState,
        props.canonicalResponseHandoffBytes,
    ]);
    if (!stable)
        return _jsx(WidgetEmptyState, { children: unavailableCopy(props) });
    return (_jsx(ReviewBody, { capture: stable, options: {
            ...(props.canonicalResponseHandoffBytes
                ? {
                    canonicalResponseHandoffBytes: props.canonicalResponseHandoffBytes,
                }
                : {}),
            ...(props.readAttachment
                ? { readAttachment: props.readAttachment }
                : {}),
            ...(props.onReviewState ? { onReviewState: props.onReviewState } : {}),
            ...(props.readAcceptedAttachment ? { readAcceptedAttachment: props.readAcceptedAttachment } : {}),
            ...(props.onAcceptedReviewState ? { onAcceptedReviewState: props.onAcceptedReviewState } : {}),
        } }, generation));
}
export function ResponseReview(props) {
    return _jsx(ProfiledResponseReview, { ...props, acceptedSelectionProfile: undefined });
}
export function createResponseReviewWidget(options = {}, 
/** Deployment profile admission; grants no access or signing authority. */
acceptedSelectionProfile) {
    return (props) => _jsx(ProfiledResponseReview, { ...props, ...options, acceptedSelectionProfile: acceptedSelectionProfile });
}
