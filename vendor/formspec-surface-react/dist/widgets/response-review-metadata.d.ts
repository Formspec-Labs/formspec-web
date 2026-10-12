/** @filedesc Canonical ResponseReview metadata without renderer runtime imports. */
import type { CapturedResponseFields, FiniteJsonValue } from '@formspec-org/surface';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import type { SurfaceWidgetProps } from '../widget-api.js';
export declare const RESPONSE_REVIEW_COPY_KEYS: readonly ["heading", "pending", "beforeSign", "beforeSubmit", "responseId", "draftVersion", "locale", "signatures", "additionalAnswers", "emptyString", "nullValue", "trueValue", "falseValue", "emptyArray", "emptyObject", "attachmentPending", "attachmentUnavailable", "attachmentFailed", "attachmentPreview", "attachmentDetails", "retry", "unavailable"];
export type ResponseReviewCopy = Readonly<Record<(typeof RESPONSE_REVIEW_COPY_KEYS)[number], string>>;
export type AcceptedResponseReviewCopy = ResponseReviewCopy & Readonly<{
    acceptedRecord: string;
}>;
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
    fields: CapturedResponseFields;
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
/** Frozen accepted-record presentation; no signing actor or draft authority. */
export interface AcceptedResponseReviewPresentation extends Omit<ResponseReviewPresentation, "actorRef" | "draft" | "phase"> {
    phase: "accepted-record";
    /** Actual qualified IntakeHandoff.handoffId, never a synthesized record revision. */
    handoffId: string;
    taskSign?: never;
}
export interface AcceptedResponseReviewData extends Omit<ResponseReviewData, "presentation"> {
    presentation: AcceptedResponseReviewPresentation;
}
/** Display availability only; cannot authorize signing, submission, or case access. */
export interface AcceptedResponseReviewState extends Omit<ResponseReviewState, "actorRef" | "draft" | "phase"> {
    phase: "accepted-record";
    handoffId: string;
    taskSign?: never;
}
/** Opaque retained task Sign identity, qualified by the authenticated host.
 * recordHash hashes the Sign record, not the Response. recordRef names that exact hash. */
