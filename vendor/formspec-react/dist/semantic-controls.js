/** @filedesc Exact, renderer-owned semantic control lookup and activation. */
function nonEmpty(value) {
    return value.trim() === value && value.length > 0;
}
function assertRegistrationValid(registration) {
    const { control, renderInstanceId, responseId } = registration;
    if (!nonEmpty(renderInstanceId)
        || !nonEmpty(responseId)
        || !nonEmpty(control.artifactRef)
        || !nonEmpty(control.artifactDigest)
        || !nonEmpty(control.subjectRef)) {
        throw new TypeError('semantic control identity fields must be non-empty');
    }
    if (registration.capability === 'set-item'
        && control.subjectKind !== 'definition-item') {
        throw new TypeError('set-item controls must identify a definition-item');
    }
    if (registration.capability === 'activate-control'
        && control.subjectKind !== 'response-action') {
        throw new TypeError('activate-control controls must identify a response-action');
    }
}
function exactKey(target) {
    const { control } = target;
    return JSON.stringify([
        target.renderInstanceId,
        control.artifactRef,
        control.artifactDigest,
        control.subjectKind,
        control.subjectRef,
    ]);
}
function renderSubjectKey(target) {
    const { control } = target;
    return JSON.stringify([
        target.renderInstanceId,
        control.artifactRef,
        control.subjectKind,
        control.subjectRef,
    ]);
}
function subjectKey(target) {
    const { control } = target;
    return JSON.stringify([
        control.artifactRef,
        control.subjectKind,
        control.subjectRef,
    ]);
}
function targetFor(registration) {
    return {
        renderInstanceId: registration.renderInstanceId,
        control: registration.control,
    };
}
function refusal(target, reason, message) {
    return { status: 'refused', target, reason, message };
}
function controlEquals(left, right) {
    return left.artifactRef === right.artifactRef
        && left.artifactDigest === right.artifactDigest
        && left.subjectKind === right.subjectKind
        && left.subjectRef === right.subjectRef;
}
function responseBindingProblem(binding) {
    if (!nonEmpty(binding.responseId)) {
        return 'the owner returned an empty Response identity';
    }
    if (!Number.isInteger(binding.responseRevision)
        || binding.responseRevision < 0) {
        return 'the owner returned an invalid Response revision';
    }
    return undefined;
}
/**
 * Creates one aggregation domain. A Surface normally supplies one registry to
 * every mounted route/slot renderer, so exact lookup works across generic
 * Definition forms without querying the DOM.
 */
