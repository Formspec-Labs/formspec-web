/**
 * @filedesc The module-widget runtime seam: `{moduleId, widgetName}` → a component.
 *
 * ## What the platform already had, and what it did not
 *
 * The Registry declares a widget's name, version, status, `childrenPolicy` and
 * `tokenSlots`; the ModuleResolver admits it; lint E603 checks the module is
 * declared; the UI Graph Policy validator reasons about its theming. All of that
 * is admission. **Nothing delivered.** A module could declare a widget it had no
 * way to ship (gap ledger `module-widget-runtime`).
 *
 * This module is the delivery channel: a host registers {@link WidgetModule}s,
 * and a `module-widget` binding resolves through the same identity the Registry
 * already uses. It is generic over the component type so the renderer-independent
 * core owns the lookup and each renderer binding owns only its component shape —
 * the same split `formspec-react` and `formspec-webcomponent` already have.
 *
 * ## Three fields called `widgetName`, and only one of them is this one
 *
 * ADR 0160 §2.4 (with the residual named in §8.1). Conflating these is the
 * defect the ADR spent a section not closing, so it is worth the four lines:
 *
 * | Field | Vocabulary | Pattern |
 * |---|---|---|
 * | `RegistryEntry.name` | globally unique contribution id | `^x-[a-z][a-z0-9]*(-…)*$` |
 * | `RegistryEntry.widgetShape.widgetName` | the module's own widget name | **none** — often PascalCase |
 * | Theme `widget` (`common.schema.json` `CustomWidgetName`) | a third | `^x-[A-Za-z0-9][A-Za-z0-9_.-]*$` |
 *
 * A Surface `module-widget` binding's `widgetName` is the **second** — the
 * schema documents it as "matches `widgetShape.widgetName`" and carries no
 * pattern. So {@link createWidgetRegistry} keys its lookup on
 * `widgetShape.widgetName` within the module's `contributes[]`, through the
 * shared `resolveWidgetContribution` helper from `@formspec-org/app-graph`,
 * and reports the contribution id separately. A registry keyed on
 * `RegistryEntry.name` would resolve nothing the day a module uses a
 * PascalCase widget name — which the schema explicitly permits.
 */
import { resolveWidgetContribution } from '@formspec-org/app-graph';
import { surfaceDiagnostic } from './diagnostics.js';
/**
 * The Registry entry whose `widgetShape.widgetName` matches, reached through the
 * declaring module's `contributes[]` rather than by scanning every widget entry.
 * Going through the module is what makes two modules able to publish the same
 * `widgetName` without colliding.
 */
