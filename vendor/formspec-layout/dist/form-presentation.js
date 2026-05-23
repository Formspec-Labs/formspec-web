/** @filedesc Merge definition and component-document formPresentation for planning and pageMode rendering. */
/**
 * Merges tier-1 `formPresentation` from the core definition with the optional
 * component document. Component document wins on key conflicts — layout
 * documents can set `pageMode`, `showProgress`, etc. without duplicating the
 * whole definition.
 */
export function mergeFormPresentationForPlanning(fromDefinition, fromComponentDocument) {
    const def = fromDefinition && typeof fromDefinition === 'object'
        ? fromDefinition
        : undefined;
    const cd = fromComponentDocument && typeof fromComponentDocument === 'object'
        ? fromComponentDocument
        : undefined;
    if (!def && !cd)
        return undefined;
    return { ...(def ?? {}), ...(cd ?? {}) };
}
