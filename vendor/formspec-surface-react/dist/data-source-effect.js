/** Stop later owner phases when this effect retires; host authority stays in the ports. */
export function currentEffectDataSourcePorts(isCurrent, { loader, authorize, validatePayload }) {
    const check = () => {
        if (!isCurrent())
            throw new Error('Surface data load effect retired');
    };
    const invoke = (dispatch) => {
        check();
        const result = dispatch();
        const complete = (value) => { check(); return value; };
        // Preserve synchronous ports; only asynchronous results need a continuation.
        return typeof result?.then === 'function'
            ? Promise.resolve(result).then(complete)
            : complete(result);
    };
    return {
        loader: loader ? request => invoke(() => loader(request)) : undefined,
        authorize: authorize ? request => invoke(() => authorize(request)) : undefined,
        validatePayload: validatePayload ? request => invoke(() => validatePayload(request)) : undefined,
    };
}
