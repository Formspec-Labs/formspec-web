/** @filedesc Counts the live evaluated instances, findings and owed warning follow-ups once for progress consumers. */
import { validationResultIdentity } from '@formspec-org/types';
import { placementCovers, placementKey } from './page-sequence.js';
import { readValidationSummaryRows, summaryRowWording } from './validation-summary.js';
function addPlacements(owners, paths, section) {
    for (const placement of paths) {
        const key = placementKey(placement);
        const entries = owners.get(key);
        const entry = { placement, section };
        if (entries)
            entries.push(entry);
        else
            owners.set(key, [entry]);
    }
}
function owner(owners, path) {
    const entries = owners.get(placementKey(path));
    if (!entries)
        return undefined;
    const exact = entries.find(({ placement }) => placementCovers(placement, path));
    if (exact !== undefined)
        return exact.section;
    if (path === placementKey(path) && entries.length === 1)
        return entries[0].section;
    return undefined;
}
function freshCounts(reportAvailable) {
    return {
        total: 0, filled: 0, prefilled: 0, missing: 0, missingReadonly: 0, toFix: reportAvailable ? 0 : null,
        toCheck: reportAvailable ? 0 : null, followUps: 0, valid: reportAvailable ? 0 : null, required: 0,
        requiredFilled: 0,
    };
}
function groupOwner(owners, path) {
    let candidate = path;
    while (candidate) {
        const direct = owner(owners, candidate);
        if (direct !== undefined)
            return direct;
        const parent = candidate.replace(/(?:\[(?:\d+|\*)\]|\.?[^.[\]]+)$/, '');
        if (parent === candidate)
            return undefined;
        candidate = parent;
    }
    return undefined;
}
function countField(counts, field, hasError) {
    if (field.required) {
        counts.required++;
        if (field.empty) {
            counts.missing++;
            if (field.readonly)
                counts.missingReadonly++;
        }
        else {
            counts.requiredFilled++;
        }
    }
    if (field.readonly) {
        if (!field.empty)
            counts.prefilled++;
        return;
    }
    counts.total++;
    if (!field.empty)
        counts.filled++;
    if (!hasError && counts.valid !== null)
        counts.valid++;
}
const instanceKey = (shapeId, path) => JSON.stringify([shapeId, path]);
/** The answer a Core §5.3.1 explanation error asks for; the Submit report carries it beside the warning. */
function explanationErrorFollowUp(result) {
    if (result.constraintKind !== 'explanation' || result.severity !== 'error')
        return undefined;
    if (result.shapeId)
        return { kind: 'instance', shapeId: result.shapeId, path: result.path };
    const code = result.context && 'code' in result.context ? result.context.code : undefined;
    return typeof code === 'string' ? { kind: 'group', code, paths: [] } : undefined;
}
/** Whether an answer covers this warning firing: its own instance, or a group naming its code, Shape and path. */
function answersWarning(answers, result) {
    if (result.severity !== 'warning' || result.constraintKind !== 'shape' || result.source === 'external')
        return false;
    if (result.shapeId && answers.instances.has(instanceKey(result.shapeId, result.path)))
        return true;
    const group = result.code === undefined ? undefined : answers.groups.get(result.code);
    if (group === undefined)
        return false;
    return group === null || (result.shapeId !== undefined && group.shapeIds.has(result.shapeId) && group.paths.has(result.path));
}
/**
 * Split the warning answers into owed and current. The explanation state names both in every validation
 * profile; a Submit report also names each owed one as an explanation error. Either way it is one answer.
 */
