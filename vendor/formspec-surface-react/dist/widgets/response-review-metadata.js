export const RESPONSE_REVIEW_COPY_KEYS = [
    "heading",
    "pending",
    "beforeSign",
    "beforeSubmit",
    "responseId",
    "draftVersion",
    "locale",
    "signatures",
    "additionalAnswers",
    "emptyString",
    "nullValue",
    "trueValue",
    "falseValue",
    "emptyArray",
    "emptyObject",
    "attachmentPending",
    "attachmentUnavailable",
    "attachmentFailed",
    "attachmentPreview",
    "attachmentDetails",
    "retry",
    "unavailable",
];
export const RESPONSE_REVIEW_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/ResponseReview@0.1";
export const RESPONSE_REVIEW_RENDERED_CONFIG_NODES = [
    { pointerPattern: "", kind: "response-review" },
    { pointerPattern: "/copy/*", kind: "response-review-copy" },
];
export const RESPONSE_REVIEW_CONFIG_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["copy"],
    properties: {
        copy: {
            type: "object",
            minProperties: 1,
            propertyNames: { pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$" },
            additionalProperties: {
                type: "object",
                additionalProperties: false,
                required: RESPONSE_REVIEW_COPY_KEYS,
                properties: {
                    ...Object.fromEntries(RESPONSE_REVIEW_COPY_KEYS.map((k) => [
                        k,
                        { type: "string", minLength: 1 },
                    ])),
                    "x-generation": { type: "object" },
                },
            },
        },
        "x-generation": { type: "object" },
    },
};
export const RESPONSE_REVIEW_WIDGET_SHAPE = {
    widgetName: "ResponseReview",
    props: RESPONSE_REVIEW_CONFIG_SCHEMA,
    dataInputs: ["definition", "response", "presentation"].map((name) => ({
        name,
        required: true,
    })),
    childrenPolicy: "none",
    deliveryContractId: RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
    renderedConfigNodes: RESPONSE_REVIEW_RENDERED_CONFIG_NODES,
};
/** Schema for the separately qualified presentation input; not renderer-selected authority. */
export const RESPONSE_REVIEW_PRESENTATION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [
        "responseHash",
        "definitionUrl",
        "definitionVersion",
        "locale",
        "actorRef",
        "draft",
        "phase",
        "fields",
    ],
    properties: {
        responseHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        definitionUrl: { type: "string", minLength: 1 },
        definitionVersion: { type: "string", minLength: 1 },
        locale: { type: "string", minLength: 1 },
        actorRef: { type: "string", minLength: 1 },
        draft: {
            type: "object",
            additionalProperties: false,
            required: ["id", "version"],
            properties: {
                id: { type: "string", minLength: 1 },
                version: {
                    type: "integer",
                    minimum: 0,
                    maximum: Number.MAX_SAFE_INTEGER,
                },
            },
        },
        phase: { enum: ["before-sign", "before-submit"] },
        fields: {
            type: "object",
            additionalProperties: {
                type: "object",
                additionalProperties: false,
                required: ["label"],
                properties: {
                    label: { type: "string", minLength: 1 },
                    options: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            required: ["value", "label"],
                            properties: {
                                value: { type: "string", minLength: 1 },
                                label: { type: "string", minLength: 1 },
                            },
                        },
                    },
                },
            },
        },
    },
};
/** Presentation availability only; ready must identify the complete captured input set. */
export const RESPONSE_REVIEW_STATE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["status", "responseHash", "actorRef", "draft", "locale", "phase"],
    properties: {
        status: { enum: ["pending", "ready", "unavailable"] },
        contextIdentity: { type: "string", pattern: "^[a-f0-9]{64}$" },
        responseHash: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.responseHash,
        actorRef: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.actorRef,
        draft: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.draft,
        locale: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.locale,
        phase: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.phase,
    },
    allOf: [
        {
            if: { properties: { status: { const: "ready" } }, required: ["status"] },
            then: { required: ["contextIdentity"] },
        },
    ],
};
