/** @filedesc Track qualified committed-draft review inputs and engine-derived relevance by object identity. */
const qualifiedDraftReviews = new WeakSet();
const draftReviewIrrelevantPaths = new WeakMap();
export function qualifyDraftReview(data, irrelevantPaths) {
    qualifiedDraftReviews.add(data);
    if (irrelevantPaths && irrelevantPaths.size > 0) {
        draftReviewIrrelevantPaths.set(data, irrelevantPaths);
    }
}
export function isQualifiedDraftReview(data) {
    return qualifiedDraftReviews.has(data);
}
export function getDraftReviewIrrelevantPaths(data) {
    return draftReviewIrrelevantPaths.get(data);
}
