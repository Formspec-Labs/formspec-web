import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema0 from '../../../vendor/wos-api/_common.schema.json';
import schema1 from '../../../vendor/wos-api/applicant.schema.json';
import schema2 from '../../../vendor/wos-api/error.schema.json';
import schema3 from '../../../vendor/wos-api/governance.schema.json';
import schema4 from '../../../vendor/wos-api/instance.schema.json';
import schema5 from '../../../vendor/wos-api/pagination.schema.json';
import schema6 from '../../../vendor/wos-api/task.schema.json';
import type { ApplicantCaseDetail } from '../../ports/status-reader.ts';

// Exact native API documents and complete declared reference closure.
const ajv = new Ajv2020({ strict: false, allErrors: false });
addFormats(ajv);
for (const schema of [schema0, schema1, schema2, schema3, schema4, schema5, schema6]) ajv.addSchema(schema);
const validate = ajv.getSchema(schema1.$id + '#/$defs/ApplicantCaseDetail');
if (!validate) throw new Error('Applicant case schema unavailable');
export function validateApplicantCaseDetail(value: unknown): value is ApplicantCaseDetail {
  return validate!(value) === true;
}
