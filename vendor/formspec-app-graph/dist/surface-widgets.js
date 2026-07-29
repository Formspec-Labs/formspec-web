/** @filedesc Shared extraction for qualified Surface module-widget bindings. */
import { resolveWidgetContribution, } from './widget-contribution.js';
export function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
export function stringProp(value, key) {
    const candidate = ownProp(value, key);
    return typeof candidate === 'string' ? candidate : undefined;
}
export function ownProp(value, key) {
    return value && Object.prototype.hasOwnProperty.call(value, key)
        ? value[key]
        : undefined;
}
export function recordArray(value) {
    if (!Array.isArray(value))
        return [];
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index))
            continue;
        const item = record(value[index]);
        if (item)
            items.push(item);
    }
    return items;
}
export function handlesByKind(handles, artifactKind) {
    return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}
export function registryWidgetEntries(context) {
    return handlesByKind(context.handles, 'registry').flatMap((registry) => recordArray(ownProp(record(registry.document), 'entries')).flatMap((entry, entryIndex) => {
        const name = stringProp(entry, 'name');
        const category = stringProp(entry, 'category');
        if (!name || !category)
            return [];
        const contributesValue = ownProp(entry, 'contributes');
        const contributes = Array.isArray(contributesValue)
            ? contributesValue.filter((value) => typeof value === 'string')
            : undefined;
        return [{
                ...entry,
                name,
                category,
                ...(contributes ? { contributes } : {}),
                registry,
                entryIndex,
            }];
    }));
}
export function surfaceWidgetSlots(surface) {
    const surfaceRef = typeof surface.ref?.url === 'string' ? surface.ref.url : undefined;
    return recordArray(ownProp(record(surface.document), 'routes')).flatMap((route, routeIndex) => recordArray(ownProp(route, 'slots')).flatMap((slot, slotIndex) => {
        if (stringProp(slot, 'slotType') !== 'module-widget')
            return [];
        const binding = record(ownProp(slot, 'binding'));
        const moduleId = stringProp(binding, 'moduleId');
        const widgetName = stringProp(binding, 'widgetName');
        if (!binding || !moduleId || !widgetName)
            return [];
        return [{
                surface,
                ...(surfaceRef ? { surfaceRef } : {}),
                route,
                routeIndex,
                ...(stringProp(route, 'id') ? { routeId: stringProp(route, 'id') } : {}),
                slot,
                slotIndex,
                ...(stringProp(slot, 'id') ? { slotId: stringProp(slot, 'id') } : {}),
                binding,
                moduleId,
                widgetName,
            }];
    }));
}
export function resolvedWidgetContribution(context, widget) {
    return resolvedWidgetContributionFromEntries(widget, registryWidgetEntries(context));
}
export function resolvedWidgetContributionFromEntries(widget, entries) {
    return resolveWidgetContribution({ moduleId: widget.moduleId, widgetName: widget.widgetName }, entries);
}
export function moduleIsAdmitted(context, moduleId) {
    return context.moduleResolution?.modules.some((entry) => entry.ref.id === moduleId && entry.status === 'admitted') ?? false;
}
export function widgetShape(entry) {
    return record(ownProp(entry, 'widgetShape'));
}
export function escapeJsonPointerToken(token) {
    return token.replace(/~/g, '~0').replace(/\//g, '~1');
}
