import type { FormResponse, Generation, SigningContent, SigningContentSource } from '@formspec-org/types';
import type { SurfaceWidgetProps } from '../widget-api.js';
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
}
export interface SigningCeremonyConfig {
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
export interface SigningCeremonyData {
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
export declare function SigningCeremony(props: SurfaceWidgetProps): import("react/jsx-runtime").JSX.Element;
/** Publish this exact config schema as the Registry entry's widgetShape.props. */
export declare const SIGNING_CEREMONY_CONFIG_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["contentRefs", "copy"];
    readonly properties: {
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
    };
    readonly dataInputs: {
        name: string;
        required: boolean;
    }[];
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
