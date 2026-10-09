import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { TextDecoder } from 'node:util';
import { byteHash, jsonHash, equalJson, checkJsonTree } from './canonical.mjs';
const ajv = new Ajv({ strict: false }); addFormats(ajv);
function schema(name) { return JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url))); }
const validateConfig = ajv.compile(schema('provider-config.schema.json'));
export const validateRequest = ajv.compile(schema('provider-request.schema.json'));
const policySchemaBytes = readFileSync(new URL('../schemas/photo-policy.schema.json', import.meta.url));
if (byteHash(policySchemaBytes) !== 'sha256:acfcfd5460da758dafecd3248b3e395c7170f51923e6668251296a0208c56293') throw new Error('photo policy schema changed');
const validatePolicy = ajv.compile(JSON.parse(policySchemaBytes));
if (byteHash(readFileSync(new URL('../schemas/inspection-result.schema.json', import.meta.url))) !== 'sha256:56a3a9af49ad3137f93420558aaa39bfd859d3d0f0e475b1fe0b7ebe338a7985') throw new Error('inspection schema changed');
export function parseDocument(bytes, maximum) {
  if (!bytes || bytes.length > maximum) throw new Error('document exceeds bound');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  checkJsonTree(value);
  return value;
}
export function loadProviderConfig(configBytes, policyBytes, jwksBytes) {
  const config = parseDocument(configBytes, 256 * 1024);
  const policy = parseDocument(policyBytes, 64 * 1024);
  const jwks = parseDocument(jwksBytes, 64 * 1024);
  if (!validateConfig(config) || !validatePolicy(policy)) throw new Error('closed provider config/policy refused');
  const { registration: registered } = config;
  const identity = registered.credentialIdentity;
  if (jsonHash(registered) !== config.registrationHash || jsonHash(policy) !== config.policyHash || byteHash(jwksBytes) !== config.jwksHash) throw new Error('independent document pin differs');
  if (registered.outputSchema.hash !== 'sha256:56a3a9af49ad3137f93420558aaa39bfd859d3d0f0e475b1fe0b7ebe338a7985') throw new Error('inspection output schema pin differs');
  if (!equalJson(identity.scope, registered.selection.scope) || identity.endpoint !== registered.endpoint
    || !identity.allowedClients.includes(identity.clientId) || !identity.requiredScopes.includes('formspec.instance.resolve')
    || identity.requiredScopes.some(scope => !identity.scopes.includes(scope))) throw new Error('dedicated identity binding differs');
  const endpoint = new URL(registered.endpoint);
  const issuer = new URL(identity.issuer);
  for (const url of [endpoint, issuer]) if (url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(registered.allowDevelopmentLoopbackHttp && identity.allowDevelopmentLoopbackHttp
      && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('fixed secure endpoint required');
  const ceilings = { requestBytes: 32 * 1024 * 1024, responseBytes: 1024 * 1024, attachmentCount: 16,
    attachmentBytes: 15 * 1024 * 1024, totalAttachmentBytes: 16 * 1024 * 1024, concurrency: 1,
    deadlineMillis: 30000, maxEvidenceAgeSeconds: 300, maxValiditySeconds: 900 };
  for (const [key, cap] of Object.entries(ceilings)) if (!Number.isSafeInteger(registered.budgets[key]) || registered.budgets[key] < 1 || registered.budgets[key] > cap) throw new Error('provider transport budget refused');
  if (registered.budgets.attachmentBytes > registered.budgets.totalAttachmentBytes
    || Math.ceil(registered.budgets.totalAttachmentBytes / 3) * 4 >= registered.budgets.requestBytes
    || config.limits.maxBytes < registered.budgets.attachmentBytes) throw new Error('incoherent provider byte budgets');
  const sizeRules = policy.automaticRules.filter(rule => rule.ruleId === 'file-size');
  if (sizeRules.length !== 1 || policy.automaticRules.length !== 11 || new Set(policy.automaticRules.map(rule => rule.ruleId)).size !== 11
    || policy.automaticRules.some(rule => rule.required !== true) || policy.unsupportedAutomatic !== 'blocks-pass') throw new Error('explicit local photo policy refused');
  return { config, policy, jwks, endpointPath: endpoint.pathname, sizeRange: { minimumBytes: sizeRules[0].configuration.minimumBytes, maximumBytes: sizeRules[0].configuration.maximumBytes } };
}