function readWarningAnswers(results, explanationState) {
    const owed = new Map();
    const owedAnswers = { instances: new Set(), groups: new Map() };
    const currentAnswers = { instances: new Set(), groups: new Map() };
    const stateGroups = new Map();
    for (const { shapeId, path, current } of explanationState?.instances ?? []) {
        const key = instanceKey(shapeId, path);
        (current ? currentAnswers : owedAnswers).instances.add(key);
        if (!current)
            owed.set(`instance:${key}`, { kind: 'instance', shapeId, path });
    }
    for (const { code, shapeIds, paths, current } of explanationState?.groups ?? []) {
        const coverage = { shapeIds: new Set(shapeIds), paths: new Set(paths) };
        stateGroups.set(code, { paths, coverage });
        (current ? currentAnswers : owedAnswers).groups.set(code, coverage);
        if (!current)
            owed.set(`group:${code}`, { kind: 'group', code, paths: [...paths] });
    }
    for (const result of results) {
        const followUp = explanationErrorFollowUp(result);
        if (followUp?.kind === 'instance') {
            const key = instanceKey(followUp.shapeId, followUp.path);
            if (owed.has(`instance:${key}`))
                continue;
            owed.set(`instance:${key}`, followUp);
            owedAnswers.instances.add(key);
        }
        else if (followUp?.kind === 'group' && !owed.has(`group:${followUp.code}`)) {
            // The state may read a later clock and call the group current; its coverage still holds.
            const known = stateGroups.get(followUp.code);
            owed.set(`group:${followUp.code}`, { ...followUp, paths: [...(known?.paths ?? [])] });
            owedAnswers.groups.set(followUp.code, known?.coverage ?? null);
        }
    }
    return { owed: [...owed.values()], owedAnswers, currentAnswers };
}
/** Whether a warning Shape asks for an answer (Core §5.2.1), which only the explanation state reports outside Submit. */
export function declaresWarningFollowUps({ shapes, warningExplanation }) {
    return (shapes ?? []).some(shape => shape.severity === 'warning' && (shape.explanation ?? warningExplanation ?? 'none') !== 'none');
}
/**
 * Merge Submit-timing Shape results from a paused Submit evaluation into a live `EvaluatedFormState`
 * so the Workspace Findings margin matches the form-status tracker before and after Submit (including
 * Submit-timing errors and `none`-mode Submit-timing warnings) while keeping live field flags fresh
 * on every keystroke and avoiding duplicate raw rows for explanation-covered Submit-timing warnings.
 */
export function mergeSubmitTimingFindings(liveState, submitState, submitShapeIds, explanationState) {
    if (!submitState || !liveState.report || !submitState.report || submitShapeIds.size === 0) {
        return liveState;
    }
    const liveRelevant = new Map(liveState.fields.map(field => [field.path, field.relevant]));
    const submitFieldPaths = new Set(submitState.fields.map(field => field.path));
    const seen = new Set(liveState.report.results.map(validationResultIdentity));
    const coveredInstances = new Set();
    const coveredGroups = new Map();
    for (const { shapeId, path } of explanationState?.instances ?? []) {
        coveredInstances.add(instanceKey(shapeId, path));
    }
    for (const { code, shapeIds, paths } of explanationState?.groups ?? []) {
        coveredGroups.set(code, { shapeIds: new Set(shapeIds), paths: new Set(paths) });
    }
    const added = [];
    for (const result of submitState.report.results) {
        if (result.constraintKind !== 'shape' || result.source === 'external')
            continue;
        if (!result.shapeId || !submitShapeIds.has(result.shapeId))
            continue;
        if (liveRelevant.get(result.path) === false)
            continue;
        if (submitFieldPaths.has(result.path) && !liveRelevant.has(result.path))
            continue;
        if (result.severity === 'warning') {
            if (coveredInstances.has(instanceKey(result.shapeId, result.path)))
                continue;
            const group = result.code === undefined ? undefined : coveredGroups.get(result.code);
            if (group && group.shapeIds.has(result.shapeId) && group.paths.has(result.path))
                continue;
        }
        const identity = validationResultIdentity(result);
        if (seen.has(identity))
            continue;
        seen.add(identity);
        added.push(result);
    }
    if (added.length === 0)
        return liveState;
    return {
        fields: liveState.fields,
        report: {
            ...liveState.report,
            valid: liveState.report.valid && added.every(result => result.severity !== 'error'),
            results: [...liveState.report.results, ...added],
        },
    };
}
/**
 * Count one evaluation for progress. `explanationState` is the engine's explanation state, or `null` where
 * no warning asks for an answer: without it an answered follow-up is counted again as its warnings.
 */
