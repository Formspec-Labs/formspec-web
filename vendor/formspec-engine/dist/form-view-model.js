/** @filedesc FormViewModel — form-level locale-resolved reactive state. */
export function createFormViewModel(deps) {
    const { rx, localeStore, getDefinitionTitle, getDefinitionDescription, getPageTitle, getPageDescription, interpolate, getValidationCounts, getIsValid, } = deps;
    const pageTitleCache = new Map();
    const pageDescCache = new Map();
    function resolveString(key, fallback) {
        // Read version to subscribe to locale changes
        localeStore.version.value;
        const localized = localeStore.lookupKey(key);
        return interpolate(localized ?? fallback ?? '');
    }
    const title = rx.computed(() => resolveString('$form.title', getDefinitionTitle()));
    const description = rx.computed(() => resolveString('$form.description', getDefinitionDescription()));
    const isValid = rx.computed(() => getIsValid());
    const validationSummary = rx.computed(() => getValidationCounts());
    return {
        title,
        description,
        pageTitle(pageId) {
            let sig = pageTitleCache.get(pageId);
            if (!sig) {
                sig = rx.computed(() => resolveString(`$page.${pageId}.title`, getPageTitle(pageId)));
                pageTitleCache.set(pageId, sig);
            }
            return sig;
        },
        pageDescription(pageId) {
            let sig = pageDescCache.get(pageId);
            if (!sig) {
                sig = rx.computed(() => resolveString(`$page.${pageId}.description`, getPageDescription(pageId)));
                pageDescCache.set(pageId, sig);
            }
            return sig;
        },
        isValid,
        validationSummary,
    };
}
