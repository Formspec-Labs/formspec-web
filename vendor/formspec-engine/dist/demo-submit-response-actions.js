/** Build a minimal Response Actions sidecar for demos, stories, and test fixtures. */
export function createDemoSubmitResponseActions(options) {
    const actionId = options.actionId ?? 'submit';
    const emitOnValidationError = options.emitOnValidationError !== false;
    return {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        targetDefinition: { url: options.definitionUrl },
        actions: [
            {
                id: actionId,
                intent: 'submit',
                ...(emitOnValidationError
                    ? {
                        validation: {
                            profile: 'on-submit',
                            blocking: 'non-blocking',
                            persistence: 'none',
                        },
                    }
                    : {}),
                effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
            },
        ],
    };
}
