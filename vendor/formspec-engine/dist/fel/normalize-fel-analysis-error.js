/** @filedesc Map WASM/Rust `fel_analysis_to_json_value` error entries to {@link FELAnalysisError}. */
/** 1-based line and column at a Unicode scalar index (matches Rust lexer char indices). */
export function lineColumnAtCharOffset(expression, charOffset) {
    let line = 1;
    let column = 1;
    let i = 0;
    for (const ch of expression) {
        if (i === charOffset) {
            return { line, column };
        }
        if (ch === '\n') {
            line++;
            column = 1;
        }
        else {
            column++;
        }
        i++;
    }
    return { line, column };
}
/**
 * Normalize legacy string errors, `{ message, span }` from Rust, or partially-filled objects.
 */
export function normalizeFelAnalysisError(expression, e) {
    if (typeof e === 'string') {
        return { message: e, line: 1, column: 1, offset: 0 };
    }
    const msg = e.message;
    const span = e.span;
    const out = { message: msg };
    if (span != null && typeof span.start === 'number' && typeof span.end === 'number') {
        out.span = { start: span.start, end: span.end };
        out.offset = span.start;
        const lc = lineColumnAtCharOffset(expression, span.start);
        out.line = lc.line;
        out.column = lc.column;
        return out;
    }
    if (typeof e.offset === 'number') {
        out.offset = e.offset;
        const lc = lineColumnAtCharOffset(expression, e.offset);
        out.line = lc.line;
        out.column = lc.column;
        return out;
    }
    if (typeof e.line === 'number')
        out.line = e.line;
    if (typeof e.column === 'number')
        out.column = e.column;
    out.line ?? (out.line = 1);
    out.column ?? (out.column = 1);
    out.offset ?? (out.offset = 0);
    return out;
}
