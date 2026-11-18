/** @filedesc Counts the live evaluated instances and findings once for form progress consumers. */
import { validationResultIdentity } from '@formspec-org/types';
import { placementCovers, placementKey } from './page-sequence.js';
import { readValidationSummaryRows } from './validation-summary.js';
/** Attach unkeyed fragments to adjacent identified sections without changing their order. */
export function workspaceSections(plan) {
    const sections = [];
    let leading = [];
    function append(section, fragment) {
        section.nodes.push(...fragment.nodes);
        section.fields.push(...fragment.fields);
        section.fieldTemplates.push(...fragment.fieldTemplates);
        section.groups.push(...fragment.groups);
    }
    for (const fragment of plan) {
        if (fragment.id === undefined) {
            const previous = sections[sections.length - 1];
            if (previous)
                append(previous, fragment);
            else
                leading.push(fragment);
        }
        else {
            const section = { ...fragment, nodes: [], fields: [], fieldTemplates: [], groups: [] };
            for (const entry of leading)
                append(section, entry);
            leading = [];
            append(section, fragment);
            sections.push(section);
        }
    }
    if (leading.length) {
        const section = {
            container: leading[0].container, nodes: [], fields: [], fieldTemplates: [], groups: [],
        };
        for (const entry of leading)
            append(section, entry);
        sections.push(section);
    }
    return sections;
}
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
    return owners.get(placementKey(path))?.find(({ placement }) => placementCovers(placement, path))?.section;
}
function freshCounts(reportAvailable) {
    return {
        total: 0, filled: 0, prefilled: 0, missing: 0, missingReadonly: 0, toFix: reportAvailable ? 0 : null,
        toCheck: reportAvailable ? 0 : null, valid: reportAvailable ? 0 : null, required: 0,
        requiredFilled: 0,
    };
}
function groupOwner(owners, path) {
    let candidate = path;
    while (candidate) {
        const direct = owner(owners, candidate);
        if (direct !== undefined)
            return direct;
        const parent = candidate.replace(/(?:\[\d+\]|\.?[^.[\]]+)$/, '');
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
export function summarizeFormProgress(sectionPlan, state) {
    const fieldOwners = new Map();
    const groupOwners = new Map();
    const plan = workspaceSections(sectionPlan);
    const hasReport = state.report !== null;
    const form = freshCounts(hasReport);
    const sections = plan.map(({ id, fields, groups }, index) => {
        addPlacements(fieldOwners, fields, index);
        addPlacements(groupOwners, groups, index);
        return { id, counts: freshCounts(hasReport), filled: false };
    });
    const relevant = new Map(state.fields.filter(field => field.relevant).map(field => [field.path, field]));
    const errorPaths = new Set();
    const findings = [];
    const seen = new Set();
    for (const result of state.report?.results ?? []) {
        const { path, severity } = result;
        if (severity === 'error')
            errorPaths.add(path);
        const field = relevant.get(path);
        const fieldSection = field ? owner(fieldOwners, path) : undefined;
        const section = fieldSection ?? groupOwner(groupOwners, path);
        const identity = validationResultIdentity(result);
        if (seen.has(identity))
            continue;
        seen.add(identity);
        findings.push({ identity, sectionId: section === undefined ? undefined : sections[section].id,
            formLevel: section === undefined, result });
        if (severity !== 'error' && severity !== 'warning')
            continue;
        if (severity === 'error' && result.constraintKind === 'required' && field?.required && field.empty)
            continue;
        const counter = severity === 'error' ? 'toFix' : 'toCheck';
        form[counter] = (form[counter] ?? 0) + 1;
        if (section !== undefined) {
            const counts = sections[section].counts;
            counts[counter] = (counts[counter] ?? 0) + 1;
        }
    }
    for (const [path, field] of relevant) {
        const hasError = errorPaths.has(path);
        countField(form, field, hasError);
        const section = owner(fieldOwners, path);
        if (section !== undefined)
            countField(sections[section].counts, field, hasError);
    }
    const ready = form.missing > 0 ? false : (state.report === null ? null : state.report.valid);
    for (const section of sections) {
        section.filled = section.counts.filled === section.counts.total;
    }
    return { form: { ...form, ready }, sections, findings };
}
export function pageProgressIssue(counts) {
    if (counts.missing > counts.missingReadonly)
        return 'required';
    if (counts.toFix === null)
        return 'unavailable';
    if (counts.toFix)
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
        const { sectionId, result } = byIdentity.get(row.identity);
        return { ...row, sectionId, code: result.code, resultPath: result.path };
    });
}
