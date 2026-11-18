import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Presents an authored filing task list from a batch of draft observations. */
import { useEffect, useId, useMemo, useState } from 'react';
import { Heading } from './heading.js';
import { isPlainLinkClick } from './browser-location.js';
import { needTraceAttributes } from './need-trace.js';
import { presentedRouteLabel } from './title-presentation.js';
export function useFilingDraftObservations(slots, readSummaries, previewScope, revision, generation, draftRevision) {
    const queries = useMemo(() => {
        const unique = new Map();
        function visit(plans) {
            for (const slot of plans) {
                if (slot.slotType === 'embed-route')
                    visit(slot.slots);
                if (slot.slotType === 'filing-status' && slot.tracker.status === 'ready') {
                    for (const group of slot.tracker.groups) {
                        for (const row of group.rows)
                            if (row.status === 'ready')
                                unique.set(row.query.key, row.query);
                    }
                }
            }
        }
        visit(slots);
        return [...unique.values()];
    }, [slots]);
    const request = useMemo(() => ({ queries, readSummaries, previewScope }), [queries, readSummaries, previewScope, revision, generation, draftRevision]);
    const [completed, setCompleted] = useState();
    useEffect(() => {
        if (!request.readSummaries || request.queries.length === 0)
            return;
        const read = request.readSummaries;
        const controller = new AbortController();
        const result = (observations) => {
            if (!controller.signal.aborted)
                setCompleted({ request, observations });
        };
        void Promise.resolve()
            .then(() => controller.signal.aborted ? new Map() : read(request.queries, {
            previewScope: request.previewScope, signal: controller.signal,
        }))
            .then(result, () => result(new Map()));
        return () => controller.abort();
    }, [request]);
    return (query) => {
        if (!readSummaries)
            return { status: 'unavailable' };
        if (completed?.request !== request)
            return { status: 'loading' };
        return completed.observations.get(query.key) ?? { status: 'unavailable' };
    };
}
function filingLinkFor(destination, navigation) {
    const href = navigation?.formatHref ? navigation.formatHref(destination) : destination;
    return href === undefined ? undefined : { href, destination };
}
function FilingLink({ link, navigation, describedBy, className, style, children, ...anchorProps }) {
    if (!link)
        return _jsx("span", { className: className, style: style, role: "link", "aria-disabled": "true", "aria-describedby": describedBy, children: children });
    return _jsx("a", { ...anchorProps, className: className, style: style, href: link.href, "aria-describedby": describedBy, onClick: navigation && (event => {
            if (!isPlainLinkClick(event))
                return;
            event.preventDefault();
            navigation.navigate(link.destination);
        }), children: children });
}
function filingFillCount({ filled, total }, text) {
    return text('filingFillCount', { filled: String(filled), total: String(total) });
}
function filingFindings(counts, text) {
    const findings = [];
    if (counts.toFix !== null && counts.toFix > 0) {
        findings.push({ kind: 'fix', label: text('filingFixCount', { count: String(counts.toFix) }) });
    }
    if (counts.toCheck !== null && counts.toCheck > 0) {
        findings.push({ kind: 'check', label: text('filingCheckCount', { count: String(counts.toCheck) }) });
    }
    if (counts.toFix === null || counts.toCheck === null)
        findings.push({ label: text('filingChecksUnavailable') });
    return findings;
}
const observationLabel = {
    loading: 'filingLoading',
    absent: 'filingNotStarted',
    denied: 'filingDenied',
    stale: 'filingStale',
    unavailable: 'filingUnavailable',
};
const refusalLabel = {
    'route-address-unavailable': 'filingAddressUnavailable',
    'definition-unresolved': 'filingDefinitionUnavailable',
    'slot-unresolved': 'slotUnavailableDefinitionForm',
    'subject-unavailable': 'filingSubjectUnavailable',
    'invalid-binding': 'filingUnavailable',
};
function sectionFinding(counts) {
    if (counts && counts.toFix !== null && counts.toFix > 0)
        return 'fix';
    if (counts && counts.toCheck !== null && counts.toCheck > 0)
        return 'check';
    return undefined;
}
function FilingRow({ row, observation, largest, context, text }) {
    const statusId = useId();
    const label = row.route ? presentedRouteLabel(row.route, context?.resolveRouteTitle)
        : row.status === 'disabled' && row.routeRef;
    const status = row.status === 'disabled' ? text(refusalLabel[row.reason])
        : observation.status === 'absent' && row.weight > 0 ? text('filingNotStartedWithSize', { count: String(row.weight) })
            : observation.status === 'current'
                ? text(observation.form.ready === null ? 'filingReadinessUnavailable' : observation.form.ready ? 'filingReady' : 'filingInProgress')
                : text(observationLabel[observation.status]);
    const sections = row.status === 'ready' ? row.sections.map(section => {
        const counts = observation.status === 'absent' ? { filled: 0, total: section.weight, toFix: 0, toCheck: 0 }
            : observation.status === 'current' && Object.hasOwn(observation.sections, section.id)
                ? observation.sections[section.id] : undefined;
        const countLabels = counts ? [filingFillCount(counts, text), ...filingFindings(counts, text).map(finding => finding.label)] : [];
        return { ...section, link: filingLinkFor(section.href, context), counts, countLabels };
    }) : [];
    const segments = sections.filter(section => section.weight > 0);
    return _jsxs("li", { className: "fs-surface-filing__row", ...needTraceAttributes(row.needAnchors), children: [_jsxs("div", { className: "fs-surface-filing__form", children: [label && _jsx(FilingLink, { link: row.status === 'ready' ? filingLinkFor(row.href, context) : undefined, navigation: context, describedBy: statusId, children: label }), row.description && _jsx("p", { children: row.description }), row.hint && _jsx("p", { children: row.hint })] }), sections.length > 0 && _jsxs("div", { className: "fs-surface-filing__section-nav", children: [row.status === 'ready' && segments.length > 0 && _jsx("div", { className: "fs-surface-filing__strip", "aria-hidden": "true", style: { inlineSize: `${100 * Math.max(Math.sqrt(row.weight / largest), 0.08)}%` }, children: segments.map(({ id, label, weight, counts, countLabels, link }) => {
                            const percent = counts && counts.total > 0 ? Math.min(100, 100 * counts.filled / counts.total) : 0;
                            const finding = sectionFinding(counts);
                            const title = countLabels.length > 0 ? `${label}: ${countLabels.join(', ')}` : label;
                            return _jsxs(FilingLink, { link: link, navigation: context, className: "fs-surface-filing__segment", style: { flexGrow: weight }, tabIndex: -1, title: title, onMouseDown: event => event.preventDefault(), children: [_jsx("span", { className: "fs-surface-filing__fill", style: { inlineSize: `${percent}%` } }), finding && _jsx("span", { className: "fs-surface-filing__mark", "data-finding": finding })] }, id);
                        }) }), _jsxs("details", { children: [_jsxs("summary", { children: [text('filingSections', { count: String(sections.length) }), label && _jsxs("span", { className: "fs-surface-visually-hidden", children: [" ", label] })] }), _jsx("ul", { className: "fs-surface-filing__sections", role: "list", children: sections.map(({ id, label, link, countLabels }) => _jsx("li", { children: _jsxs(FilingLink, { link: link, navigation: context, children: [label, countLabels.length > 0 && _jsxs("span", { className: "fs-surface-visually-hidden", children: [" ", countLabels.join(' ')] })] }) }, id)) })] })] }), _jsxs("div", { className: "fs-surface-filing__progress", children: [_jsx("div", { id: statusId, children: status }), observation.status === 'current' && _jsxs("div", { className: "fs-surface-filing__counts", children: [_jsx("span", { children: filingFillCount(observation.form, text) }), filingFindings(observation.form, text).map(({ kind, label }) => (_jsx("span", { className: kind && `fs-surface-filing__${kind}`, children: label }, kind ?? 'unavailable'))), sections.some(section => section.counts === undefined) && _jsx("span", { children: text('filingSectionCountsUnavailable') })] })] })] });
}
const legend = [
    { key: 'filingAnswered', filled: true },
    { key: 'filingStillToAnswer' },
    { key: 'filingHasFix', finding: 'fix' },
    { key: 'filingHasCheck', finding: 'check' },
];
export function FilingStatus({ plan, context, level, text }) {
    if (plan.status === 'unresolved')
        return _jsx("p", { children: text('filingUnavailable') });
    const seen = new Set();
    const totals = { filled: 0, total: 0, toFix: null, toCheck: null };
    let known = 0;
    let partial = false;
    let largest = 0;
    const groups = plan.groups.map(group => ({ ...group, rows: group.rows.map(row => {
            const observation = row.status === 'ready'
                ? context?.observe(row.query) ?? { status: 'unavailable' } : { status: 'unavailable' };
            if (row.status === 'disabled')
                partial = true;
            else {
                largest = Math.max(largest, row.weight);
                if (!seen.has(row.query.key)) {
                    seen.add(row.query.key);
                    const counts = observation.status === 'current' ? observation.form : observation.status === 'absent'
                        ? { filled: 0, total: row.weight, toFix: 0, toCheck: 0 } : undefined;
                    if (counts) {
                        known++;
                        totals.filled += counts.filled;
                        totals.total += counts.total;
                        if (counts.toFix !== null)
                            totals.toFix = (totals.toFix ?? 0) + counts.toFix;
                        if (counts.toCheck !== null)
                            totals.toCheck = (totals.toCheck ?? 0) + counts.toCheck;
                    }
                    if (!counts || counts.toFix === null || counts.toCheck === null)
                        partial = true;
                }
            }
            return { row, observation };
        }) }));
    return _jsxs("div", { className: "fs-surface-filing", ...needTraceAttributes(plan.needAnchors), children: [known > 0 && _jsxs("div", { className: "fs-surface-filing__totals", children: [_jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: text('filingAnswered') }), _jsx("dd", { children: text('filingSummaryAnswered', { filled: String(totals.filled), total: String(totals.total) }) })] }), totals.toFix !== null && _jsxs("div", { children: [_jsx("dt", { children: text('filingSummaryToFix') }), _jsx("dd", { "data-finding": totals.toFix > 0 ? 'fix' : undefined, children: totals.toFix })] }), totals.toCheck !== null && _jsxs("div", { children: [_jsx("dt", { children: text('filingSummaryToCheck') }), _jsx("dd", { "data-finding": totals.toCheck > 0 ? 'check' : undefined, children: totals.toCheck })] })] }), partial && _jsx("p", { children: text('filingSomeProgressUnavailable') }), (totals.toFix === null || totals.toCheck === null) && _jsx("p", { children: text('filingChecksUnavailable') })] }), groups.map(group => (_jsxs("div", { className: "fs-surface-filing__group", ...needTraceAttributes(group.needAnchors), children: [_jsx(Heading, { level: level, children: group.label }), _jsx("ul", { className: "fs-surface-filing__tasks", role: "list", children: group.rows.map(({ row, observation }) => _jsx(FilingRow, { row: row, observation: observation, largest: largest, context: context, text: text }, row.key)) })] }, group.id))), largest > 0 && _jsxs("div", { className: "fs-surface-filing__key", children: [_jsx("ul", { className: "fs-surface-filing__legend", role: "list", children: legend.map(item => _jsxs("li", { children: [_jsxs("span", { className: "fs-surface-filing__swatch", "aria-hidden": "true", children: ['filled' in item && _jsx("span", { className: "fs-surface-filing__fill" }), 'finding' in item && _jsx("span", { className: "fs-surface-filing__mark", "data-finding": item.finding })] }), text(item.key)] }, item.key)) }), _jsx("p", { children: text('filingLegendCaption') })] })] });
}
