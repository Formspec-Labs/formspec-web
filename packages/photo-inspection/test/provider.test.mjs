/* global structuredClone */
import process from 'node:process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { providerFixture } from './provider-fixture.mjs';
import { createProviderHandler } from '../src/provider-core.mjs';
import { createTokenVerifier } from '../src/token-verifier.mjs';
import { createRegisteredPhotoProvider } from '../src/provider.mjs';
import { loadProviderConfig } from '../src/provider-config.mjs';
import { validateContainmentObservation } from '../src/containment.mjs';
import { jsonHash } from '../src/canonical.mjs';
const fixture = await providerFixture();
function request(body, token) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method: 'POST', url: '/resolve', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, rawHeaders: ['Authorization', `Bearer ${token}`] });
  return req;
}
class Response extends EventEmitter {
  writeHead(status) { this.status = status; }
  end(body) { this.body = body ? JSON.parse(body) : null; this.writableEnded = true; }
}
function rebind(body) {
  const native = body.nativeRequest;
  native.candidateHash = jsonHash(native.canonicalResponse);
  native.requestHash = jsonHash({ operation: native.operation, scope: native.scope, owner: native.owner, selection: native.selection, formVersionHash: jsonHash(native.formVersion), draftId: native.draftId, draftVersion: native.draftVersion, candidateHash: native.candidateHash, sources: native.sources });
  body.requestHash = native.requestHash;
  body.callHash = jsonHash({ requestHash: body.requestHash, registrationHash: body.registrationHash, outputSchemaHash: body.outputSchemaHash, requestedAt: body.requestedAt, attachments: body.attachments.map(item => ({ reference: item.reference, hash: item.hash, contentType: item.contentType, size: Buffer.from(item.bytesBase64, 'base64').length })) });
  return body;
}
function handler(options = {}) {
  const receipts = [];
  const handle = createProviderHandler({ selected: fixture.selected,
    verifyToken: createTokenVerifier(fixture.config.registration.credentialIdentity, fixture.config.serviceSubject, JSON.parse(fixture.jwksBytes), () => fixture.now),
    checkContainment: async () => ({ purpose: 'TEST observation only; no kernel containment claim' }),
    receiptSink: async receipt => { receipts.push(receipt); }, now: () => fixture.now, ...options });
  return { handle, receipts };
}
test('exact committed-shape batch checks actual bytes and returns only exact unavailable states', async () => {
  const { handle, receipts } = handler(); const response = new Response();
  await handle(request(fixture.body, await fixture.token(fixture.claims)), response);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['version', 'providerId', 'providerVersion', 'registrationHash', 'outputSchemaHash', 'requestHash', 'callHash', 'results'].sort());
  assert.equal(response.body.callHash, fixture.body.callHash);
  assert.equal(response.body.results.length, 2);
  assert.ok(response.body.results.every(row => row.status === 'unavailable' && Object.keys(row).length === 4));
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].receipt.measurements.decoding.width, 12);
  assert.equal(receipts[0].receipt.measurements.fileSizeObservation.withinRange, false);
  assert.equal(receipts[0].receiptHash, jsonHash(receipts[0].receipt));
  assert.ok(!JSON.stringify(receipts[0]).includes(fixture.body.attachments[0].bytesBase64));
});
test('request identities, complete native preimages, unknown fields and byte inventory refuse without receipts', async () => {
  const validToken = await fixture.token(fixture.claims);
  for (const mutate of [body => { body.providerVersion = 'changed'; }, body => { body.nativeRequest.canonicalResponse.data.extra = true; },
    body => { body.nativeRequest.owner.subjectRef = 'changed'; }, body => { body.nativeRequest.formVersion.created_by = 'changed'; },
    body => { body.nativeRequest.selection.scope.tenant_id = 'changed'; }, body => { body.attachments[0].bytesBase64 = 'YQ=='; },
    body => { body.callHash = jsonHash('wrong'); }, body => { body.extra = true; }, body => { body.requestedAt = '2000-01-01T00:00:00Z'; },
    body => { body.attachments.push(body.attachments[0]); }, body => { body.nativeRequest.sources.other = 'urn:changed'; }]) {
    const changed = structuredClone(fixture.body); mutate(changed);
    const { handle, receipts } = handler(); const response = new Response(); await handle(request(changed, validToken), response);
    assert.ok([409, 422].includes(response.status), JSON.stringify(response)); assert.equal(receipts.length, 0);
  }
});
test('real JWT signature and dedicated issuer/audience/client/subject/scope/date checks refuse', async () => {
  const verify = createTokenVerifier(fixture.config.registration.credentialIdentity, fixture.config.serviceSubject, JSON.parse(fixture.jwksBytes), () => fixture.now);
  assert.equal((await verify(await fixture.token(fixture.claims))).clientId, 'source-photo-client');
  for (const changed of [{ iss: 'https://wrong.example' }, { aud: 'respondent-api' }, { azp: 'applicant-client' }, { sub: 'applicant' },
    { scope: 'formspec.instance.resolve  extra' }, { scope: 'other' }, { typ: 'ID' }, { exp: Math.floor(fixture.now / 1000) },
    { iat: fixture.claims.iat + 31 }, { exp: fixture.claims.iat + 86401 }, { nbf: fixture.claims.exp }, { iat: 1.5 }, { jti: 3 }, { jti: '   ' }]) {
    await assert.rejects(verify(await fixture.token({ ...fixture.claims, ...changed })));
  }
  const token = await fixture.token(fixture.claims);
  await assert.rejects(verify(token.slice(0, -8) + 'xxxxxxxx'));
  const { handle } = handler(); const response = new Response(); await handle(request(fixture.body, 'invalid'), response); assert.equal(response.status, 401);
});
test('clock rollback and unknown JWKS keys refuse; unsupported profiles do not fall back', async () => {
  let now = fixture.now;
  const verify = createTokenVerifier(fixture.config.registration.credentialIdentity, fixture.config.serviceSubject, JSON.parse(fixture.jwksBytes), () => now);
  const token = await fixture.token(fixture.claims); await verify(token); now -= 2000; await assert.rejects(verify(token), /clock/);
  const keys = JSON.parse(fixture.jwksBytes); keys.keys[0].kid = 'other';
  await assert.rejects(createTokenVerifier(fixture.config.registration.credentialIdentity, fixture.config.serviceSubject, keys)(token));
  assert.throws(() => createTokenVerifier({ ...fixture.config.registration.credentialIdentity, profile: 'rfc9068' }, fixture.config.serviceSubject, keys), /unsupported/);
});
test('one complete request slot rejects concurrent calls and sink refusal cannot succeed', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  let started; const entered = new Promise(resolve => { started = resolve; });
  const { handle } = handler({ receiptSink: async () => { started(); await gate; } });
  const token = await fixture.token(fixture.claims); const one = new Response(); const pending = handle(request(fixture.body, token), one); await entered;
  const two = new Response(); await handle(request(fixture.body, token), two); assert.equal(two.status, 429);
  release(); await pending; assert.equal(one.status, 200);
  const broken = handler({ receiptSink: async () => { throw new Error('disk refused'); } });
  const response = new Response(); await broken.handle(request(fixture.body, token), response); assert.equal(response.status, 503);
});
test('request cancellation at receipt await cannot return successful unavailable response', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  let started; const entered = new Promise(resolve => { started = resolve; });
  const { handle } = handler({ receiptSink: async () => { started(); await gate; } });
  const req = request(fixture.body, await fixture.token(fixture.claims)); const response = new Response();
  const pending = handle(req, response); await entered; req.emit('aborted'); release(); await pending;
  assert.equal(response.status, 503);
});
const observation = { platform: 'linux', uid: 1000, cgroup: '0::/\n', status: 'NoNewPrivs:\t1\nCapEff:\t0000000000000000\n', memory: '536870912', swap: '0', pids: '64', cpu: '100000 100000',
  mountInfo: '1 0 1:0 / / ro - overlay overlay ro\n2 1 0:1 / /sys/fs/cgroup ro - cgroup2 cgroup ro\n' };