export function summarizeFormProgress(sectionPlan, state, explanationState, options) {
    const fieldOwners = new Map();
    const groupOwners = new Map();
    const hasReport = state.report !== null;
    const form = freshCounts(hasReport);
    const sections = sectionPlan.map(({ id, fields, groups }, index) => {
        addPlacements(fieldOwners, fields, index);
        addPlacements(groupOwners, groups, index);
        return { id, counts: freshCounts(hasReport), filled: false };
    });
    const surfacedRequired = options?.surfacedRequiredPaths;
    const results = state.report?.results ?? [];
    const { owed, owedAnswers, currentAnswers } = readWarningAnswers(results, explanationState);
    const relevant = new Map(state.fields.filter(field => field.relevant).map(field => [field.path, field]));
    const errorPaths = new Set();
    const findings = [];
    const seen = new Set();
    for (const result of results) {
        // Counted once below as the follow-up the respondent owes.
        if (explanationErrorFollowUp(result) || answersWarning(owedAnswers, result))
            continue;
        const { path, severity } = result;
        if (severity === 'error')
            errorPaths.add(path);
        const field = relevant.get(path);
        const fieldSection = owner(fieldOwners, path);
        const section = fieldSection ?? groupOwner(groupOwners, path);
        const identity = validationResultIdentity(result);
        if (seen.has(identity))
            continue;
        seen.add(identity);
        const isExplained = answersWarning(currentAnswers, result);
        const isMissingRequired = severity === 'error'
            && result.constraintKind === 'required'
            && Boolean(field?.required && field.empty);
        const isUntouchedRequired = isMissingRequired && !(surfacedRequired === 'all' || surfacedRequired?.has(path));
        findings.push({
            identity,
            sectionId: section === undefined ? undefined : sections[section].id,
            formLevel: section === undefined,
            ...(isExplained ? { explained: true } : {}),
            ...(isMissingRequired ? { missingRequired: true } : {}),
            ...(isUntouchedRequired ? { untouchedRequired: true } : {}),
            result,
        });
        if (severity !== 'error' && severity !== 'warning')
            continue;
        if (isExplained)
            continue;
        if (isUntouchedRequired)
            continue;
        const counter = severity === 'error' ? 'toFix' : 'toCheck';
        form[counter] = (form[counter] ?? 0) + 1;
        if (section !== undefined) {
            const counts = sections[section].counts;
            counts[counter] = (counts[counter] ?? 0) + 1;
        }
    }
    const followUps = [];
    for (const body of owed) {
        const section = body.kind === 'instance'
            ? owner(fieldOwners, body.path) ?? groupOwner(groupOwners, body.path)
            : undefined;
        const sectionId = section === undefined ? undefined : sections[section].id;
        followUps.push({ ...body, ...(sectionId === undefined ? {} : { sectionId }), formLevel: section === undefined });
        for (const counts of section === undefined ? [form] : [form, sections[section].counts]) {
            counts.followUps++;
            if (counts.toCheck !== null)
                counts.toCheck++;
        }
    }
    for (const [path, field] of relevant) {
        const hasError = errorPaths.has(path);
        countField(form, field, hasError);
        const section = owner(fieldOwners, path);
        if (section !== undefined)
            countField(sections[section].counts, field, hasError);
    }
    const ready = form.missing > 0 || form.followUps > 0 ? false : (state.report === null ? null : state.report.valid);
    for (const section of sections) {
        section.filled = section.counts.filled === section.counts.total;
    }
    return { form: { ...form, ready }, sections, findings, followUps };
}
export function pageProgressIssue(counts) {
    if (counts.missing > counts.missingReadonly)
        return 'required';
    if (counts.toFix === null)
        return 'unavailable';
    // An owed follow-up blocks Submit like an error, though it is counted to check.
    if (counts.toFix || counts.followUps)
        return 'invalid';
    if (counts.filled < counts.total)
        return 'empty';
    if (counts.missingReadonly)
        return 'blocked-readonly';
    return undefined;
}
export function readFormProgressFindingRows(summary, source) {
    const byIdentity = new Map(summary.findings.map(finding => [finding.identity, finding]));
    const rows = readValidationSummaryRows({ source: 'live', showFieldErrors: true, jumpLinks: true, dedupe: false }, { ...source, submitted: null, touched: true, live: () => summary.findings.map(finding => finding.result) }, {
        showFieldErrorsByDefault: true,
        path: result => byIdentity.get(validationResultIdentity(result))?.formLevel ? '' : result.path,
    });
    return rows.map(row => {
        const { sectionId, explained, missingRequired, untouchedRequired, result } = byIdentity.get(row.identity);
        return {
            ...row,
            sectionId,
            code: result.code,
            ...(explained ? { explained: true } : {}),
            ...(missingRequired ? { missingRequired: true } : {}),
            ...(untouchedRequired ? { untouchedRequired: true } : {}),
            resultPath: result.path,
        };
    });
}
/** One row per owed follow-up, worded like a finding row; `message` words the warning or the group. */
export function readFormProgressFollowUpRows(summary, source) {
    return summary.followUps.map(followUp => {
        const resultPath = followUp.kind === 'instance' ? followUp.path : '#';
        const path = followUp.formLevel ? '' : resultPath;
        const message = source.message(followUp);
        return {
            identity: JSON.stringify(followUp.kind === 'instance'
                ? ['follow-up', followUp.shapeId, followUp.path] : ['follow-up', followUp.code]),
            severity: 'warning',
            path,
            formLevel: followUp.formLevel,
            message,
            ...summaryRowWording(source, path, message, true),
            ...(followUp.sectionId === undefined ? {} : { sectionId: followUp.sectionId }),
            ...(followUp.kind === 'group' ? { code: followUp.code } : {}),
            resultPath,
            followUp,
        };
    });
}
