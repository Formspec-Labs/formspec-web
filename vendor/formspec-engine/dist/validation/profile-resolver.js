const PROFILE_TO_TRIGGER = {
    live: 'continuous',
    'on-submit': 'submit',
    'on-demand': 'demand',
    off: 'disabled',
};
/**
 * Bridges the closed Validation Mapping profile enum to the engine's internal trigger vocabulary.
 */
export class DefaultValidationProfileResolver {
    resolve(profile) {
        const trigger = PROFILE_TO_TRIGGER[profile];
        if (trigger === undefined) {
            throw new Error(`Unknown validation profile: ${profile}`);
        }
        return trigger;
    }
}
