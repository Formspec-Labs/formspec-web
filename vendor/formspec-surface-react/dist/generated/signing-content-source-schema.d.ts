/** AUTO-GENERATED from common.schema.json SigningContentSource; run npm run schema:generate. */
export declare const SIGNING_CONTENT_SOURCE_PROPS_SCHEMA: {
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
