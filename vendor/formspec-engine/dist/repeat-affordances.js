/**
 * Read repeat chrome state for the repeatable group at `repeatPath`. It reads the engine's count and
 * relevance signals, so a caller inside a computed, effect, or subscription tracks both.
 * Bounds gate presentation only; the engine still reports MIN_REPEAT / MAX_REPEAT cardinality results.
 */
export function readRepeatAffordances(engine, repeatPath, item, locks = {}) {
    const count = engine.repeats[repeatPath]?.value ?? 0;
    const maxRepeat = item?.maxRepeat;
    return {
        count,
        relevant: engine.relevantSignals[repeatPath]?.value ?? true,
        canAdd: locks.allowAdd !== false && (maxRepeat === undefined || count < maxRepeat),
        canRemove: locks.allowRemove !== false && count > (item?.minRepeat ?? 0),
    };
}
