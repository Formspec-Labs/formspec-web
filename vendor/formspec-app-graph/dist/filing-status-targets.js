import { parseRouteSubjectKey } from './surface-definition-slots.js';
import { diagnosticSourceForHandle } from './report.js';
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value : undefined;
}
/** Walk entries by their authored owner. Used for reverse references in editors. */
export function filingStatusEntries(binding) {
    const groups = record(binding)?.groups;
    if (!Array.isArray(groups))
        return [];
    return groups.flatMap((group) => {
        const entries = record(group)?.forms;
        if (!Array.isArray(entries))
            return [];
        return entries.flatMap((value) => {
            const entry = record(value);
            return typeof entry?.routeRef === 'string' && typeof entry.slotRef === 'string'
                ? [{ routeRef: entry.routeRef, slotRef: entry.slotRef }] : [];
        });
    });
}
/**
 * Validate exact local targets and bind their parameters. A caller supplying
 * current params also checks for collisions that can only appear at runtime.
 */
export function resolveFilingStatusTargets(routes, source, binding, currentParams) {
    const issues = [];
    const authored = record(binding)?.groups;
    if (!Array.isArray(authored) || authored.length === 0) {
        return { groups: [], issues: [{ pointer: '', reason: 'invalid-binding' }] };
    }
    const groupIds = new Set();
    const targetKeys = new Set();
    const sourceParams = new Set(source.params?.map(param => param.name));
    const groups = authored.flatMap((value, groupIndex) => {
        const groupPointer = `/groups/${groupIndex}`;
        const group = record(value);
        if (!group || typeof group.id !== 'string' || typeof group.label !== 'string'
            || !Array.isArray(group.forms) || group.forms.length === 0) {
            issues.push({ pointer: groupPointer, reason: 'invalid-binding' });
            return [];
        }
        if (groupIds.has(group.id))
            issues.push({ pointer: groupPointer, reason: 'duplicate-group' });
        groupIds.add(group.id);
        const targets = [];
        group.forms.forEach((entry, index) => {
            const pointer = `${groupPointer}/forms/${index}`;
            const refuse = (reason) => issues.push({ pointer, reason });
            if (!record(entry) || typeof entry.routeRef !== 'string' || typeof entry.slotRef !== 'string') {
                refuse('invalid-binding');
                return;
            }
            const matches = routes.filter(route => route.id === entry.routeRef);
            const route = matches.length === 1 ? matches[0] : undefined;
            if (!route) {
                refuse('route-unresolved');
                return;
            }
            const slots = route.slots.filter(slot => slot.id === entry.slotRef);
            const slot = slots.length === 1 ? slots[0] : undefined;
            if (slot?.slotType !== 'definition-form') {
                refuse('slot-unresolved');
                return;
            }
            const names = (route.params ?? []).map(param => param.name).sort();
            const sources = entry.params === undefined ? {} : record(entry.params);
            const parameters = names.map(name => {
                const parameter = sources && Object.prototype.hasOwnProperty.call(sources, name) ? record(sources[name]) : undefined;
                if (parameter && Object.keys(parameter).length === 1) {
                    if (Object.prototype.hasOwnProperty.call(parameter, 'value') && typeof parameter.value === 'string' && parameter.value !== '') {
                        return { value: parameter.value };
                    }
                    if (typeof parameter.routeParam === 'string' && sourceParams.has(parameter.routeParam)) {
                        if (currentParams === undefined)
                            return { routeParam: parameter.routeParam };
                        const resolved = Object.prototype.hasOwnProperty.call(currentParams, parameter.routeParam) ? currentParams[parameter.routeParam] : undefined;
                        if (typeof resolved === 'string' && resolved !== '')
                            return { value: resolved };
                    }
                }
                return undefined;
            });
            if (!sources || Object.keys(sources).length !== names.length || parameters.some(param => param === undefined)) {
                refuse('invalid-parameters');
                return;
            }
            const key = JSON.stringify([route.id, slot.id, parameters]);
            if (targetKeys.has(key)) {
                refuse('duplicate-target');
                return;
            }
            targetKeys.add(key);
            targets.push({ entry, route, slot, pointer, params: Object.fromEntries(names.flatMap((name, i) => typeof parameters[i]?.value === 'string' ? [[name, parameters[i].value]] : [])) });
        });
        return [{ group, pointer: groupPointer, targets }];
    });
    return { groups, issues };
}
function subjectSourceIdentity(target, definition) {
    const document = record(definition);
    if (!document)
        return undefined;
    const subject = record(document.subject);
    if (!subject)
        return 'implicit-respondent';
    const keys = record(subject.keys);
    const mapping = record(record(target.slot.binding)?.subjectKeys);
    if (!keys || (!mapping && Object.keys(keys).length))
        return undefined; // Definition-form validation owns incomplete subjectKeys.
    const sources = [];
    for (const key of Object.keys(keys).sort()) {
        const param = mapping?.[key];
        const source = typeof param === 'string' && Object.prototype.hasOwnProperty.call(target.entry.params ?? {}, param)
            ? target.entry.params?.[param] : undefined;
        const dataType = record(keys[key])?.dataType;
        const value = source && 'value' in source ? source.value : undefined;
        if (value !== undefined && parseRouteSubjectKey(dataType, value) === undefined)
            return false;
        sources.push([key, dataType, value === undefined ? source : ['value', value]]);
    }
    return JSON.stringify([subject.type, sources]);
}
export function validateFilingStatusTargets(context) {
    const diagnostics = [];
    const definitions = new Map(context.handles
        .filter(handle => handle.artifactKind === 'definition' && handle.status === 'loaded')
        .map(handle => [handle.ref?.url, handle.document]));
    for (const handle of context.handles) {
        const surface = record(handle.document);
        if (handle.artifactKind !== 'surface' || handle.status !== 'loaded'
            || surface?.$formspecSurface !== '0.4' || !Array.isArray(surface.routes))
            continue;
        const routes = surface.routes;
        routes.forEach((route, routeIndex) => route.slots.forEach((slot, slotIndex) => {
            if (slot.slotType !== 'filing-status')
                return;
            const resolved = resolveFilingStatusTargets(routes, route, slot.binding);
            const report = ({ pointer, reason }) => diagnostics.push({
                code: 'APP-GRAPH-FILING-STATUS-TARGET', severity: 'error', origin: 'app-graph-validator',
                phase: 'cross-artifact',
                message: `Filing-status slot '${slot.id}' cannot resolve its forms (${reason}).`,
                primarySource: diagnosticSourceForHandle(handle, `/routes/${routeIndex}/slots/${slotIndex}/binding${pointer}`),
                details: { reason },
            });
            resolved.issues.forEach(report);
            for (const { targets } of resolved.groups) {
                let subjectMapping;
                for (const target of targets) {
                    const definitionRef = record(target.slot.binding)?.definitionRef;
                    const mapping = typeof definitionRef === 'string'
                        ? subjectSourceIdentity(target, definitions.get(definitionRef)) : undefined;
                    if (mapping === false) {
                        report({ pointer: target.pointer, reason: 'invalid-subject-value' });
                        continue;
                    }
                    if (mapping === undefined)
                        continue;
                    subjectMapping ?? (subjectMapping = mapping);
                    if (subjectMapping !== mapping)
                        report({ pointer: target.pointer, reason: 'mixed-subject-mappings' });
                }
            }
        }));
    }
    return diagnostics;
}
