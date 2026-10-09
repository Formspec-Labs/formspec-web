import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
import { byteHash, jsonHash, equalJson, atPointer, checkJsonTree } from './canonical.mjs';
import { validateRequest, parseDocument } from './provider-config.mjs';
import { measureAttachment } from './index.mjs';
/* global AbortController */

function freezeJson(value) {
  const pending = [value];
  while (pending.length) { const item = pending.pop(); if (item && typeof item === 'object') { pending.push(...Object.values(item)); Object.freeze(item); } }
  return value;
}
function fail(status) { const error = new Error('provider request refused'); error.status = status; throw error; }
function references(data) {
  const found = [];
  const pending = [data];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (!Array.isArray(value) && ((Object.hasOwn(value, 'contentType') && (Object.hasOwn(value, 'url') || Object.hasOwn(value, 'data'))) || value.kind === 'attachment-ref'
      || ['uri', 'url'].some(key => typeof value[key] === 'string' && value[key].toLowerCase().startsWith('urn:formspec:attachment:')))) found.push(value);
    else pending.push(...Object.values(value).reverse());
  }
  return found;
}
function bindRequest(body, selected, now) {
  const { config, policy } = selected;
  const registration = config.registration;
  if (!validateRequest(body)) fail(422);
  const native = body.nativeRequest;
  const selection = registration.selection;
  if (body.providerId !== registration.providerId || body.providerVersion !== registration.providerVersion
    || body.registrationHash !== config.registrationHash || body.outputSchemaHash !== registration.outputSchema.hash
    || !equalJson(body.budgets, registration.budgets) || !equalJson(native.selection, selection) || !equalJson(native.scope, selection.scope)
    || !equalJson(Object.values(native.sources).sort(), selection.requiredSources.slice().sort())
    || !Object.hasOwn(native.sources, config.photoInstanceName)) fail(409);
  const requested = Date.parse(body.requestedAt);
  if (!Number.isFinite(requested) || requested > now + 30000 || now - requested > registration.budgets.maxEvidenceAgeSeconds * 1000) fail(409);
  if (jsonHash(native.canonicalResponse) !== native.candidateHash || jsonHash(native.formVersion) !== config.formVersionHash) fail(409);
  const requestHash = jsonHash({ operation: native.operation, scope: native.scope, owner: native.owner, selection: native.selection,
    formVersionHash: config.formVersionHash, draftId: native.draftId, draftVersion: native.draftVersion, candidateHash: native.candidateHash, sources: native.sources });
  if (requestHash !== native.requestHash || requestHash !== body.requestHash) fail(409);
  const version = native.formVersion;
  if (version.form_id !== selection.formId || version.form_version_id !== selection.formVersionId
    || version.definition_url !== selection.definitionUrl || version.definition_version !== selection.definitionVersion
    || version.definition_hash !== selection.definitionHash || typeof version.definition_json !== 'string' || version.definition_json.length > 2 * 1024 * 1024) fail(409);
  const definition = parseDocument(Buffer.from(version.definition_json), 2 * 1024 * 1024);
  if (jsonHash(atPointer(definition, config.policyPointer)) !== config.policyHash || !equalJson(atPointer(definition, config.policyPointer), policy)
    || definition.instances?.[config.photoInstanceName]?.source !== native.sources[config.photoInstanceName]) fail(409);
  const declaredSources = Object.fromEntries(Object.entries(definition.instances ?? {}).filter(([, instance]) => typeof instance?.source === 'string' && selection.requiredSources.includes(instance.source)).map(([name, instance]) => [name, instance.source]));
  if (!equalJson(declaredSources, native.sources)) fail(409);
  const refs = references(native.canonicalResponse.data);
  if (refs.length !== body.attachments.length || refs.length > registration.budgets.attachmentCount) fail(409);
  const decoded = [];
  const inventory = [];
  const seen = new Set();
  let total = 0;
  for (let index = 0; index < body.attachments.length; index++) {
    const attachment = body.attachments[index];
    const ref = attachment.reference;
    const refHash = jsonHash(ref);
    if (seen.has(refHash) || !refs.some(candidate => equalJson(ref, candidate)) || ref.kind !== 'attachment-ref'
      || typeof ref.uri !== 'string' || !ref.uri.startsWith('urn:formspec:attachment:') || ref.hash !== attachment.hash
      || ref.mimeType !== attachment.contentType || !Number.isSafeInteger(ref.size) || ref.size < 0
      || ref.size > registration.budgets.attachmentBytes || attachment.bytesBase64.length > Math.ceil(ref.size / 3) * 4) fail(409);
    seen.add(refHash);
    const bytes = Buffer.from(attachment.bytesBase64, 'base64');
    total += bytes.length;
    if (bytes.toString('base64') !== attachment.bytesBase64 || bytes.length !== ref.size || byteHash(bytes) !== attachment.hash
      || total > registration.budgets.totalAttachmentBytes) fail(409);
    inventory.push({ reference: ref, hash: attachment.hash, contentType: attachment.contentType, size: bytes.length });
    decoded.push({ reference: ref, bytes, hash: attachment.hash });
  }
  const callHash = jsonHash({ requestHash, registrationHash: body.registrationHash, outputSchemaHash: body.outputSchemaHash,
    requestedAt: body.requestedAt, attachments: inventory });
  if (callHash !== body.callHash) fail(409);
  let selectedPhoto;
  try { selectedPhoto = atPointer(native.canonicalResponse, config.photoPointer); } catch { selectedPhoto = undefined; }
  const photo = selectedPhoto === undefined ? undefined : decoded.find(attachment => equalJson(attachment.reference, selectedPhoto));
  return { photo, requestHash, missing: selectedPhoto === undefined || selectedPhoto === null };
}

