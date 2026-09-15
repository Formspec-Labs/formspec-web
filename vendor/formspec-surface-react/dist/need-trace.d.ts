/** @filedesc Inert DOM review metadata for canonical Need anchors. */
export type NeedTraceAttributes = {
    'data-need-anchors'?: string;
    'data-need-ids'?: string;
};
export declare function needTraceAttributes(...groups: readonly (readonly string[] | undefined)[]): NeedTraceAttributes;
/**
 * Trace direct, deliberately unpinned `needRefs[].id` citations.
 *
 * This does not emit `data-need-anchors`: a Need id alone carries no revision,
 * and inventing one would turn review metadata into false provenance.
 */
export declare function needIdTraceAttributes(ids: readonly string[]): NeedTraceAttributes;
