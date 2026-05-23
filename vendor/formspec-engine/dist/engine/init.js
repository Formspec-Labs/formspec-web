/** @filedesc Factory for FormEngine instances. */
import { FormEngine } from './FormEngine.js';
export function createFormEngine(definition, options) {
    return new FormEngine(definition, options);
}