export interface AcceptedTaskResponseReviewSign {
    recordRef: string;
    recordHash: string;
}
export interface AcceptedTaskResponseReviewPresentation extends Omit<ResponseReviewPresentation, "actorRef" | "draft" | "phase"> {
    phase: "accepted-record";
    taskSign: AcceptedTaskResponseReviewSign;
    handoffId?: never;
}
export interface AcceptedTaskResponseReviewData extends Omit<ResponseReviewData, "presentation"> {
    presentation: AcceptedTaskResponseReviewPresentation;
}
export interface AcceptedTaskResponseReviewState extends Omit<ResponseReviewState, "actorRef" | "draft" | "phase"> {
    phase: "accepted-record";
    taskSign: AcceptedTaskResponseReviewSign;
    handoffId?: never;
}
export type AcceptedResponseReviewInput = AcceptedResponseReviewData | AcceptedTaskResponseReviewData;
export type AcceptedResponseReviewStateInput = AcceptedResponseReviewState | AcceptedTaskResponseReviewState;
export type ResponseReviewInput = ResponseReviewData | AcceptedResponseReviewInput;
export type ResponseReviewPresentationInput = ResponseReviewPresentation | AcceptedResponseReviewPresentation | AcceptedTaskResponseReviewPresentation;
export interface AcceptedResponseReviewAttachmentRequest extends AcceptedResponseReviewData {
    path: string;
    descriptor: FiniteJsonValue;
}
export interface AcceptedTaskResponseReviewAttachmentRequest extends AcceptedTaskResponseReviewData {
    path: string;
    descriptor: FiniteJsonValue;
}
export type AcceptedResponseReviewAttachmentInput = AcceptedResponseReviewAttachmentRequest | AcceptedTaskResponseReviewAttachmentRequest;
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
    /** Host authorizes this accepted case and qualifies its opaque attachment association.
     * No fallback to the applicant reader. Host lifecycle replacement must revoke access. */
    readAcceptedAttachment?: (request: AcceptedResponseReviewAttachmentInput, options: {
        signal: AbortSignal;
    }) => Promise<Blob>;
    /** Accepted-record display availability only; never delivered to signing callbacks. */
    onAcceptedReviewState?: (state: AcceptedResponseReviewStateInput) => void;
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
/** Separate authored delivery shape preserves immutable applicant Registry identity. */
export declare const ACCEPTED_RESPONSE_REVIEW_CONFIG_SCHEMA: {
    readonly properties: {
        readonly copy: {
            readonly additionalProperties: {
                readonly required: readonly ["heading", "pending", "beforeSign", "beforeSubmit", "responseId", "draftVersion", "locale", "signatures", "additionalAnswers", "emptyString", "nullValue", "trueValue", "falseValue", "emptyArray", "emptyObject", "attachmentPending", "attachmentUnavailable", "attachmentFailed", "attachmentPreview", "attachmentDetails", "retry", "unavailable", "acceptedRecord"];
                readonly properties: {
                    readonly acceptedRecord: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly "x-generation": {
                        readonly type: "object";
                    };
                };
                readonly type: "object";
                readonly additionalProperties: false;
            };
            readonly type: "object";
            readonly minProperties: 1;
            readonly propertyNames: {
                readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
            };
        };
        readonly "x-generation": {
            readonly type: "object";
        };
    };
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["copy"];
};
export declare const ACCEPTED_RESPONSE_REVIEW_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/AcceptedResponseReview@0.1";
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
export declare const ACCEPTED_RESPONSE_REVIEW_WIDGET_SHAPE: {
    readonly widgetName: "AcceptedResponseReview";
    readonly props: {
        readonly properties: {
            readonly copy: {
                readonly additionalProperties: {
                    readonly required: readonly ["heading", "pending", "beforeSign", "beforeSubmit", "responseId", "draftVersion", "locale", "signatures", "additionalAnswers", "emptyString", "nullValue", "trueValue", "falseValue", "emptyArray", "emptyObject", "attachmentPending", "attachmentUnavailable", "attachmentFailed", "attachmentPreview", "attachmentDetails", "retry", "unavailable", "acceptedRecord"];
                    readonly properties: {
                        readonly acceptedRecord: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly "x-generation": {
                            readonly type: "object";
                        };
                    };
                    readonly type: "object";
                    readonly additionalProperties: false;
                };
                readonly type: "object";
                readonly minProperties: 1;
                readonly propertyNames: {
                    readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
                };
            };
            readonly "x-generation": {
                readonly type: "object";
            };
        };
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["copy"];
    };
    readonly deliveryContractId: "@formspec-org/surface-react/AcceptedResponseReview@0.1";
    readonly dataInputs: {
        name: string;
        required: boolean;
    }[];
    readonly childrenPolicy: "none";
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
/** Closed accepted presentation; existing named presentation schema stays signing-only. */
export declare const ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "handoffId"];
    readonly properties: {
        readonly phase: {
            readonly const: "accepted-record";
        };
        readonly handoffId: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly locale: {
            readonly type: "string";
            readonly minLength: 1;
        };
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
/** Closed input wrapper; hosts register the maintained native schemas for admission.
 * Shape admission does not establish custody, authorization, or integrity. */
export declare const ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["definition", "response", "presentation"];
    readonly properties: {
        readonly definition: {
            readonly $ref: "https://formspec.org/schemas/definition/1.0";
        };
        readonly response: {
            readonly $ref: "https://formspec.org/schemas/response/1.0";
        };
        readonly presentation: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "handoffId"];
            readonly properties: {
                readonly phase: {
                    readonly const: "accepted-record";
                };
                readonly handoffId: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly locale: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
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
    };
};
/** Closed accepted display state; this schema is not a SigningCeremony source. */
export declare const ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly [...("status" | "locale" | "phase" | "responseHash")[], "handoffId"];
    readonly properties: {
        readonly phase: {
            readonly const: "accepted-record";
        };
        readonly handoffId: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly status: {
            readonly enum: readonly ["pending", "ready", "unavailable"];
        };
        readonly locale: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly responseHash: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
        };
        readonly contextIdentity: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
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
/** Closed task-origin branch. The host verifies Sign/task/artifact links and current access. */
export declare const ACCEPTED_TASK_RESPONSE_REVIEW_SIGN_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["recordRef", "recordHash"];
    readonly properties: {
        readonly recordRef: {
            readonly type: "string";
            readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
        };
        readonly recordHash: {
            readonly type: "string";
            readonly pattern: "^sha256:[a-f0-9]{64}$";
        };
    };
};
export declare const ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA: {
    readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "taskSign"];
    readonly properties: {
        readonly taskSign: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["recordRef", "recordHash"];
            readonly properties: {
                readonly recordRef: {
                    readonly type: "string";
                    readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                };
                readonly recordHash: {
                    readonly type: "string";
                    readonly pattern: "^sha256:[a-f0-9]{64}$";
                };
            };
        };
        readonly locale: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly phase: {
            readonly const: "accepted-record";
        };
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
    readonly type: "object";
    readonly additionalProperties: false;
};
export declare const ACCEPTED_TASK_RESPONSE_REVIEW_DATA_SCHEMA: {
    readonly properties: {
        readonly presentation: {
            readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "taskSign"];
            readonly properties: {
                readonly taskSign: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["recordRef", "recordHash"];
                    readonly properties: {
                        readonly recordRef: {
                            readonly type: "string";
                            readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                        };
                        readonly recordHash: {
                            readonly type: "string";
                            readonly pattern: "^sha256:[a-f0-9]{64}$";
                        };
                    };
                };
                readonly locale: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly phase: {
                    readonly const: "accepted-record";
                };
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
            readonly type: "object";
            readonly additionalProperties: false;
        };
        readonly definition: {
            readonly $ref: "https://formspec.org/schemas/definition/1.0";
        };
        readonly response: {
            readonly $ref: "https://formspec.org/schemas/response/1.0";
        };
    };
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["definition", "response", "presentation"];
};
export declare const ACCEPTED_TASK_RESPONSE_REVIEW_STATE_SCHEMA: {
    readonly required: readonly [...("status" | "locale" | "phase" | "responseHash")[], "taskSign"];
    readonly properties: {
        readonly taskSign: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["recordRef", "recordHash"];
            readonly properties: {
                readonly recordRef: {
                    readonly type: "string";
                    readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                };
                readonly recordHash: {
                    readonly type: "string";
                    readonly pattern: "^sha256:[a-f0-9]{64}$";
                };
            };
        };
        readonly status: {
            readonly enum: readonly ["pending", "ready", "unavailable"];
        };
        readonly locale: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly phase: {
            readonly const: "accepted-record";
        };
        readonly responseHash: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
        };
        readonly contextIdentity: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
        };
    };
    readonly type: "object";
    readonly additionalProperties: false;
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
export declare const ACCEPTED_RESPONSE_REVIEW_PRESENTATION_UNION_SCHEMA: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "handoffId"];
        readonly properties: {
            readonly phase: {
                readonly const: "accepted-record";
            };
            readonly handoffId: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
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
    }, {
        readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "taskSign"];
        readonly properties: {
            readonly taskSign: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["recordRef", "recordHash"];
                readonly properties: {
                    readonly recordRef: {
                        readonly type: "string";
                        readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                    };
                    readonly recordHash: {
                        readonly type: "string";
                        readonly pattern: "^sha256:[a-f0-9]{64}$";
                    };
                };
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly phase: {
                readonly const: "accepted-record";
            };
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
        readonly type: "object";
        readonly additionalProperties: false;
    }];
};
export declare const ACCEPTED_RESPONSE_REVIEW_DATA_UNION_SCHEMA: {
    readonly properties: {
        readonly presentation: {
            readonly oneOf: readonly [{
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "handoffId"];
                readonly properties: {
                    readonly phase: {
                        readonly const: "accepted-record";
                    };
                    readonly handoffId: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly locale: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
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
            }, {
                readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "taskSign"];
                readonly properties: {
                    readonly taskSign: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly required: readonly ["recordRef", "recordHash"];
                        readonly properties: {
                            readonly recordRef: {
                                readonly type: "string";
                                readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                            };
                            readonly recordHash: {
                                readonly type: "string";
                                readonly pattern: "^sha256:[a-f0-9]{64}$";
                            };
                        };
                    };
                    readonly locale: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly phase: {
                        readonly const: "accepted-record";
                    };
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
                readonly type: "object";
                readonly additionalProperties: false;
            }];
        };
        readonly definition: {
            readonly $ref: "https://formspec.org/schemas/definition/1.0";
        };
        readonly response: {
            readonly $ref: "https://formspec.org/schemas/response/1.0";
        };
    };
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["definition", "response", "presentation"];
};
export declare const ACCEPTED_RESPONSE_REVIEW_STATE_UNION_SCHEMA: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly [...("status" | "locale" | "phase" | "responseHash")[], "handoffId"];
        readonly properties: {
            readonly phase: {
                readonly const: "accepted-record";
            };
            readonly handoffId: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly status: {
                readonly enum: readonly ["pending", "ready", "unavailable"];
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly responseHash: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
            };
            readonly contextIdentity: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
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
    }, {
        readonly required: readonly [...("status" | "locale" | "phase" | "responseHash")[], "taskSign"];
        readonly properties: {
            readonly taskSign: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["recordRef", "recordHash"];
                readonly properties: {
                    readonly recordRef: {
                        readonly type: "string";
                        readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                    };
                    readonly recordHash: {
                        readonly type: "string";
                        readonly pattern: "^sha256:[a-f0-9]{64}$";
                    };
                };
            };
            readonly status: {
                readonly enum: readonly ["pending", "ready", "unavailable"];
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly phase: {
                readonly const: "accepted-record";
            };
            readonly responseHash: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
            };
            readonly contextIdentity: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
            };
        };
        readonly type: "object";
        readonly additionalProperties: false;
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
    }];
};
export declare const RESPONSE_REVIEW_PRESENTATION_UNION_SCHEMA: {
    readonly oneOf: readonly [{
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
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "handoffId"];
        readonly properties: {
            readonly phase: {
                readonly const: "accepted-record";
            };
            readonly handoffId: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
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
    }, {
        readonly required: readonly [...("locale" | "phase" | "responseHash" | "definitionUrl" | "definitionVersion" | "fields")[], "taskSign"];
        readonly properties: {
            readonly taskSign: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["recordRef", "recordHash"];
                readonly properties: {
                    readonly recordRef: {
                        readonly type: "string";
                        readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                    };
                    readonly recordHash: {
                        readonly type: "string";
                        readonly pattern: "^sha256:[a-f0-9]{64}$";
                    };
                };
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly phase: {
                readonly const: "accepted-record";
            };
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
        readonly type: "object";
        readonly additionalProperties: false;
    }];
};
export declare const RESPONSE_REVIEW_STATE_UNION_SCHEMA: {
    readonly oneOf: readonly [{
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
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly [...("status" | "locale" | "phase" | "responseHash")[], "handoffId"];
        readonly properties: {
            readonly phase: {
                readonly const: "accepted-record";
            };
            readonly handoffId: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly status: {
                readonly enum: readonly ["pending", "ready", "unavailable"];
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly responseHash: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
            };
            readonly contextIdentity: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
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
    }, {
        readonly required: readonly [...("status" | "locale" | "phase" | "responseHash")[], "taskSign"];
        readonly properties: {
            readonly taskSign: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["recordRef", "recordHash"];
                readonly properties: {
                    readonly recordRef: {
                        readonly type: "string";
                        readonly pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$";
                    };
                    readonly recordHash: {
                        readonly type: "string";
                        readonly pattern: "^sha256:[a-f0-9]{64}$";
                    };
                };
            };
            readonly status: {
                readonly enum: readonly ["pending", "ready", "unavailable"];
            };
            readonly locale: {
                readonly type: "string";
                readonly minLength: 1;
            };
            readonly phase: {
                readonly const: "accepted-record";
            };
            readonly responseHash: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
            };
            readonly contextIdentity: {
                readonly type: "string";
                readonly pattern: "^[a-f0-9]{64}$";
            };
        };
        readonly type: "object";
        readonly additionalProperties: false;
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
    }];
};
