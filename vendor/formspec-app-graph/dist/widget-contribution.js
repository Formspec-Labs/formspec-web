/** @filedesc Shared Registry identity lookup for Surface module widgets. */
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
/**
 * Resolve one Surface widget name through the named module's `contributes[]`.
 *
 * Module scoping is part of the identity. A widget entry with the same
 * `widgetShape.widgetName` cannot satisfy a different module, and a Registry
 * contribution id cannot stand in for the Surface widget name unless the two
 * strings genuinely coincide.
 */
export function resolveWidgetContribution(identity, entries) {
    const matches = new Set();
    const matchingModules = new Set();
    for (const moduleEntry of entries) {
        if (!own(moduleEntry, 'name') || !own(moduleEntry, 'category'))
            continue;
        if (moduleEntry.name !== identity.moduleId || moduleEntry.category !== 'module')
            continue;
        matchingModules.add(moduleEntry);
        const contributes = own(moduleEntry, 'contributes') ? moduleEntry.contributes : undefined;
        for (const contributionName of contributes ?? []) {
            for (const contribution of entries) {
                if (!own(contribution, 'name')
                    || !own(contribution, 'category')
                    || !own(contribution, 'widgetShape'))
                    continue;
                if (contribution.name !== contributionName || contribution.category !== 'widget')
                    continue;
                const widgetName = record(contribution.widgetShape)?.widgetName;
                if (widgetName === identity.widgetName
                    && own(record(contribution.widgetShape) ?? {}, 'widgetName')) {
                    matches.add(contribution);
                }
            }
        }
    }
    return matchingModules.size === 1 && matches.size === 1
        ? [...matches][0]
        : undefined;
}
