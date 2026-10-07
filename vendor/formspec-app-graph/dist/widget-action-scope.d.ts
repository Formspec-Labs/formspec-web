export declare const CANONICAL_RESPONSE_SCHEMA_REF = "https://formspec.org/schemas/response/1.0";
export interface WidgetActionScopeInput {
    document: {
        scope?: unknown;
        targetDefinition?: unknown;
    };
    responseInput?: unknown;
    inputs: readonly {
        name: string;
        required: boolean;
    }[];
    sourceSchema?: unknown;
    definition?: {
        url: string;
        version?: string;
    } | undefined;
}
/** Static ownership only; the host still admits payload, actor and current revision. */
export declare function widgetActionScopeMatches(input: WidgetActionScopeInput): boolean;
