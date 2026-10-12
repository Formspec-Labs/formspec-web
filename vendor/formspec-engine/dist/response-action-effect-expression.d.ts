/**
 * Native FEL evaluation of fields and effect-time object bindings. Requires
 * initFormspecEngineTools(). Callable bindings (including @now()) are not yet
 * supported by this adapter; a host with a full binding catalog may supply its
 * own evaluateEffectExpression port.
 */
export declare function evaluateResponseActionEffectExpression(expression: string, context: {
    fields: Record<string, unknown>;
    bindings?: Record<string, unknown>;
    nowIso?: string;
}): unknown;
