/** @filedesc Canonical SigningCeremony metadata without renderer runtime imports. */
import type { FormResponse, Generation, SigningContent, SigningContentSource } from '@formspec-org/types';
import { type ResponseReviewState } from './response-review-metadata.js';
export interface SigningCeremonyCopy {
    'x-generation'?: Generation;
    heading: string;
    readInstruction: string;
    readConfirmation: string;
    signerName: string;
    pending: string;
    signed: string;
    failed: string;
    unavailable: string;
    reviewPending?: string;
    reviewUnavailable?: string;
}
export interface SigningCeremonyConfig {
    requireResponseReview?: boolean;
    contentRefs: Readonly<Record<string, SigningContentSource>>;
    copy: Readonly<Record<string, SigningCeremonyCopy>>;
}
export interface SigningCeremonyDraft {
    id: string;
    version: number;
    /** Digest of the frozen preparation, admitted by the host using its existing Response byte profile. */
    responseHash: string;
}
export type SigningCeremonyResult = {
    state: 'unsigned';
} | {
    state: 'signed';
    response: FormResponse;
    draft: {
        id: string;
        version: number;
    };
    verification: {
        mode: 'delegated-service-key';
        provider: string;
        keyId: string;
    };
};
export interface SigningCeremonyReview {
    /** Independently computed by the host for its current captured review inputs. */
    contextIdentity: string;
    state: ResponseReviewState;
}
export interface SigningCeremonyData {
    review?: SigningCeremonyReview;
    content: SigningContent;
    response: FormResponse;
    draft: SigningCeremonyDraft;
    actor: {
        id: string;
    };
    signingResult: SigningCeremonyResult;
    /** Exact mapped Action label refs resolved through the admitted Locale; literal labels need no entry. */
    actionLabels: Readonly<Record<string, string>>;
}
export declare const SIGNING_CEREMONY_CONFIG_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["contentRefs", "copy"];
    readonly properties: {
        readonly requireResponseReview: {
            readonly type: "boolean";
        };
        readonly contentRefs: {
            readonly type: "object";
            readonly minProperties: 1;
            readonly propertyNames: {
                readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
            };
            readonly additionalProperties: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["ref", "version"];
                readonly properties: {
                    readonly ref: {
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly format: "uri";
                    };
                    readonly version: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                };
                readonly description: "Exact authored content entry URI and content version. The URI is the pinned Definition URL followed by #/extensions/x-formspec-signing-content/entries/<simple identifier>.";
            };
        };
        readonly copy: {
            readonly type: "object";
            readonly minProperties: 1;
            readonly propertyNames: {
                readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
            };
            readonly additionalProperties: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["heading", "readInstruction", "readConfirmation", "signerName", "pending", "signed", "failed", "unavailable"];
                readonly properties: {
                    readonly 'x-generation': {
                        readonly type: "object";
                    };
                };
            };
        };
        readonly 'x-generation': {
            readonly type: "object";
        };
    };
    readonly allOf: readonly [{
        readonly if: {
            readonly required: readonly ["requireResponseReview"];
            readonly properties: {
                readonly requireResponseReview: {
                    readonly const: true;
                };
            };
        };
        readonly then: {
            readonly properties: {
                readonly copy: {
                    readonly additionalProperties: {
                        readonly required: readonly ["reviewPending", "reviewUnavailable"];
                    };
                };
            };
        };
    }];
};
export declare const SIGNING_CEREMONY_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/SigningCeremony@0.1";
export declare const SIGNING_CEREMONY_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "";
    readonly kind: "signing-ceremony";
}, {
    readonly pointerPattern: "/copy/*";
    readonly kind: "signing-ceremony-copy";
}];
/** Exact authored Registry widgetShape; source payload schemas stay in the Data Sources catalog. */
export declare const SIGNING_CEREMONY_WIDGET_SHAPE: {
    readonly widgetName: "SigningCeremony";
    readonly props: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly required: readonly ["contentRefs", "copy"];
        readonly properties: {
            readonly requireResponseReview: {
                readonly type: "boolean";
            };
            readonly contentRefs: {
                readonly type: "object";
                readonly minProperties: 1;
                readonly propertyNames: {
                    readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
                };
                readonly additionalProperties: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["ref", "version"];
                    readonly properties: {
                        readonly ref: {
                            readonly type: "string";
                            readonly minLength: 1;
                            readonly format: "uri";
                        };
                        readonly version: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                    readonly description: "Exact authored content entry URI and content version. The URI is the pinned Definition URL followed by #/extensions/x-formspec-signing-content/entries/<simple identifier>.";
                };
            };
            readonly copy: {
                readonly type: "object";
                readonly minProperties: 1;
                readonly propertyNames: {
                    readonly pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$";
                };
                readonly additionalProperties: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["heading", "readInstruction", "readConfirmation", "signerName", "pending", "signed", "failed", "unavailable"];
                    readonly properties: {
                        readonly 'x-generation': {
                            readonly type: "object";
                        };
                    };
                };
            };
            readonly 'x-generation': {
                readonly type: "object";
            };
        };
        readonly allOf: readonly [{
            readonly if: {
                readonly required: readonly ["requireResponseReview"];
                readonly properties: {
                    readonly requireResponseReview: {
                        readonly const: true;
                    };
                };
            };
            readonly then: {
                readonly properties: {
                    readonly copy: {
                        readonly additionalProperties: {
                            readonly required: readonly ["reviewPending", "reviewUnavailable"];
                        };
                    };
                };
            };
        }];
    };
    readonly dataInputs: readonly [...{
        name: string;
        required: boolean;
    }[], {
        readonly name: "review";
        readonly required: false;
    }];
    readonly actionOutputs: readonly [{
        readonly name: "sign";
    }, {
        readonly name: "submit";
    }, {
        readonly name: "paper";
    }];
    readonly childrenPolicy: "none";
    readonly deliveryContractId: "@formspec-org/surface-react/SigningCeremony@0.1";
    readonly renderedConfigNodes: readonly [{
        readonly pointerPattern: "";
        readonly kind: "signing-ceremony";
    }, {
        readonly pointerPattern: "/copy/*";
        readonly kind: "signing-ceremony-copy";
    }];
};
/** Separately qualified opt-in source; expected identity is computed independently by the host. */
export declare const SIGNING_CEREMONY_REVIEW_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["contextIdentity", "state"];
    readonly properties: {
        readonly contextIdentity: {
            readonly type: "string";
            readonly pattern: "^[a-f0-9]{64}$";
        };
        readonly state: {
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
    };
};
