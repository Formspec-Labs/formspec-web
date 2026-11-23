/** @filedesc Track qualified committed-draft review inputs and engine-derived relevance by object identity. */
export declare function qualifyDraftReview(data: object, irrelevantPaths?: ReadonlySet<string>): void;
export declare function isQualifiedDraftReview(data: object): boolean;
export declare function getDraftReviewIrrelevantPaths(data: object): ReadonlySet<string> | undefined;