test('containment parser refuses unlimited native resources, privilege and writable mount observations', () => {
  assert.equal(validateContainmentObservation(observation).memoryBytes, 536870912);
  for (const changed of [{ memory: 'max' }, { memory: '536870913' }, { pids: 'max' }, { swap: '1' }, { cpu: 'max 100000' },
    { cpu: '200000 100000' }, { uid: 0 }, { platform: 'darwin' }, { cgroup: '0::/other' }, { status: 'NoNewPrivs:\t0\nCapEff:\t0' },
    { mountInfo: observation.mountInfo.replace('/sys/fs/cgroup ro', '/sys/fs/cgroup rw') }]) assert.throws(() => validateContainmentObservation({ ...observation, ...changed }));
});
test('config and policy/JWKS pins refuse silently changed trust or size policy', () => {
  const encode = config => Buffer.from(JSON.stringify(config));
  const changed = structuredClone(fixture.config); changed.serviceSubject = ''; assert.throws(() => loadProviderConfig(encode(changed), fixture.policyBytes, fixture.jwksBytes));
  const policy = JSON.parse(fixture.policyBytes); policy.automaticRules[1].configuration.minimumBytes = 1;
  assert.throws(() => loadProviderConfig(encode(fixture.config), Buffer.from(JSON.stringify(policy)), fixture.jwksBytes), /pin|closed/);
  assert.throws(() => loadProviderConfig(encode(fixture.config), fixture.policyBytes, Buffer.from('{}')), /pin/);
});
test('actual production factory refuses this uncontained host; DI tests do not establish external containment', { skip: process.platform === 'linux' }, async () => {
  await assert.rejects(createRegisteredPhotoProvider({ configBytes: Buffer.from(JSON.stringify(fixture.config)), policyBytes: fixture.policyBytes,
    jwksBytes: fixture.jwksBytes, receiptSink: async () => {} }));
});

