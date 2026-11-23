import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** @filedesc Presents an authored filing task list from a batch of draft observations. */
import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { currentEffectDataSourcePorts } from './data-source-effect.js';
import { selectDataSourceRevisions } from './data-source-revision.js';
import { Heading, nextLevel } from './heading.js';
import { isPlainLinkClick } from './browser-location.js';
import { needTraceAttributes } from './need-trace.js';
import { presentedRouteLabel } from './title-presentation.js';
import { FormattedReceiptRef } from './receipt-ref.js';
const unavailable = { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } };
export function useFilingDraftObservations(slots, readSummaries, previewScope, revision, generation, draftRevision, { loader, authorize, validatePayload }, selectRevision) {
    const trackers = useMemo(() => {
        const plans = new Set();
        function visit(items) {
            for (const slot of items) {
                if (slot.slotType === 'embed-route')
                    visit(slot.slots);
                if (slot.slotType === 'filing-status')
                    plans.add(slot.tracker);
            }
        }
        visit(slots);
        return [...plans];
    }, [slots]);
    const rosters = useMemo(() => trackers.filter(plan => plan.status === 'roster'), [trackers]);
    const revisions = rosters.map(plan => selectDataSourceRevisions(plan.requests.map(request => ({
        ...request, context: { ...request.context, sessionGeneration: generation },
    })), selectRevision));
    const revisionKey = JSON.stringify(revisions.map(result => result.key));
    const visit = useMemo(() => ({ rosters, failures: revisions.map(result => new Set(result.failures.map(request => request.descriptor))) }), [rosters, revisionKey, generation, draftRevision, revision, previewScope, loader, authorize, validatePayload]);
    const [delivery, setDelivery] = useState();
    useEffect(() => {
        if (!visit.rosters.length)
            return;
        let current = true;
        const ports = currentEffectDataSourcePorts(() => current, { loader, authorize, validatePayload });
        const refused = { status: 'unresolved', reason: 'roster-unavailable' };
        void Promise.all(visit.rosters.map(async (plan, index) => {
            try {
                const failed = visit.failures[index];
                const availablePorts = failed?.size && ports.loader ? {
                    ...ports,
                    loader: (request) => failed.has(request.descriptor)
                        ? { status: 'unavailable', reason: 'The source revision is unavailable.' }
                        : ports.loader(request),
                } : ports;
                return [plan, await plan.load(availablePorts, generation)];
            }
            catch {
                return [plan, refused];
            }
        })).then(entries => { if (current)
            setDelivery({ visit, plans: new Map(entries) }); });
        return () => { current = false; };
    }, [visit]);
    const expanded = delivery?.visit === visit ? delivery.plans : undefined;
    const queries = useMemo(() => {
        const unique = new Map();
        if (rosters.length && !expanded)
            return [];
        for (const tracker of trackers) {
            const plan = expanded?.get(tracker) ?? tracker;
            if (plan.status !== 'ready')
                continue;
            for (const group of plan.groups) {
                for (const row of group.rows)
                    if (row.status === 'ready')
                        unique.set(row.query.key, row.query);
            }
        }
        return [...unique.values()];
    }, [trackers, rosters, expanded]);
    const request = useMemo(() => ({ queries, readSummaries, previewScope, generation }), [queries, readSummaries, previewScope, revision, generation, draftRevision]);
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
    const observe = (query) => {
        if (!readSummaries)
            return unavailable;
        let observation;
        if (completed?.request === request) {
            observation = completed.observations.get(query.key) ?? unavailable;
        }
        else if (completed !== undefined
            && completed.request.readSummaries === readSummaries
            && completed.request.previewScope === previewScope
            && completed.request.generation === generation
            && completed.observations.has(query.key)) {
            observation = completed.observations.get(query.key);
        }
        else {
            return { ...unavailable, draft: { status: 'loading' } };
        }
        if (!observation)
            return unavailable;
        if (query.subjectMatch !== undefined && 'subjectMatch' in observation && observation.subjectMatch === 'matched'
            && (observation.draft.status === 'denied' || observation.filing.status === 'denied')) {
            return { draft: { status: 'denied' }, filing: { status: 'unavailable' } };
        }
        return observation;
    };
    return { observe, rosters: expanded };
}
function filingLinkFor(destination, navigation) {
    if (destination === undefined)
        return undefined;
    const href = navigation?.formatHref ? navigation.formatHref(destination) : destination;
    return href === undefined ? undefined : { href, destination };
}
function FilingLink({ link, navigation, describedBy, className, style, children, ...anchorProps }) {
    if (!link)
        return _jsx("span", { className: className, style: style, role: "link", "aria-disabled": "true", "aria-describedby": describedBy, children: children });
    return _jsx("a", { ...anchorProps, className: className, style: style, href: link.href, "aria-describedby": describedBy, onClick: event => {
            if (!navigation?.navigate || !isPlainLinkClick(event))
                return;
            event.preventDefault();
            navigation.navigate(link.destination);
        }, children: children });
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
const filingLabel = {
    filed: 'filingFiled', returned: 'filingReturned', accepted: 'filingAccepted',
    'closed-without-acceptance': 'filingClosedWithoutAcceptance', reopened: 'filingReopened',
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
function observationProgress(observation) {
    if (observation.draft.status === 'current')
        return observation.draft;
    if (observation.draft.status === 'absent'
        && 'receiptRef' in observation.filing
        && (observation.filing.status === 'returned' || observation.filing.status === 'reopened')) {
        return observation.filing.progress;
    }
    return undefined;
}
function FilingRow({ row, observation, largest, context, text }) {
    const statusId = useId();
    const { draft, filing } = observation;
    const receipt = 'receiptRef' in filing ? filing : undefined;
    const activeProgress = observationProgress(observation);
    const label = row.route ? presentedRouteLabel(row.route, context?.resolveRouteTitle)
        : row.status === 'disabled' && row.routeRef;
    const status = row.status === 'disabled' ? text(refusalLabel[row.reason])
        : draft.status === 'absent' && filing.status === 'none' && row.weight > 0
            ? text('filingNotStartedWithSize', { count: String(row.weight) })
            : draft.status === 'current'
                ? text(draft.form.ready === null ? 'filingReadinessUnavailable' : draft.form.ready ? 'filingReady' : 'filingInProgress')
                : draft.status === 'absent' && filing.status !== 'none' ? text('filingUnavailable')
                    : text(observationLabel[draft.status]);
    const completedReceipt = receipt && (receipt.status === 'filed' || receipt.status === 'accepted') && draft.status !== 'current'
        ? receipt
        : undefined;
    const sections = row.status === 'ready' ? row.sections.map(section => {
        const counts = draft.status === 'absent' && filing.status === 'none' ? { filled: 0, total: section.weight, toFix: 0, toCheck: 0 }
            : activeProgress && Object.hasOwn(activeProgress.sections, section.id)
                ? activeProgress.sections[section.id] : undefined;
        const countLabels = counts
            ? [filingFillCount(counts, text), ...filingFindings(counts, text).map(finding => finding.label)]
            : completedReceipt
                ? [text(filingLabel[completedReceipt.status])]
                : [];
        return { ...section, link: filingLinkFor(section.href, context), counts, countLabels };
    }) : [];
    const segments = sections.filter(section => section.weight > 0);
    const filingState = receipt ? receipt.status
        : row.status === 'disabled' ? 'disabled'
            : draft.status === 'current' ? (draft.form.ready === null ? 'unavailable' : draft.form.ready ? 'ready' : 'in-progress')
                : draft.status;
    const receiptReferenceParts = receipt
        ? text('filingReceiptReference', { reference: '\u0000' }).split('\u0000')
        : undefined;
    return _jsxs("li", { className: "fs-surface-filing__row", "data-filing-status": filingState, ...needTraceAttributes(row.needAnchors), children: [_jsxs("div", { className: "fs-surface-filing__form", children: [label && _jsx(FilingLink, { link: row.status === 'ready' ? filingLinkFor(row.href, context) : undefined, navigation: context, describedBy: statusId, children: label }), row.description && _jsx("p", { children: row.description }), row.hint && _jsx("p", { children: row.hint })] }), sections.length > 0 && _jsxs("div", { className: "fs-surface-filing__section-nav", children: [row.status === 'ready' && segments.length > 0 && _jsx("div", { className: "fs-surface-filing__strip", "aria-hidden": "true", "data-strip-state": completedReceipt ? completedReceipt.status : undefined, style: { inlineSize: `${100 * Math.max(Math.sqrt(row.weight / largest), 0.08)}%` }, children: segments.map(({ id, label, weight, counts, countLabels, link }) => {
                            const percent = completedReceipt
                                ? 100
                                : counts && counts.total > 0 ? Math.min(100, 100 * counts.filled / counts.total) : 0;
                            const finding = sectionFinding(counts);
                            const title = countLabels.length > 0 ? `${label}: ${countLabels.join(', ')}` : label;
                            return _jsxs(FilingLink, { link: link, navigation: context, className: "fs-surface-filing__segment", style: { flexGrow: weight }, tabIndex: -1, title: title, onMouseDown: event => event.preventDefault(), children: [_jsx("span", { className: "fs-surface-filing__fill", style: { inlineSize: `${percent}%` } }), finding && _jsx("span", { className: "fs-surface-filing__mark", "data-finding": finding })] }, id);
                        }) }), _jsxs("details", { children: [_jsxs("summary", { children: [text('filingSections', { count: String(sections.length) }), label && _jsxs("span", { className: "fs-surface-visually-hidden", children: [" ", label] })] }), _jsx("ul", { className: "fs-surface-filing__sections", role: "list", children: sections.map(({ id, label, link, countLabels }) => _jsx("li", { children: _jsxs(FilingLink, { link: link, navigation: context, children: [label, countLabels.length > 0 && _jsxs("span", { className: "fs-surface-visually-hidden", children: [" ", countLabels.join(' ')] })] }) }, id)) })] })] }), _jsxs("div", { className: "fs-surface-filing__progress", children: [_jsxs("div", { id: statusId, className: "fs-surface-filing__status", "data-filing-status": filingState, children: [receipt
                                ? _jsx("span", { className: "fs-surface-filing__badge", "data-filing-status": receipt.status, children: text(filingLabel[receipt.status]) })
                                : status, receipt && draft.status === 'current' && _jsx("div", { className: "fs-surface-filing__draft-note", children: status })] }), receipt && _jsxs(_Fragment, { children: [_jsx("div", { className: "fs-surface-filing__meta", "data-receipt-ref": "", children: receiptReferenceParts && receiptReferenceParts.length === 2 ? (_jsxs(_Fragment, { children: [receiptReferenceParts[0], _jsx(FormattedReceiptRef, { reference: receipt.receiptRef }), receiptReferenceParts[1]] })) : (text('filingReceiptReference', { reference: receipt.receiptRef })) }), receipt.sample && _jsx("div", { className: "fs-surface-filing__meta", children: text(receipt.sample === 'fixture' ? 'filingFixture' : 'filingPreviewSubmit') }), receipt.review === 'unavailable' && _jsx("div", { className: "fs-surface-filing__meta", children: text('filingReviewUnavailable') }), receipt.comments.map((comment, index) => _jsx("p", { className: "fs-surface-filing__comment", children: comment }, index))] }), activeProgress && _jsxs("div", { className: "fs-surface-filing__counts", children: [_jsx("span", { children: filingFillCount(activeProgress.form, text) }), filingFindings(activeProgress.form, text).map(({ kind, label }) => (_jsx("span", { className: kind && `fs-surface-filing__${kind}`, children: label }, kind ?? 'unavailable'))), sections.some(section => section.counts === undefined) && _jsx("span", { children: text('filingSectionCountsUnavailable') })] })] })] });
}
const legend = [
    { key: 'filingAnswered', filled: true },
    { key: 'filingStillToAnswer' },
    { key: 'filingHasFix', finding: 'fix' },
    { key: 'filingHasCheck', finding: 'check' },
];
function subjectKeyString(subject) {
    if (subject === null)
        return 'null';
    return JSON.stringify([
        subject.type,
        Object.entries(subject.keys).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    ]);
}
function destinationTupleString(route, slotId, params) {
    return JSON.stringify([
        route.surfaceId,
        route.routeId,
        slotId,
        Object.entries(params).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    ]);
}
function disablePlannedRow(row, reason) {
    return {
        key: row.key,
        ...(row.hint === undefined ? {} : { hint: row.hint }),
        ...(row.description === undefined ? {} : { description: row.description }),
        needAnchors: row.needAnchors,
        status: 'disabled',
        route: row.route,
        routeRef: row.route.routeId,
        reason,
    };
}
export function FilingStatus({ plan: originalPlan, context, level, text }) {
    const plan = context?.rosters?.get(originalPlan) ?? originalPlan;
    if (plan.status === 'roster')
        return _jsx("p", { children: text('filingLoading') });
    if (plan.status === 'unresolved')
        return _jsx("p", { children: text('filingUnavailable') });
    const resolvedGroups = plan.groups.map(group => {
        let rows = group.rows.map((plannedRow) => {
            if (plannedRow.status !== 'ready') {
                return { row: plannedRow, observation: unavailable, countEligible: false };
            }
            if (plannedRow.query.subjectMatch !== undefined) {
                const raw = context?.observe(plannedRow.query) ?? unavailable;
                if (raw.draft.status === 'loading') {
                    return {
                        row: { ...plannedRow, href: undefined, sections: [] },
                        observation: { draft: { status: 'loading' }, filing: { status: 'unavailable' } },
                        countEligible: false,
                    };
                }
                if ('subjectMatch' in raw && raw.subjectMatch === 'matched' && raw.subject !== undefined) {
                    if (raw.draft.status === 'denied' || raw.filing.status === 'denied') {
                        return {
                            row: disablePlannedRow(plannedRow, 'subject-unavailable'),
                            observation: unavailable,
                            countEligible: false,
                        };
                    }
                    const links = plannedRow.resolveLinks?.(raw.subject);
                    if (!links) {
                        return {
                            row: disablePlannedRow(plannedRow, 'route-address-unavailable'),
                            observation: unavailable,
                            countEligible: false,
                        };
                    }
                    const resolvedSubject = subjectKeyString(raw.subject);
                    return {
                        row: {
                            ...plannedRow,
                            params: links.params,
                            href: links.href,
                            sections: plannedRow.sections.map(section => ({ ...section, href: links.sections[section.id] })),
                        },
                        observation: { draft: raw.draft, filing: raw.filing },
                        countEligible: true,
                        resolvedSubject,
                        destinationTuple: destinationTupleString(plannedRow.route, plannedRow.slotId, links.params),
                        unitKey: JSON.stringify([plannedRow.query.definitionUrl, resolvedSubject]),
                    };
                }
                if ('subjectMatch' in raw && (raw.subjectMatch === 'none' || raw.subjectMatch === 'ambiguous')) {
                    return {
                        row: disablePlannedRow(plannedRow, 'subject-unavailable'),
                        observation: unavailable,
                        countEligible: false,
                    };
                }
                return {
                    row: { ...plannedRow, href: undefined, sections: [] },
                    observation: {
                        draft: { status: raw.draft.status === 'denied' ? 'denied' : 'unavailable' },
                        filing: { status: 'unavailable' },
                    },
                    countEligible: false,
                };
            }
            const observation = context?.observe(plannedRow.query) ?? unavailable;
            const resolvedSubject = subjectKeyString(plannedRow.query.subject ?? null);
            return {
                row: plannedRow,
                observation,
                countEligible: true,
                resolvedSubject,
                destinationTuple: plannedRow.params !== undefined
                    ? destinationTupleString(plannedRow.route, plannedRow.slotId, plannedRow.params)
                    : undefined,
                unitKey: JSON.stringify([plannedRow.query.definitionUrl, resolvedSubject]),
            };
        });
        const groupSubjects = new Set();
        for (const entry of rows) {
            if (entry.resolvedSubject !== undefined)
                groupSubjects.add(entry.resolvedSubject);
        }
        if (groupSubjects.size > 1) {
            rows = rows.map((entry) => entry.row.status === 'ready'
                ? { row: disablePlannedRow(entry.row, 'subject-unavailable'), observation: unavailable, countEligible: false }
                : entry);
        }
        return { ...group, rows };
    });
    const seenDestinations = new Set();
    const seenRepeatGroupSubjects = new Map();
    for (const group of resolvedGroups) {
        let memberSubject;
        for (const entry of group.rows) {
            if (entry.destinationTuple !== undefined) {
                if (seenDestinations.has(entry.destinationTuple)) {
                    return _jsx("p", { children: text('filingUnavailable') });
                }
                seenDestinations.add(entry.destinationTuple);
            }
            if (entry.resolvedSubject !== undefined) {
                memberSubject ??= entry.resolvedSubject;
            }
        }
        if (group.member && memberSubject !== undefined) {
            const seenForRepeat = seenRepeatGroupSubjects.get(group.member.groupId) ?? new Set();
            if (seenForRepeat.has(memberSubject)) {
                return _jsx("p", { children: text('filingUnavailable') });
            }
            seenForRepeat.add(memberSubject);
            seenRepeatGroupSubjects.set(group.member.groupId, seenForRepeat);
        }
    }
    const unitEntries = new Map();
    const totals = { filled: 0, total: 0, toFix: null, toCheck: null };
    let known = 0;
    let completedUnits = 0;
    let partial = resolvedGroups.some(group => group.unavailable);
    let largest = 0;
    const groups = resolvedGroups.map(group => ({
        ...group,
        rows: group.rows.map(({ row, observation, unitKey, countEligible }) => {
            if (row.status === 'disabled' || !countEligible) {
                partial = true;
                return { row, observation };
            }
            largest = Math.max(largest, row.weight);
            const dedupKey = unitKey ?? row.query.key;
            const entries = unitEntries.get(dedupKey);
            if (entries)
                entries.push({ row, observation });
            else
                unitEntries.set(dedupKey, [{ row, observation }]);
            return { row, observation };
        }),
    }));
    const totalUnits = unitEntries.size;
    for (const entries of unitEntries.values()) {
        const currentComplete = entries.find(({ observation }) => {
            const progress = observationProgress(observation);
            return progress !== undefined && progress.form.toFix !== null && progress.form.toCheck !== null;
        });
        const currentAny = currentComplete ?? entries.find(({ observation }) => observationProgress(observation) !== undefined);
        const absentEntries = entries.filter(({ observation: { draft, filing } }) => draft.status === 'absent' && filing.status === 'none');
        const absentTotal = absentEntries.length > 0
            ? absentEntries.every(({ row }) => row.fieldTemplates !== undefined)
                ? new Set(absentEntries.flatMap(({ row }) => row.fieldTemplates)).size
                : Math.max(...absentEntries.map(({ row }) => row.weight))
            : undefined;
        const activeUnitProgress = currentAny ? observationProgress(currentAny.observation) : undefined;
        const counts = activeUnitProgress
            ? activeUnitProgress.form
            : absentTotal !== undefined
                ? { filled: 0, total: absentTotal, toFix: 0, toCheck: 0 }
                : undefined;
        if (counts) {
            known++;
            totals.filled += counts.filled;
            totals.total += counts.total;
            if (counts.toFix !== null)
                totals.toFix = (totals.toFix ?? 0) + counts.toFix;
            if (counts.toCheck !== null)
                totals.toCheck = (totals.toCheck ?? 0) + counts.toCheck;
        }
        const filedWithoutDraft = entries.some(({ observation: { draft, filing } }) => draft.status === 'absent' && 'receiptRef' in filing);
        const isCompletedUnit = entries.some(({ observation: { draft, filing } }) => draft.status !== 'current' && 'receiptRef' in filing && (filing.status === 'filed' || filing.status === 'accepted'));
        if (isCompletedUnit)
            completedUnits++;
        if (!filedWithoutDraft && (!counts || counts.toFix === null || counts.toCheck === null))
            partial = true;
    }
    const authoredGroups = new Map();
    for (const group of groups) {
        const id = group.member?.groupId ?? group.id;
        const section = authoredGroups.get(id) ?? { entries: [], waiting: [] };
        section.entries.push(group);
        if (group.member && group.rows.some(({ row, observation: { draft, filing } }) => row.status === 'ready'
            && filing.status === 'none' && (draft.status === 'absent' || draft.status === 'current'))) {
            section.waiting.push(group.member.label);
        }
        authoredGroups.set(id, section);
    }
    return _jsxs("div", { className: "fs-surface-filing", ...needTraceAttributes(plan.needAnchors), children: [(known > 0 || completedUnits > 0) && _jsxs("div", { className: "fs-surface-filing__totals", children: [_jsxs("dl", { children: [known > 0 && _jsxs("div", { children: [_jsx("dt", { children: text('filingAnswered') }), _jsx("dd", { children: text('filingSummaryAnswered', { filled: String(totals.filled), total: String(totals.total) }) })] }), completedUnits > 0 && _jsxs("div", { children: [_jsx("dt", { children: text('filingFiled') }), _jsx("dd", { "data-filing-completed": "", children: text('filingSummaryAnswered', { filled: String(completedUnits), total: String(totalUnits) }) })] }), totals.toFix !== null && _jsxs("div", { children: [_jsx("dt", { children: text('filingSummaryToFix') }), _jsx("dd", { "data-finding": totals.toFix > 0 ? 'fix' : undefined, children: totals.toFix })] }), totals.toCheck !== null && _jsxs("div", { children: [_jsx("dt", { children: text('filingSummaryToCheck') }), _jsx("dd", { "data-finding": totals.toCheck > 0 ? 'check' : undefined, children: totals.toCheck })] })] }), partial && _jsx("p", { children: text('filingSomeProgressUnavailable') }), known > 0 && (totals.toFix === null || totals.toCheck === null) && _jsx("p", { children: text('filingChecksUnavailable') })] }), largest > 0 && _jsxs("div", { className: "fs-surface-filing__key", children: [_jsx("ul", { className: "fs-surface-filing__legend", role: "list", children: legend.map(item => _jsxs("li", { children: [_jsxs("span", { className: "fs-surface-filing__swatch", "aria-hidden": "true", children: ['filled' in item && _jsx("span", { className: "fs-surface-filing__fill" }), 'finding' in item && _jsx("span", { className: "fs-surface-filing__mark", "data-finding": item.finding })] }), text(item.key)] }, item.key)) }), _jsx("p", { children: text('filingLegendCaption') })] }), [...authoredGroups].map(([id, { entries, waiting }]) => {
                const first = entries[0];
                return _jsxs("div", { className: "fs-surface-filing__group", ...needTraceAttributes(first.needAnchors), children: [_jsx(Heading, { level: level, children: first.label }), first.member && waiting.length > 0 && _jsxs("div", { "data-state": "waiting-on-named-members", children: [_jsx("p", { children: first.member.waitingLabel }), _jsx("ul", { "aria-label": first.member.waitingLabel, children: waiting.map((name, index) => _jsx("li", { children: name }, index)) })] }), entries.map(group => _jsxs(Fragment, { children: [group.member && _jsx(Heading, { level: nextLevel(level), children: group.member.label }), group.unavailable && _jsx("p", { children: text('filingUnavailable') }), !group.unavailable && group.rows.length === 0 && (_jsx("p", { className: "fs-surface-filing__empty", children: "None added yet." })), group.rows.length > 0 && _jsx("ul", { className: "fs-surface-filing__tasks", role: "list", children: group.rows.map(({ row, observation }) => _jsx(FilingRow, { row: row, observation: observation, largest: largest, context: context, text: text }, row.key)) })] }, group.id))] }, id);
            })] });
}
