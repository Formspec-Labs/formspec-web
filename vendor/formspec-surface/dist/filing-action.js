/** @filedesc Identify Definition actions that operate on a committed draft revision. */
import { resolveServiceRequest } from '@formspec-org/engine/render';
export function filingAction(document, action) {
    if (!action || document?.scope === 'app')
        return undefined;
    const catalog = document?.['x-formspec-runtime'];
    for (const effect of action.effects ?? []) {
        if (!catalog || effect.type !== 'serviceRequest')
            continue;
        const operation = resolveServiceRequest(catalog, effect.requestRef).operation;
        if (operation === 'prepare' || operation === 'sign')
            return operation;
    }
    return action.intent === 'submit' ? 'submit' : undefined;
}
