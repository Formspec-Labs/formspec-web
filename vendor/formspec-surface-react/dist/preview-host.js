/** @filedesc Admit a preview bundle and compose its scenario and edition-scoped filing adapters. */
import { resolvePageSequence } from '@formspec-org/layout';
import { bundleIsRenderable, composeSurfaceApp, createSurfacePreviewRuntime, createThemeAuthority, dereferenceBundleExport, deriveSurfacePreviewScenario, filingAction, validateSurfacePreviewScenario, } from '@formspec-org/surface';
import { createBrowserFilingStore, previewResponseRecordTools, } from './browser-draft-port.js';
import { previewFilingInvoker } from './preview-filing-invoker.js';
import { starterWidgetModule } from './widgets/index.js';
function bundleComponentResolver(source, explicit) {
    if (explicit)
        return explicit;
    const manifest = source.manifest;
    const refs = [
        ...(manifest.component ? [manifest.component] : []),
        ...(manifest.components ?? []),
    ];
    const docs = refs.flatMap(ref => {
        const doc = source.documents?.[ref.url];
        return doc && typeof doc === 'object' && !Array.isArray(doc) ? [doc] : [];
    });
    if (docs.length === 0)
        return undefined;
    return ({ surfaceRef, routeId, slotId, definition }) => {
        const candidates = docs.filter(doc => doc.targetDefinition?.url === definition.url);
        const slotMatch = candidates.find(doc => {
            const targetRoutes = doc.targetSurfaceRoutes;
            return Boolean(targetRoutes?.some(target => target.role !== 'app-shell' &&
                target.surface.url === surfaceRef &&
                target.route === routeId &&
                target.slot !== undefined &&
                target.slot === slotId));
        });
        if (slotMatch)
            return slotMatch;
        const routeMatch = candidates.find(doc => {
            const targetRoutes = doc.targetSurfaceRoutes;
            return Boolean(targetRoutes?.some(target => target.role !== 'app-shell' &&
                target.surface.url === surfaceRef &&
                target.route === routeId &&
                target.slot === undefined));
        });
        if (routeMatch)
            return routeMatch;
        return candidates.find(doc => {
            const targetRoutes = doc.targetSurfaceRoutes;
            return !targetRoutes?.length;
        });
    };
}
function bundleSectionPlans(bundle, resolveDefinitionComponent) {
    const themeAuthority = createThemeAuthority(bundle.tenantTheme ? { tenantTheme: bundle.tenantTheme } : {});
    return definition => {
        const plans = [resolvePageSequence(definition)];
        for (const surface of bundle.surfaces) {
            const surfaceRef = bundle.surfaceRefs?.get(surface);
            for (const route of surface.routes) {
                const theme = themeAuthority.grantFor(route, { surfaceId: surface.id, routeId: route.id }).themeDocument;
                for (const slot of route.slots) {
                    if (slot.slotType !== 'definition-form')
                        continue;
                    const binding = slot.binding;
                    if (binding?.definitionRef !== definition.url)
                        continue;
                    const component = resolveDefinitionComponent?.({
                        surfaceRef,
                        routeId: route.id,
                        slotId: slot.id,
                        definition,
                    });
                    plans.push(resolvePageSequence(definition, {
                        ...(theme ? { theme } : {}),
                        ...(component ? { component } : {}),
                    }));
                }
            }
        }
        return plans;
    };
}
export async function createSurfacePreviewEdition(input) {
    const bundle = dereferenceBundleExport(input.source);
    if (!bundleIsRenderable(bundle))
        throw new Error(bundle.diagnostics.map(issue => issue.message).join('\n'));
    if (input.scenario !== undefined && !composeSurfaceApp(bundle.surfaces, { entrySurface: bundle.entrySurface }).entry) {
        throw new Error('The preview bundle has no resolved entry route.');
    }
    const validation = await validateSurfacePreviewScenario({
        bundle, scenario: input.scenario === undefined ? deriveSurfacePreviewScenario(bundle) : input.scenario,
        scope: input.scope,
        validateSchema: input.validateSchema, validatePayload: input.validatePayload,
        responseTools: input.scenario === undefined ? undefined : await previewResponseRecordTools(),
    });
    if (!validation.valid) {
        throw new Error(validation.diagnostics.map(issue => `${issue.code}${issue.path ? ` (${issue.path})` : ''}: ${issue.message}`).join('\n'));
    }
    const { scenario, preparedFixtures } = validation;
    const runtime = createSurfacePreviewRuntime(scenario, input.profileId);
    const resolveDefinitionComponent = bundleComponentResolver(input.source, input.resolveDefinitionComponent);
    const fixtures = scenario.profiles[runtime.profileId];
    if (!fixtures)
        throw new Error(`Scenario profile "${runtime.profileId}" is not defined.`);
    const preparedProfile = preparedFixtures?.get(runtime.profileId);
    const createStore = input.createFilingStore ?? (options => createBrowserFilingStore({
        ...options,
        ...(input.databaseName ? { databaseName: input.databaseName } : {}),
    }));
    const store = createStore({
        scope: input.scope,
        definitions: bundle.definitions,
        catalogs: bundle.dataSources,
        ...(preparedProfile ? { preparedFixtures: preparedProfile } : { fixtures }),
        sectionPlans: bundleSectionPlans(bundle, resolveDefinitionComponent),
    });
    // Seeding failures reject edition creation when the active profile declares drafts;
    // profiles without draft fixtures still finish returned-filing progress precomputation
    // and legacy summary upgrades when storage is usable, and open with draft storage
    // unavailable when browser storage refuses open.
    const hasReturnedFilings = Boolean(fixtures.decisions?.some(entry => entry.decision.status === 'decided' && (entry.decision.review === 'returned' || entry.decision.review === 'reopened')));
    if (fixtures.drafts?.length) {
        await store.ready();
    }
    else if (hasReturnedFilings || typeof indexedDB !== 'undefined') {
        await store.ready().catch(() => undefined);
    }
    const filingActions = new Set(bundle.responseActions.flatMap(document => document.actions.filter(action => filingAction(document, action)).map(action => action.id)));
    return {
        scope: input.scope, bundle, initialPath: scenario.initialPath,
        adapters: {
            draftStorage: { scope: input.scope, port: store.drafts }, responses: store.responses,
            ...(input.sessionGeneration !== undefined ? { sessionGeneration: input.sessionGeneration } : {}),
            withResponseLoader: runtime.withResponseLoader, authorizeDataSource: runtime.authorize,
            validateDataSourcePayload: input.validatePayload,
            ...(resolveDefinitionComponent ? { resolveDefinitionComponent } : {}),
            definitionActionInvoker: previewFilingInvoker(store.submit, runtime.actionOutcome),
            routeParams: scenario.routeParams,
            widgetModules: [...new Set(bundle.manifest.modules?.map(module => module.id))].map(id => starterWidgetModule(id)),
            onFireTransition: (transition, from) => transition.actionId && filingActions.has(transition.actionId)
                ? Promise.resolve({ advanced: false, reason: 'Complete this action on the draft.' })
                : runtime.executeTransition({ transition, from }),
        },
    };
}
