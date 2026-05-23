import type { FormDefinition } from '../ports/definition-source.ts';
import sampleForm from './sample-form.json';

export const demoSampleForm = sampleForm as FormDefinition;
export const demoSampleFormUrl = demoSampleForm.url;