test('whole request deadline cancels decoder and cannot record successful diagnostics', async () => {
  const config = structuredClone(fixture.config); config.registration.budgets.deadlineMillis = 20; config.registrationHash = jsonHash(config.registration);
  const selected = loadProviderConfig(Buffer.from(JSON.stringify(config)), fixture.policyBytes, fixture.jwksBytes);
  const { handle, receipts } = handler({ selected }); const response = new Response();
  const body = structuredClone(fixture.body); body.budgets.deadlineMillis = 20; body.registrationHash = config.registrationHash; rebind(body);
  await handle(request(body, await fixture.token(fixture.claims)), response);
  assert.equal(response.status, 503); assert.equal(receipts.length, 0);
});

test('missing photo remains a legitimate pending state for an exact incomplete saved candidate', async () => {
  const body = structuredClone(fixture.body); delete body.nativeRequest.canonicalResponse.data.photo; body.attachments = []; rebind(body);
  const { handle, receipts } = handler(); const response = new Response();
  await handle(request(body, await fixture.token(fixture.claims)), response);
  assert.equal(response.status, 200);
  assert.equal(response.body.results.find(row => row.instanceName === 'photoCheck').status, 'pending');
  assert.equal(receipts[0].receipt.measurements, null);
});
test('recomputed request hashes cannot rename a pinned Definition source instance', async () => {
  const body = structuredClone(fixture.body); body.nativeRequest.sources.renamed = body.nativeRequest.sources.other; delete body.nativeRequest.sources.other; rebind(body);
  const { handle, receipts } = handler(); const response = new Response();
  await handle(request(body, await fixture.token(fixture.claims)), response);
  assert.equal(response.status, 409); assert.equal(receipts.length, 0);
});
test('inventory recognizes Source contentType/url/data predicate, without inventing type attachment', async () => {
  const token = await fixture.token(fixture.claims);
  const body = structuredClone(fixture.body); body.nativeRequest.canonicalResponse.data.inline = { contentType: 'image/png', data: 'unretained' }; rebind(body);
  const { handle } = handler(); const response = new Response(); await handle(request(body, token), response); assert.equal(response.status, 409);
  const unrelated = structuredClone(fixture.body); unrelated.nativeRequest.canonicalResponse.data.business = { type: 'attachment', note: 'not Source attachment vocabulary' }; rebind(unrelated);
  const next = new Response(); await handle(request(unrelated, token), next); assert.equal(next.status, 200);
});
test('abandoned receipt sink retires slot after bounded cleanup without overlapping jobs', async () => {
  let entered; const start = new Promise(resolve => { entered = resolve; });
  const { handle } = handler({ receiptSink: async () => { entered(); await new Promise(() => {}); } });
  const token = await fixture.token(fixture.claims); const req = request(fixture.body, token); const response = new Response();
  const pending = handle(req, response); await start; req.emit('aborted'); await pending;
  assert.equal(response.status, 503);
  const next = new Response(); await handle(request(fixture.body, token), next); assert.equal(next.status, 503);
  assert.match(next.body.error, /retired/);
});
test('stalled input is bounded by the whole-call deadline', async () => {
  const config = structuredClone(fixture.config); config.registration.budgets.deadlineMillis = 30; config.registrationHash = jsonHash(config.registration);
  const selected = loadProviderConfig(Buffer.from(JSON.stringify(config)), fixture.policyBytes, fixture.jwksBytes);
  const { handle } = handler({ selected });
  const req = new Readable({ read() {} }); const token = await fixture.token(fixture.claims);
  Object.assign(req, { method: 'POST', url: '/resolve', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, rawHeaders: ['Authorization', `Bearer ${token}`] });
  const response = new Response(); await handle(req, response); assert.equal(response.status, 503);
});
test('oversized or duplicate-auth headers and malformed input refuse before measurement', async () => {
  const token = await fixture.token(fixture.claims);
  const { handle, receipts } = handler();
  const huge = request(fixture.body, token); huge.headers['content-length'] = '1000001'; const response = new Response(); await handle(huge, response); assert.equal(response.status, 413);
  const duplicate = request(fixture.body, token); duplicate.rawHeaders.push('Authorization', `Bearer ${token}`); const two = new Response(); await handle(duplicate, two); assert.equal(two.status, 401);
  const malformed = request(null, token); const three = new Response(); await handle(malformed, three); assert.equal(three.status, 422);
  assert.equal(receipts.length, 0);
});
test('token expiry and rollback during crypto fail final clock checks', async () => {
  const token = await fixture.token(fixture.claims);
  for (const after of [fixture.claims.exp * 1000, fixture.now - 2000, 0]) {
    let calls = 0;
    const verify = createTokenVerifier(fixture.config.registration.credentialIdentity, fixture.config.serviceSubject, JSON.parse(fixture.jwksBytes), () => ++calls === 1 ? fixture.now : after);
    await assert.rejects(verify(token));
  }
});
test('guard failure or expired credential after receipt cannot succeed', async () => {
  const broken = handler({ checkContainment: async () => { throw new Error('uncontained'); } });
  const token = await fixture.token(fixture.claims); const response = new Response(); await broken.handle(request(fixture.body, token), response); assert.equal(response.status, 503);
  let clock = fixture.now;
  const delayed = handler({ verifyToken: createTokenVerifier(fixture.config.registration.credentialIdentity, fixture.config.serviceSubject, JSON.parse(fixture.jwksBytes), () => clock), receiptSink: async () => { clock = fixture.claims.exp * 1000; } });
  const two = new Response(); await delayed.handle(request(fixture.body, token), two); assert.equal(two.status, 401);
});
test('diagnostic receipt is immutable across the sink await', async () => {
  const { handle } = handler({ receiptSink: async record => { record.receipt.measurements.byteLength = 0; } });
  const response = new Response(); await handle(request(fixture.body, await fixture.token(fixture.claims)), response); assert.equal(response.status, 503);
});