export function widgetContributionFor(key, entries) {
    return resolveWidgetContribution(key, entries);
}
export function createWidgetRegistry(input = {}) {
    const modules = new Map((input.modules ?? []).map((module) => [module.moduleId, module]));
    const entries = input.registryEntries ?? [];
    return {
        moduleIds: [...modules.keys()],
        resolve(key) {
            const entry = widgetContributionFor(key, entries);
            const module = modules.get(key.moduleId);
            const component = module?.widgets[key.widgetName];
            if (component !== undefined) {
                if (entry === undefined) {
                    return { status: 'resolved', declared: false, component };
                }
                const reasons = widgetContractMismatchReasons(entry, module?.contracts?.[key.widgetName]);
                return reasons.length > 0
                    ? {
                        status: 'incompatible',
                        contributionName: entry.name,
                        entry,
                        reasons,
                    }
                    : { status: 'resolved', declared: true, component, contributionName: entry.name, entry };
            }
            if (entry !== undefined) {
                return { status: 'unimplemented', contributionName: entry.name, entry };
            }
            return { status: 'undeclared' };
        },
        diagnose(key, resolution, site) {
            if (resolution.status === 'resolved') {
                if (resolution.declared)
                    return undefined;
                // It renders, and the shell says it did. Declaration, not delivery.
                return surfaceDiagnostic('WIDGET-UNDECLARED', `Nothing in this bundle declares a widget "${key.widgetName}" on module "${key.moduleId}". A component the host registered is rendering in its place, so what is on the page is not what the release describes.`, site, { moduleId: key.moduleId, widgetName: key.widgetName, hostComponentRendered: true });
            }
            if (resolution.status === 'unimplemented') {
                return surfaceDiagnostic('WIDGET-UNIMPLEMENTED', `Module "${key.moduleId}" declares widget "${key.widgetName}" and no registered module supplies a component for it.`, site, { moduleId: key.moduleId, widgetName: key.widgetName, contributionName: resolution.contributionName });
            }
            if (resolution.status === 'incompatible') {
                return surfaceDiagnostic('WIDGET-DELIVERY-CONTRACT-MISMATCH', `Module "${key.moduleId}" supplies widget "${key.widgetName}", but its runtime delivery contract does not match Registry contribution "${resolution.contributionName}".`, site, {
                    moduleId: key.moduleId,
                    widgetName: key.widgetName,
                    contributionName: resolution.contributionName,
                    reasons: [...resolution.reasons],
                });
            }
            return surfaceDiagnostic('WIDGET-UNDECLARED', `Nothing in this bundle declares a widget "${key.widgetName}" on module "${key.moduleId}", and nothing the host registered supplies one.`, site, { moduleId: key.moduleId, widgetName: key.widgetName, hostComponentRendered: false });
        },
    };
}
function objectRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function normalizedRenderedConfigNodes(value) {
    if (!Array.isArray(value))
        return undefined;
    const normalized = [];
    for (const rawNode of value) {
        const node = objectRecord(rawNode);
        if (typeof node?.pointerPattern !== 'string' || typeof node.kind !== 'string') {
            return undefined;
        }
        normalized.push(`${node.pointerPattern}\u0000${node.kind}`);
    }
    return normalized.sort();
}
function widgetContractMismatchReasons(entry, contract) {
    const shape = objectRecord(entry.widgetShape);
    const deliveryContractId = shape?.deliveryContractId;
    const renderedConfigNodes = shape?.renderedConfigNodes;
    const declaresRuntimeContract = deliveryContractId !== undefined || renderedConfigNodes !== undefined;
    if (!declaresRuntimeContract)
        return [];
    if (!contract)
        return ['runtime-contract-missing'];
    const reasons = [];
    if (entry.version !== contract.registryEntryVersion) {
        reasons.push('registry-entry-version-mismatch');
    }
    if (typeof deliveryContractId !== 'string'
        || deliveryContractId !== contract.deliveryContractId) {
        reasons.push('delivery-contract-id-mismatch');
    }
    const declaredNodes = normalizedRenderedConfigNodes(renderedConfigNodes);
    const deliveredNodes = normalizedRenderedConfigNodes(contract.renderedConfigNodes);
    if (declaredNodes === undefined
        || deliveredNodes === undefined
        || declaredNodes.length !== deliveredNodes.length
        || declaredNodes.some((node, index) => node !== deliveredNodes[index])) {
        reasons.push('rendered-config-inventory-mismatch');
    }
    return reasons;
}
/**
 * Registry documents → the flat entry list renderers take as a prop.
 *
 * The manifest admits an ARRAY of registries and the renderer prop is one flat
 * list, so two registries declaring the same `name` collapse. The spike's
 * `flatMap` kept both and let the renderer take whichever it found first — a
 * silent winner (gap ledger `registry-entries-wiring`).
 *
 * The rule stated here: **an ambiguous name resolves to no entry**, and one
 * `REGISTRY-ENTRY-NAME-COLLISION` names every declaring Registry. Picking the
 * first declaration would invent precedence the signed graph does not state
 * and let two processors render different widgets from the same bundle.
 */
export function flattenRegistryEntries(registries) {
    const declarations = [];
    const byName = new Map();
    const diagnostics = [];
    registries.forEach((registry, registryIndex) => {
        (registry.entries ?? []).forEach((entry, entryIndex) => {
            const declaration = { entry, registryIndex, entryIndex };
            declarations.push(declaration);
            byName.set(entry.name, [...(byName.get(entry.name) ?? []), declaration]);
        });
    });
    for (const [name, matches] of byName) {
        if (matches.length < 2)
            continue;
        const registryIndices = matches.map(({ registryIndex }) => registryIndex);
        diagnostics.push(surfaceDiagnostic('REGISTRY-ENTRY-NAME-COLLISION', `Registry entry "${name}" is declared more than once. No declaration is used because the bundle states no precedence rule.`, { source: `registries[${registryIndices[0] ?? 0}]` }, {
            name,
            registryIndices,
            declarations: matches.map(({ registryIndex, entryIndex }) => ({
                registryIndex,
                entryIndex,
            })),
        }));
    }
    const entries = declarations
        .filter(({ entry }) => (byName.get(entry.name)?.length ?? 0) === 1)
        .map(({ entry }) => entry);
    return { entries, diagnostics };
}