export function createSemanticControlRegistry() {
    let registrationSequence = 0;
    const active = new Map();
    const exactHistory = new Set();
    const subjectHistory = new Set();
    const latestResponseRevision = new Map();
    const recordResponseBinding = (target, binding, operation) => {
        const problem = responseBindingProblem(binding);
        if (problem)
            return refusal(target, 'response-mismatch', problem);
        const previousRevision = latestResponseRevision.get(binding.responseId);
        if (previousRevision !== undefined) {
            const revisionWentBack = binding.responseRevision < previousRevision;
            const setDidNotAdvance = operation === 'set-item'
                && binding.responseRevision === previousRevision;
            if (revisionWentBack || setDidNotAdvance) {
                return refusal(target, 'response-mismatch', 'the owner returned a non-monotonic Response revision');
            }
        }
        latestResponseRevision.set(binding.responseId, binding.responseRevision);
        return undefined;
    };
    const resolve = (target, capability) => {
        const exact = active.get(exactKey(target)) ?? [];
        if (exact.length > 1) {
            return refusal(target, 'ambiguous', 'more than one mounted control has the exact qualified identity');
        }
        if (exact.length === 1) {
            const registration = exact[0];
            if (registration.capability !== capability) {
                return refusal(target, 'unsupported', `the exact control does not support ${capability}`);
            }
            if (registration.disabled()) {
                return refusal(target, 'disabled', 'the exact rendered control is disabled');
            }
            return registration;
        }
        const mounted = [...active.values()].flat();
        const sameRenderSubject = mounted.some((registration) => renderSubjectKey(targetFor(registration)) === renderSubjectKey(target));
        const sameSubject = mounted.some((registration) => subjectKey(targetFor(registration)) === subjectKey(target));
        if (sameRenderSubject || sameSubject) {
            return refusal(target, 'stale', 'the subject exists under a different digest or render instance');
        }
        if (exactHistory.has(exactKey(target))) {
            return refusal(target, 'unmounted', 'the exact rendered control is no longer mounted');
        }
        if (subjectHistory.has(subjectKey(target))) {
            return refusal(target, 'stale', 'the subject was previously rendered under a different qualified identity');
        }
        return refusal(target, 'unresolved', 'no rendered control has the qualified identity');
    };
    return {
        register(registration) {
            assertRegistrationValid(registration);
            registrationSequence += 1;
            const stored = {
                ...registration,
                control: Object.freeze({ ...registration.control }),
                registrationId: registrationSequence,
            };
            const target = targetFor(stored);
            const key = exactKey(target);
            const responseId = stored.responseId;
            exactHistory.add(key);
            subjectHistory.add(subjectKey(target));
            active.set(key, [...(active.get(key) ?? []), stored]);
            let mounted = true;
            return () => {
                if (!mounted)
                    return;
                mounted = false;
                const remaining = (active.get(key) ?? []).filter((candidate) => candidate.registrationId !== stored.registrationId);
                if (remaining.length > 0)
                    active.set(key, remaining);
                else
                    active.delete(key);
                const responseStillMounted = [...active.values()].some((registrations) => registrations.some((candidate) => candidate.responseId === responseId));
                if (!responseStillMounted) {
                    latestResponseRevision.delete(responseId);
                }
            };
        },
        setItem(target, value) {
            const registration = resolve(target, 'set-item');
            if ('status' in registration)
                return registration;
            if (registration.capability !== 'set-item') {
                return refusal(target, 'unsupported', 'the exact control cannot set an item');
            }
            try {
                const responseBinding = registration.setItem(value);
                if (responseBinding.responseId !== registration.responseId) {
                    return refusal(target, 'response-mismatch', 'the control returned a different owner Response identity');
                }
                const bindingRefusal = recordResponseBinding(target, responseBinding, 'set-item');
                if (bindingRefusal)
                    return bindingRefusal;
                return { status: 'set', target, responseBinding };
            }
            catch (error) {
                return refusal(target, 'operation-failed', error instanceof Error ? error.message : String(error));
            }
        },
        async activateControl(target, context) {
            const registration = resolve(target, 'activate-control');
            if ('status' in registration)
                return registration;
            if (registration.capability !== 'activate-control') {
                return refusal(target, 'unsupported', 'the exact control cannot activate an Action');
            }
            let activation;
            const expectedBindingProblem = responseBindingProblem(context.responseBinding);
            const currentRevision = latestResponseRevision.get(context.responseBinding.responseId);
            if (expectedBindingProblem
                || currentRevision === undefined
                || currentRevision !== context.responseBinding.responseRevision) {
                return refusal(target, 'response-mismatch', expectedBindingProblem
                    ?? 'the activation does not name the current set-item Response revision');
            }
            try {
                const { responseBinding: _expectedResponseBinding, ...invocationContext } = context;
                activation = await registration.activate({
                    ...invocationContext,
                    actionArtifact: {
                        artifactRef: target.control.artifactRef,
                        artifactDigest: target.control.artifactDigest,
                    },
                });
            }
            catch (error) {
                return refusal(target, 'operation-failed', error instanceof Error ? error.message : String(error));
            }
            const { invocation, responseBinding } = activation;
            if (invocation.invocationId !== context.invocationId) {
                return refusal(target, 'invocation-mismatch', 'the renderer returned a different or missing invocation identity');
            }
            if (!invocation.actionOwner
                || !controlEquals(invocation.actionOwner, target.control)) {
                return refusal(target, 'owner-mismatch', 'the invocation did not return the exact registered Action owner');
            }
            const response = invocation.detail && typeof invocation.detail === 'object'
                ? invocation.detail.response
                : undefined;
            if (response?.id !== responseBinding.responseId) {
                return refusal(target, 'response-mismatch', 'the invoked Action returned a different or missing Response identity');
            }
            if (responseBinding.responseId !== registration.responseId
                ||
                    responseBinding.responseId !== context.responseBinding.responseId
                || responseBinding.responseRevision < context.responseBinding.responseRevision) {
                return refusal(target, 'response-mismatch', 'the invoked Action did not continue the expected Response revision');
            }
            const bindingRefusal = recordResponseBinding(target, responseBinding, 'activate-control');
            if (bindingRefusal)
                return bindingRefusal;
            return {
                status: 'activated',
                target,
                invocationId: context.invocationId,
                actionOwner: invocation.actionOwner,
                responseBinding,
                invocation,
            };
        },
    };
}
