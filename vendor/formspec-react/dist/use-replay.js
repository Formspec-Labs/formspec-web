'use client';
/** @filedesc useReplay — event sourcing and deterministic replay for form state. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';
export function useReplay() {
    const { engine } = useFormspecContext();
    const applyEvent = useCallback((event) => {
        return engine.applyReplayEvent(event);
    }, [engine]);
    const replayFn = useCallback((events, options) => {
        return engine.replay(events, options);
    }, [engine]);
    return { applyEvent, replay: replayFn };
}
