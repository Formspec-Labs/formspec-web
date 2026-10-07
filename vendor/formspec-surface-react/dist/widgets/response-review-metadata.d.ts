/** @filedesc Canonical ResponseReview metadata without renderer runtime imports. */
import type { FiniteJsonValue } from '@formspec-org/surface';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import type { SurfaceWidgetProps } from '../widget-api.js';
export declare const RESPONSE_REVIEW_COPY_KEYS: readonly ["heading", "pending", "beforeSign", "beforeSubmit", "responseId", "draftVersion", "locale", "signatures", "additionalAnswers", "emptyString", "nullValue", "trueValue", "falseValue", "emptyArray", "emptyObject", "attachmentPending", "attachmentUnavailable", "attachmentFailed", "attachmentPreview", "attachmentDetails", "retry", "unavailable"];
export type ResponseReviewCopy = Readonly<Record<(typeof RESPONSE_REVIEW_COPY_KEYS)[number], string>>;
export interface ResponseReviewPresentation {
    responseHash: string;
    definitionUrl: string;
    definitionVersion: string;
    locale: string;
    actorRef: string;
    draft: {
        id: string;
        version: number;
    };
    phase: "before-sign" | "before-submit";
    /** Captured public field/group metadata for this exact snapshot, never live engine values. */
    fields: Readonly<Record<string, {
        label: string;
        options?: readonly {
            value: string;
            label: string;
        }[];
    }>>;
}
export interface ResponseReviewData {
    definition: FormDefinition;
    response: FormResponse;
    presentation: ResponseReviewPresentation;
}
export interface ResponseReviewState {
    status: "pending" | "ready" | "unavailable";
    responseHash: string;
    /** Hash of all captured Definition, Response and presentation inputs. Absent until admitted. */
    contextIdentity?: string;
    actorRef: string;
    draft: Readonly<{
        id: string;
        version: number;
    }>;
    locale: string;
    phase: ResponseReviewPresentation["phase"];
}
export interface ResponseReviewAttachmentRequest extends ResponseReviewData {
    path: string;
    descriptor: FiniteJsonValue;
}
export interface ResponseReviewOptions {
    /** Inject the maintained integrity-canonical handoff producer; no raw-JCS fallback. */
    canonicalResponseHandoffBytes?: (response: unknown) => Uint8Array<ArrayBuffer>;
    /** Host checks private ownership/authorization and returns the exact descriptor's bytes. */
    readAttachment?: (request: ResponseReviewAttachmentRequest, options: {
        signal: AbortSignal;
    }) => Promise<Blob>;
    /** Presentation availability only; does not establish human review or signing authority. */
    onReviewState?: (state: ResponseReviewState) => void;
}
export interface ResponseReviewProps extends SurfaceWidgetProps, ResponseReviewOptions {
}
export declare const RESPONSE_REVIEW_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/ResponseReview@0.1";
export declare const RESPONSE_REVIEW_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "";
    readonly kind: "response-review";
}, {
    readonly pointerPattern: "/copy/*";
    readonly kind: "response-review-copy";
}];
export declare const RESPONSE_REVIEW_CONFIG_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["copy"];
    readonly properties: {
        readonly copy: {
            readonly type: "object";
            readonly minProperties: 1;
            readonly propertyNames: {
                readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
            };
            readonly additionalProperties: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["heading", "pending", "beforeSign", "beforeSubmit", "responseId", "draftVersion", "locale", "signatures", "additionalAnswers", "emptyString", "nullValue", "trueValue", "falseValue", "emptyArray", "emptyObject", "attachmentPending", "attachmentUnavailable", "attachmentFailed", "attachmentPreview", "attachmentDetails", "retry", "unavailable"];
                readonly properties: {
                    readonly "x-generation": {
                        readonly type: "object";
                    };
                };
            };
        };
        readonly "x-generation": {
            readonly type: "object";
        };
    };
};
export declare const RESPONSE_REVIEW_WIDGET_SHAPE: {
    readonly widgetName: "ResponseReview";
    readonly props: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["copy"];
        readonly properties: {
            readonly copy: {
                readonly type: "object";
                readonly minProperties: 1;
                readonly propertyNames: {
                    readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
                };
                readonly additionalProperties: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["heading", "pending", "beforeSign", "beforeSubmit", "responseId", "draftVersion", "locale", "signatures", "additionalAnswers", "emptyString", "nullValue", "trueValue", "falseValue", "emptyArray", "emptyObject", "attachmentPending", "attachmentUnavailable", "attachmentFailed", "attachmentPreview", "attachmentDetails", "retry", "unavailable"];
                    readonly properties: {
                        readonly "x-generation": {
                            readonly type: "object";
                        };
                    };
                };
            };
            readonly "x-generation": {
                readonly type: "object";
            };
        };
    };
    readonly dataInputs: {
        name: string;
        required: boolean;
    }[];
    readonly childrenPolicy: "none";
    readonly deliveryContractId: "@formspec-org/surface-react/ResponseReview@0.1";
    readonly renderedConfigNodes: readonly [{
        readonly pointerPattern: "";
        readonly kind: "response-review";
    }, {
        readonly pointerPattern: "/copy/*";
        readonly kind: "response-review-copy";
    }];
};
/** Schema for the separately qualified presentation input; not renderer-selected authority. */
export declare const RESPONSE_REVIEW_PRESENTATION_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["responseHash", "definitionUrl", "definitionVersion", "locale", "actorRef", "draft", "phase", "fields"];
    readonly properties: {
        readonly responseHash: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
        };
        readonly definitionUrl: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly definitionVersion: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly locale: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly actorRef: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly draft: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["id", "version"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly version: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: number;
                };
            };
        };
        readonly phase: {
            readonly enum: readonly ["before-sign", "before-submit"];
        };
        readonly fields: {
            readonly type: "object";
            readonly additionalProperties: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["label"];
                readonly properties: {
                    readonly label: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly options: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly required: readonly ["value", "label"];
                            readonly properties: {
                                readonly value: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly label: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
/** Presentation availability only; ready must identify the complete captured input set. */
export declare const RESPONSE_REVIEW_STATE_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["status", "responseHash", "actorRef", "draft", "locale", "phase"];
    readonly properties: {
        readonly status: {
            readonly enum: readonly ["pending", "ready", "unavailable"];
        };
        readonly contextIdentity: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
        };
        readonly responseHash: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
        };
        readonly actorRef: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly draft: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["id", "version"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly version: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: number;
                };
            };
        };
        readonly locale: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly phase: {
            readonly enum: readonly ["before-sign", "before-submit"];
        };
    };
    readonly allOf: readonly [{
        readonly if: {
            readonly properties: {
                readonly status: {
                    readonly const: "ready";
                };
            };
            readonly required: readonly ["status"];
        };
        readonly then: {
            readonly required: readonly ["contextIdentity"];
        };
    }];
};
