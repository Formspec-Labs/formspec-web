/** @filedesc Plans exact filing-status destinations and section links without opening forms. */
import { resolveFilingStatusTargets } from '@formspec-org/app-graph';
import { resolvePageSequence, workspaceSections } from '@formspec-org/layout';
import { matchRoute, routeHref } from './composition.js';
import { generationNeedAnchors } from './need-trace.js';
function subjectIdentity(subject) {
    return subject ? [subject.type, Object.entries(subject.keys).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)] : null;
}
function formHref(path, slot, section) {
    const query = new URLSearchParams({ slot });
    if (section !== undefined)
        query.set('section', section);
    return `${path}?${query}`;
}
export function planFilingStatus(input) {
    const { handle, app } = input;
    const unresolved = (reason) => ({ status: 'unresolved', reason });
    if (handle.surface.$formspecSurface !== '0.4')
        return unresolved('surface-version-unsupported');
    const result = resolveFilingStatusTargets(handle.surface.routes, input.bindingRoute, input.binding, input.params);
    const duplicate = result.issues.find(issue => issue.reason === 'duplicate-group' || issue.reason === 'duplicate-target');
    if (duplicate)
        return unresolved(duplicate.reason);
    if (!result.groups.length)
        return unresolved('invalid-binding');
    const issues = new Map(result.issues.map(issue => [issue.pointer, issue.reason]));
    const groups = [];
    for (const { group, pointer, targets } of result.groups) {
        const byPointer = new Map(targets.map(target => [target.pointer, target]));
        let groupSubject;
        const rows = group.forms.map((entry, index) => {
            const key = `${pointer}/forms/${index}`;
            const common = { key, ...(typeof entry?.hint === 'string' ? { hint: entry.hint } : {}), needAnchors: generationNeedAnchors(entry) };
            const disabled = (reason, route) => ({
                ...common, status: 'disabled', reason, ...(route ? { route } : {}),
                routeRef: typeof entry?.routeRef === 'string' ? entry.routeRef : '',
            });
            const target = byPointer.get(key);
            if (!target) {
                const issue = issues.get(key);
                return disabled(issue === 'slot-unresolved' ? issue : issue === 'invalid-binding' ? issue : 'route-address-unavailable');
            }
            const { route, slot, params } = target;
            const destination = app.routes.find(candidate => candidate.surface === handle.surface && candidate.route === route);
            if (!destination)
                return disabled('route-address-unavailable');
            const link = routeHref(destination, params);
            if (link.refusal || matchRoute(app, link.href).match?.handle !== destination)
                return disabled('route-address-unavailable', destination);
            const binding = slot.binding;
            const definition = typeof binding?.definitionRef === 'string' ? input.definitions.get(binding.definitionRef) : undefined;
            if (!definition)
                return disabled('definition-unresolved', destination);
            const subject = input.resolveSubject(definition, binding, route, params);
            if (subject === false)
                return disabled('subject-unavailable', destination);
            const identity = subjectIdentity(subject);
            const resolvedSubject = JSON.stringify(identity);
            groupSubject ??= resolvedSubject;
            if (groupSubject !== resolvedSubject)
                return disabled('subject-unavailable', destination);
            const theme = input.themeAuthority.grantFor(route, {
                surfaceId: destination.surfaceId, routeId: destination.routeId,
            }).themeDocument;
            const component = input.resolveDefinitionComponent?.({
                surfaceRef: input.surfaceRef, routeId: route.id, slotId: slot.id, definition,
            });
            const sequence = workspaceSections(resolvePageSequence(definition, {
                ...(theme ? { theme } : {}), ...(component ? { component } : {}),
            }));
            const sections = sequence.map(({ id, fields }) => ({ ...(id === undefined ? {} : { id }), fields }));
            const queryKey = JSON.stringify([definition.url, definition.version, identity, sections]);
            const segments = sequence.flatMap(({ id, title, titleBind, titleLocaleKey, fieldTemplates }) => {
                if (id === undefined)
                    return [];
                const localeKey = titleBind === undefined ? titleLocaleKey : `${titleBind}.label`;
                const localized = localeKey === undefined ? null : input.resolveDefinitionLocaleString?.(definition, localeKey);
                return [{ id, label: localized ?? title ?? id, href: formHref(link.href, slot.id, id), weight: fieldTemplates.length }];
            });
            const description = input.resolveDefinitionLocaleString?.(definition, '$form.description') ?? definition.description;
            return {
                ...common,
                status: 'ready',
                route: destination,
                ...(description === undefined ? {} : { description }),
                href: formHref(link.href, slot.id),
                query: { key: queryKey, definitionUrl: definition.url, definitionVersion: definition.version, ...(subject ? { subject } : {}), sections },
                sections: segments,
                weight: segments.reduce((sum, section) => sum + section.weight, 0),
            };
        });
        groups.push({ id: group.id, label: group.label, needAnchors: generationNeedAnchors(group), rows });
    }
    return { status: 'ready', groups, needAnchors: generationNeedAnchors(input.binding) };
}
