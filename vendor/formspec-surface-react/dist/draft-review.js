/** @filedesc Supply all ResponseReview inputs from one authorized committed draft. */
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { placementCovers, readWarningAcknowledgementGroups, } from '@formspec-org/layout';
import { canonicalFiniteJson, captureResponseFieldMetadata, snapshotFiniteJson, surfaceDiagnostic, } from '@formspec-org/surface';
import { targetDefinitionMatches } from '@formspec-org/types';
import { readSubmitEvaluation, summarizeDraftProgress } from './draft-progress.js';
import { withSurfaceQuery } from './browser-location.js';
import { qualifyDraftReview } from './internal/draft-review-qualification.js';
export async function loadDraftReviewInputs(plan, { session, site, signal, localeDocuments, activeLocale }) {
    function unavailable(reason, inputName = 'response') {
        const message = 'The committed draft review inputs are unavailable.';
        return {
            status: 'unavailable', draftReviewReason: reason,
            failures: [{ inputName, required: true, reason: 'unavailable', message }],
            diagnostics: [surfaceDiagnostic('WIDGET-DATA-REQUIRED-UNAVAILABLE', message, site, { reason, inputName })],
        };
    }
    if (plan.status === 'unresolved')
        return unavailable(plan.reason, plan.reason === 'form-unresolved' ? 'definition' : plan.reason === 'invalid-binding' ? 'draftReview' : 'response');
    if (!session)
        return unavailable('unavailable');
    const { definition, subject } = plan;
    const draft = await session.readCommitted(definition, subject, { afterPendingSaves: true, signal });
    let response;
    let revision;
    let key;
    let pins;
    let filing;
    let isFiledRecord = false;
    if (draft.status === 'loaded') {
        response = draft.response;
        revision = draft.revision;
        key = draft.key;
        pins = draft.pins;
        const relatedFiling = await session.readFiling(definition, subject, { signal }).catch(() => ({ status: 'absent' }));
        if (relatedFiling.status === 'loaded') {
            filing = relatedFiling.observation;
        }
    }
    else if (draft.status === 'absent' || draft.status === 'initialized') {
        const filed = await session.readFiling(definition, subject, { signal });
        if (filed.status !== 'loaded')
            return unavailable(draft.status);
        response = filed.response;
        revision = filed.observation.responseHash || filed.response.id || '';
        key = filed.key;
        filing = filed.observation;
        isFiledRecord = true;
    }
    else {
        return unavailable(draft.status);
    }
    const allowedStatus = isFiledRecord
        ? response.status === 'completed' || response.status === 'amended' || response.status === 'in-progress'
        : response.status === 'in-progress';
    try {
        if (response.$formspecResponse !== '1.0' || !allowedStatus ||
            typeof response.id !== 'string' || !response.id || !revision || response.definitionUrl !== definition.url ||
            !response.data || typeof response.data !== 'object' || Array.isArray(response.data) ||
            (key.subject && canonicalFiniteJson(snapshotFiniteJson(response.subject)) !== canonicalFiniteJson(snapshotFiniteJson(key.subject)))) {
            return unavailable('response-invalid');
        }
        if (response.definitionVersion !== definition.version)
            return unavailable('version-mismatch');
    }
    catch {
        return unavailable('response-invalid');
    }
    try {
        await initFormspecEngine();
        signal.throwIfAborted();
        const hasResponseInstances = Object.values(definition.instances ?? {}).some(inst => Boolean(inst.response));
        const responseInstanceResolutions = hasResponseInstances && session.resolveReads
            ? await session.resolveReads(definition, key, pins, signal)
            : undefined;
        signal.throwIfAborted();
        const engine = createFormEngine(definition, {
            savedResponseData: response.data, loadExternalSources: false,
            ...(responseInstanceResolutions && { responseInstanceResolutions }),
            ...(response.explanations && { savedExplanations: response.explanations }),
            ...(key.subject && { responseSubject: key.subject }),
        });
        try {
            if (engine.hasSubjectRefusal())
                return unavailable('presentation-invalid', 'presentation');
            for (const locale of localeDocuments ?? []) {
                if (locale.target.kind === 'definition' && targetDefinitionMatches(locale.target, definition)) {
                    engine.loadLocale(locale);
                }
            }
            engine.setLocale(activeLocale || 'en');
            const fields = captureResponseFieldMetadata(definition, response, {
                label: path => engine.getItemLabelSignal(path)?.value || path,
                // Blank option metadata is unusable. The widget still displays the stored value.
                options: path => (engine.getFieldVM(path)?.options.value ?? [])
                    .filter(option => option.value.length > 0 && option.label.length > 0),
            });
            const irrelevantPaths = new Set();
            for (const field of engine.getEvaluatedFormState({ profile: 'off' }).fields) {
                if (!field.relevant)
                    irrelevantPaths.add(field.path);
            }
            const collectIrrelevantGroups = (items, values, prefix) => {
                for (const item of items) {
                    if (!item || typeof item.key !== 'string' || !Object.prototype.hasOwnProperty.call(values, item.key)) {
                        continue;
                    }
                    const path = prefix ? `${prefix}.${item.key}` : item.key;
                    if (!engine.isPathRelevant(path)) {
                        irrelevantPaths.add(path);
                        continue;
                    }
                    if (item.type === 'group' && Array.isArray(item.children)) {
                        const val = values[item.key];
                        if (item.repeatable && Array.isArray(val)) {
                            val.forEach((row, index) => {
                                const rowPath = `${path}[${index}]`;
                                if (!engine.isPathRelevant(rowPath)) {
                                    irrelevantPaths.add(rowPath);
                                }
                                else if (row && typeof row === 'object' && !Array.isArray(row)) {
                                    collectIrrelevantGroups(item.children, row, rowPath);
                                }
                            });
                        }
                        else if (val && typeof val === 'object' && !Array.isArray(val)) {
                            collectIrrelevantGroups(item.children, val, path);
                        }
                    }
                }
            };
            collectIrrelevantGroups(definition.items, response.data, '');
            const hrefForPath = (targetPath) => {
                if (targetPath === '#')
                    return null;
                const section = plan.sections?.find(sec => sec.fields.some(bind => placementCovers(bind, targetPath)));
                const destination = section?.href ?? plan.formHref ?? null;
                return destination ? withSurfaceQuery(destination, 'field', targetPath) : null;
            };
            const warningGroups = isFiledRecord
                ? []
                : readWarningAcknowledgementGroups(engine.getExplanationState(), {
                    field: (targetPath) => {
                        const vm = engine.getFieldVM(targetPath);
                        const label = vm?.label.value ?? engine.getItemLabelSignal(targetPath)?.value;
                        if (!vm && label === undefined)
                            return null;
                        return { label: label || targetPath, controlId: vm?.id || null };
                    },
                    rootLabel: () => definition.title || 'Form',
                    resolveText: (localeKey, fallback) => engine.resolveLocaleString(localeKey, fallback),
                    lookupUi: (uiKey) => engine.lookupLocaleString(`$ui.${uiKey}`),
                    jumpable: (targetPath) => hrefForPath(targetPath) !== null,
                    hrefForPath,
                });
            let validationSummary;
            if (!isFiledRecord) {
                const progress = summarizeDraftProgress([], readSubmitEvaluation(engine));
                const toFix = progress.form.toFix ?? 0;
                const toCheck = progress.form.toCheck ?? 0;
                const missing = progress.form.missing;
                if (toFix > 0 || toCheck > 0 || missing > 0) {
                    validationSummary = { toFix, toCheck, missing };
                }
            }
            const data = { definition, response,
                presentation: { phase: 'draft-review', revision, locale: engine.getActiveLocale(), fields } };
            const captured = snapshotFiniteJson(data);
            qualifyDraftReview(captured, irrelevantPaths);
            return {
                status: 'ready',
                degradedInputs: [],
                diagnostics: [],
                data: captured,
                revision,
                warningGroups,
                ...(filing ? { filing } : {}),
                ...(isFiledRecord ? { isFiledRecord: true } : {}),
                ...(validationSummary ? { validationSummary } : {}),
            };
        }
        finally {
            engine.dispose();
        }
    }
    catch {
        return unavailable('presentation-invalid', 'presentation');
    }
}