/** Internal DI core. Production entry always supplies the real kernel guard and verifier. */
export function createProviderHandler({ selected, verifyToken, checkContainment, receiptSink, now = () => Date.now() }) {
  const budgets = selected.config.registration.budgets;
  let occupied = false;
  let quarantined = false;
  return async (request, response) => {
    const reply = (status, value) => {
      if (response.destroyed || response.writableEnded) return;
      const body = Buffer.from(JSON.stringify(value));
      if (body.length > budgets.responseBytes) { response.writeHead(503); response.end(); return; }
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'connection': 'close' }); response.end(body);
    };
    if (quarantined) { reply(503, { error: 'provider retired after unsettled cancellation' }); request.resume(); return; }
    if (occupied) { reply(429, { error: 'provider busy' }); request.resume(); return; }
    occupied = true;
    const controller = new AbortController();
    const deadline = performance.now() + budgets.deadlineMillis;
    const timer = setTimeout(() => { controller.abort(); request.destroy(); }, budgets.deadlineMillis);
    const abort = () => controller.abort();
    const unsettled = new Set();
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = () => { const error = new Error('request cancelled'); error.status = 503; reject(error); }; });
    aborted.catch(() => {});
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    const wait = async promise => {
      promise = Promise.resolve(promise);
      unsettled.add(promise);
      promise.then(() => unsettled.delete(promise), () => unsettled.delete(promise));
      return Promise.race([promise, aborted]);
    };
    const check = () => { if (controller.signal.aborted || performance.now() >= deadline) fail(503); };
    request.once('aborted', abort);
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    response.once('close', disconnected);
    try {
      if (request.method !== 'POST' || request.url !== selected.endpointPath || request.headers['content-type'] !== 'application/json') fail(404);
      const authHeaders = (request.rawHeaders ?? []).filter((_, index) => index % 2 === 0).filter(name => name.toLowerCase() === 'authorization');
      if (authHeaders.length !== 1 || typeof request.headers.authorization !== 'string' || !/^Bearer [^\s]+$/.test(request.headers.authorization)) fail(401);
      if (request.headers['content-length'] !== undefined && (!/^\d+$/.test(request.headers['content-length']) || Number(request.headers['content-length']) > budgets.requestBytes)) fail(413);
      try { await wait(verifyToken(request.headers.authorization.slice(7))); } catch { fail(controller.signal.aborted ? 503 : 401); } check();
      const containment = await wait(checkContainment()); check();
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > budgets.requestBytes) fail(413); chunks.push(chunk); check(); }
      let body;
      try { body = parseDocument(Buffer.concat(chunks), budgets.requestBytes); checkJsonTree(body); } catch { fail(422); } check();
      let binding;
      try { binding = bindRequest(body, selected, now()); } catch (error) { fail(error.status ?? 409); } check();
      const { photo } = binding;
      const measurements = photo ? await wait(measureAttachment({ bytes: photo.bytes, attachmentRef: photo.reference.uri, attachmentHash: photo.hash,
        declaredSize: photo.reference.size, requestHash: body.requestHash, candidateHash: body.nativeRequest.candidateHash,
        policyHash: selected.config.policyHash, rulesEdition: selected.policy.edition, limits: { ...selected.config.limits,
          deadlineMillis: Math.max(1, Math.min(selected.config.limits.deadlineMillis, Math.floor(deadline - performance.now()))) },
        sizeRange: selected.sizeRange, signal: controller.signal })) : null; check();
      const receipt = { version: 1, purpose: 'unqualified-photo-provider-diagnostics', registrationHash: body.registrationHash,
        callHash: body.callHash, requestHash: body.requestHash, candidateHash: body.nativeRequest.candidateHash, policyHash: selected.config.policyHash, formVersionHash: selected.config.formVersionHash, ownerHash: jsonHash(body.nativeRequest.owner),
        checkedAt: new Date(now()).toISOString(), containment, measurements };
      const receiptHash = jsonHash(receipt); check();
      await wait(receiptSink(freezeJson({ receiptHash, receipt }), { signal: controller.signal })); check();
      // Recheck authenticated credential at response; no body fact authorizes a caller.
      try { await wait(verifyToken(request.headers.authorization.slice(7))); } catch { fail(controller.signal.aborted ? 503 : 401); } check();
      reply(200, { version: body.version, providerId: body.providerId, providerVersion: body.providerVersion,
        registrationHash: body.registrationHash, outputSchemaHash: body.outputSchemaHash, requestHash: body.requestHash, callHash: body.callHash,
        results: Object.entries(body.nativeRequest.sources).map(([instanceName, sourceRef]) => ({ status: instanceName === selected.config.photoInstanceName && binding.missing ? 'pending' : 'unavailable', instanceName, sourceRef,
          reason: instanceName === selected.config.photoInstanceName && !measurements
            ? 'No selected owned photo attachment is available for measurement.'
            : instanceName === selected.config.photoInstanceName
            ? `Required inspection executors unqualified. Diagnostic bytes=${measurements.byteLength}; within selected size range=${measurements.fileSizeObservation.withinRange}; decode=${measurements.decoding.status}.`
            : 'No qualified executor is configured for this selected source.' })) });
    } catch (error) { reply(error.status ?? 503, { error: 'provider request refused' }); }
    finally {
      clearTimeout(timer); request.removeListener('aborted', abort); response.removeListener('close', disconnected);
      if (unsettled.size) {
        let grace;
        await Promise.race([Promise.allSettled([...unsettled]), new Promise(resolve => { grace = setTimeout(resolve, 100); })]);
        clearTimeout(grace);
        if (unsettled.size) quarantined = true; // Never overlap an abandoned decoder/sink with a new job.
      }
      controller.signal.removeEventListener('abort', rejectAbort);
      occupied = false;
    }
  };
}
