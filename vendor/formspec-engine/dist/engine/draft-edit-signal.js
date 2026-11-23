const draftEditVersions = new WeakMap();
export function registerDraftEditVersionSignal(engine, signal) {
    draftEditVersions.set(engine, signal);
}
export function getDraftEditVersionSignal(engine) {
    return draftEditVersions.get(engine);
}
