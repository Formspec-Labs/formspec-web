/** @filedesc FormViewModel — form-level locale-resolved reactive state. */
import { interpolateMessage } from './interpolate-message.js';
export function createFormViewModel(deps) {
    const { rx, localeStore, getDefinitionTitle, getDefinitionDescription, getPageTitle, getPageDescription, evalFEL, getValidationCounts, getIsValid, } = deps;
    const pageTitleCache = new Map();
    const pageDescCache = new Map();
    function resolveString(key, fallback, evaluate) {
        // Read version to subscribe to locale changes
        localeStore.version.value;
        const localized = localeStore.lookupKey(key);
        const raw = localized ?? fallback ?? '';
        const { text } = interpolateMessage(raw, evaluate);
        return text;
    }
    const title = rx.computed(() => resolveString('$form.title', getDefinitionTitle(), evalFEL));
    const description = rx.computed(() => resolveString('$form.description', getDefinitionDescription(), evalFEL));
    const isValid = rx.computed(() => getIsValid());
    const validationSummary = rx.computed(() => getValidationCounts());
    return {
        title,
        description,
        pageTitle(pageId) {
            let sig = pageTitleCache.get(pageId);
            if (!sig) {
                sig = rx.computed(() => resolveString(`$page.${pageId}.title`, getPageTitle(pageId), evalFEL));
                pageTitleCache.set(pageId, sig);
            }
            return sig;
        },
        pageDescription(pageId) {
            let sig = pageDescCache.get(pageId);
            if (!sig) {
                sig = rx.computed(() => resolveString(`$page.${pageId}.description`, getPageDescription(pageId), evalFEL));
                pageDescCache.set(pageId, sig);
            }
            return sig;
        },
        isValid,
        validationSummary,
    };
}
