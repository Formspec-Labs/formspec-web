export declare function resolveDraftReviewTarget(surface: unknown, reviewRoute: unknown, binding: unknown, widgetShape: unknown): {
    readonly status: "unresolved";
    readonly reason: "invalid-binding";
    readonly definitionRef?: undefined;
    readonly formBinding?: undefined;
} | {
    readonly status: "unresolved";
    readonly reason: "form-unresolved";
    readonly definitionRef?: undefined;
    readonly formBinding?: undefined;
} | {
    readonly status: "unresolved";
    readonly reason: "subject-keys-invalid";
    readonly definitionRef?: undefined;
    readonly formBinding?: undefined;
} | {
    readonly status: "ready";
    readonly definitionRef: string;
    readonly formBinding: import("./surface-widgets.js").JsonRecord;
    readonly reason?: undefined;
};
