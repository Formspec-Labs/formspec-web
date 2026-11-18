/** @filedesc Track qualified committed-draft review inputs by object identity. */
const qualifiedDraftReviews = new WeakSet();
export function qualifyDraftReview(data) {
    qualifiedDraftReviews.add(data);
}
export function isQualifiedDraftReview(data) {
    return qualifiedDraftReviews.has(data);
}
