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
/** Separate authored delivery shape preserves immutable applicant Registry identity. */
export const ACCEPTED_RESPONSE_REVIEW_CONFIG_SCHEMA = {
    ...RESPONSE_REVIEW_CONFIG_SCHEMA,
    properties: {
        ...RESPONSE_REVIEW_CONFIG_SCHEMA.properties,
        copy: {
            ...RESPONSE_REVIEW_CONFIG_SCHEMA.properties.copy,
            additionalProperties: {
                ...RESPONSE_REVIEW_CONFIG_SCHEMA.properties.copy.additionalProperties,
                required: [...RESPONSE_REVIEW_COPY_KEYS, "acceptedRecord"],
                properties: {
                    ...RESPONSE_REVIEW_CONFIG_SCHEMA.properties.copy.additionalProperties.properties,
                    acceptedRecord: { type: "string", minLength: 1 },
                },
            },
        },
    },
};
export const ACCEPTED_RESPONSE_REVIEW_DELIVERY_CONTRACT_ID = "@formspec-org/surface-react/AcceptedResponseReview@0.1";
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
export const ACCEPTED_RESPONSE_REVIEW_WIDGET_SHAPE = {
    ...RESPONSE_REVIEW_WIDGET_SHAPE,
    widgetName: "AcceptedResponseReview",
    props: ACCEPTED_RESPONSE_REVIEW_CONFIG_SCHEMA,
    deliveryContractId: ACCEPTED_RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
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
/** Closed accepted presentation; existing named presentation schema stays signing-only. */
export const ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [...RESPONSE_REVIEW_PRESENTATION_SCHEMA.required.filter(key => key !== "actorRef" && key !== "draft"), "handoffId"],
    properties: {
        ...Object.fromEntries(Object.entries(RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties)
            .filter(([key]) => key !== "actorRef" && key !== "draft")),
        phase: { const: "accepted-record" },
        handoffId: { type: "string", minLength: 1 },
    },
};
/** Closed input wrapper; hosts register the maintained native schemas for admission.
 * Shape admission does not establish custody, authorization, or integrity. */
export const ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["definition", "response", "presentation"],
    properties: {
        definition: { $ref: "https://formspec.org/schemas/definition/1.0" },
        response: { $ref: "https://formspec.org/schemas/response/1.0" },
        presentation: ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA,
    },
};
/** Closed accepted display state; this schema is not a SigningCeremony source. */
export const ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [...RESPONSE_REVIEW_STATE_SCHEMA.required.filter(key => key !== "actorRef" && key !== "draft"), "handoffId"],
    properties: {
        ...Object.fromEntries(Object.entries(RESPONSE_REVIEW_STATE_SCHEMA.properties)
            .filter(([key]) => key !== "actorRef" && key !== "draft")),
        phase: { const: "accepted-record" },
        handoffId: { type: "string", minLength: 1 },
    },
    allOf: RESPONSE_REVIEW_STATE_SCHEMA.allOf,
};
/** Closed task-origin branch. The host verifies Sign/task/artifact links and current access. */
export const ACCEPTED_TASK_RESPONSE_REVIEW_SIGN_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["recordRef", "recordHash"],
    properties: {
        recordRef: { type: "string", pattern: "^urn:formspec:task-draft-sign:sha256:[a-f0-9]{64}$" },
        recordHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    },
};
export const ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA = {
    ...ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA,
    required: [...ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA.required.filter(key => key !== "handoffId"), "taskSign"],
    properties: {
        ...Object.fromEntries(Object.entries(ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties)
            .filter(([key]) => key !== "handoffId")),
        taskSign: ACCEPTED_TASK_RESPONSE_REVIEW_SIGN_SCHEMA,
    },
};
export const ACCEPTED_TASK_RESPONSE_REVIEW_DATA_SCHEMA = {
    ...ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA,
    properties: { ...ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA.properties, presentation: ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA },
};
export const ACCEPTED_TASK_RESPONSE_REVIEW_STATE_SCHEMA = {
    ...ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA,
    required: [...ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA.required.filter(key => key !== "handoffId"), "taskSign"],
    properties: {
        ...Object.fromEntries(Object.entries(ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA.properties)
            .filter(([key]) => key !== "handoffId")),
        taskSign: ACCEPTED_TASK_RESPONSE_REVIEW_SIGN_SCHEMA,
    },
};
export const ACCEPTED_RESPONSE_REVIEW_PRESENTATION_UNION_SCHEMA = {
    oneOf: [ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA, ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA],
};
export const ACCEPTED_RESPONSE_REVIEW_DATA_UNION_SCHEMA = {
    ...ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA,
    properties: { ...ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA.properties, presentation: ACCEPTED_RESPONSE_REVIEW_PRESENTATION_UNION_SCHEMA },
};
export const ACCEPTED_RESPONSE_REVIEW_STATE_UNION_SCHEMA = {
    oneOf: [ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA, ACCEPTED_TASK_RESPONSE_REVIEW_STATE_SCHEMA],
};
export const RESPONSE_REVIEW_PRESENTATION_UNION_SCHEMA = {
    oneOf: [RESPONSE_REVIEW_PRESENTATION_SCHEMA, ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA, ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA],
};
export const RESPONSE_REVIEW_STATE_UNION_SCHEMA = {
    oneOf: [RESPONSE_REVIEW_STATE_SCHEMA, ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA, ACCEPTED_TASK_RESPONSE_REVIEW_STATE_SCHEMA],
};
