import type { SurfaceWidget } from "../widget-api.js";
import { type ResponseReviewOptions, type ResponseReviewProps } from './response-review-metadata.js';
export * from './response-review-metadata.js';
/** Full RFC 8785 JCS/SHA-256 identity. This is not an authored-signature profile or crypto verification. */
export declare function responseReviewHash(value: unknown): Promise<string>;
/** Bare SHA-256 hex of the complete Response under the maintained handoff profile. */
export declare function responseReviewHandoffHash(response: unknown, produce: ResponseReviewOptions["canonicalResponseHandoffBytes"]): Promise<string>;
export declare function ResponseReview(props: ResponseReviewProps): import("react/jsx-runtime").JSX.Element;
export declare function createResponseReviewWidget(options?: ResponseReviewOptions): SurfaceWidget;
