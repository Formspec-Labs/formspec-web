import { setTimeout } from 'node:timers/promises';
import { URL } from 'node:url';
/* global AbortController */
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { measureAttachment, unavailableInspection } from '../src/index.mjs';
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const context = bytes => ({ bytes, attachmentRef: 'urn:owned:photo:one', attachmentHash: digest(bytes), declaredSize: bytes.length,
  requestHash: digest('request'), candidateHash: digest('candidate'), policyHash: digest('policy'), rulesEdition: 'test-unadopted',
  sizeRange: { minimumBytes: 54000, maximumBytes: 10000000 },
  limits: { maxBytes: 1_000_000, maxPixels: 1000, deadlineMillis: 4000 } });
test('real PNG measurements preserve dimensions and chromatic observations without compliance', async () => {
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } }).png().toBuffer();
  const result = await measureAttachment(context(bytes));
  assert.equal(result.byteLength, bytes.length);
  assert.equal(result.detectedMimeType, 'image/png');
  assert.equal(result.decoding.status, 'decoded');
  assert.equal(result.decoding.width, 12);
  assert.equal(result.decoding.height, 8);
  assert.equal(result.decoding.chromaticPixels, 96);
  assert.equal(result.historyVerified, false);
  const inspection = unavailableInspection(result, { checkedAt: '2026-10-09T12:00:00Z', evidenceRef: 'urn:evidence:test:one', source: 'test-only' });
  assert.equal(inspection.status, 'unavailable');
  assert.equal(new Set(inspection.observations.map(row => row.ruleId)).size, 11);
  assert.ok(inspection.observations.every(row => row.status === 'unsupported' && row.executor === null && row.result === null));
});
test('actual grayscale JPEG observations do not infer compliance', async () => {
  const bytes = await sharp({ create: { width: 9, height: 6, channels: 3, background: 'gray' } }).jpeg().toBuffer();
  const result = await measureAttachment(context(bytes));
  assert.equal(result.decoding.status, 'decoded');
  assert.equal(result.decoding.chromaticPixels, 0);
});
test('custody and byte budget refuse before decode', async () => {
  const bytes = Buffer.from('not an image');
  await assert.rejects(measureAttachment({ ...context(bytes), attachmentHash: digest('different') }), /custody/);
  await assert.rejects(measureAttachment({ ...context(bytes), declaredSize: 1 }), /custody/);
  await assert.rejects(measureAttachment({ ...context(bytes), limits: { ...context(bytes).limits, maxBytes: 1 } }), /byte budget/);
});
test('unsupported format, corrupt PNG and excessive pixels remain truthful refusals', async () => {
  const unknown = await measureAttachment(context(Buffer.from('not image bytes')));
  assert.equal(unknown.decoding.status, 'unsupported');
  const corrupt = await measureAttachment(context(Buffer.from('89504e470d0a1a0a', 'hex')));
  assert.equal(corrupt.decoding.status, 'inconclusive');
  const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: 'red' } }).png().toBuffer();
  const excessive = await measureAttachment(context(bytes));
  assert.equal(excessive.decoding.status, 'inconclusive');
});
test('cancelled and deadline limited jobs do not return decoded measurements', async () => {
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } }).png().toBuffer();
  const controller = new AbortController(); controller.abort();
  assert.equal((await measureAttachment({ ...context(bytes), signal: controller.signal })).decoding.reason, 'cancelled');
  const result = await measureAttachment({ ...context(bytes), limits: { ...context(bytes).limits, deadlineMillis: 1 } });
  assert.equal(result.decoding.reason, 'deadline-exceeded');
});
test('repair changes byte binding and real decode outcome', async () => {
  const corrupt = Buffer.from('89504e470d0a1a0a', 'hex');
  const repaired = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer();
  const before = await measureAttachment(context(corrupt));
  const after = await measureAttachment(context(repaired));
  assert.equal(before.decoding.status, 'inconclusive');
  assert.equal(after.decoding.status, 'decoded');
  assert.notEqual(before.binding.attachmentHash, after.binding.attachmentHash);
});
test('eleven unsupported observations satisfy exact Studio 2020-12 schema', async () => {
  const { default: Ajv } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const { readFileSync } = await import('node:fs');
  const ajv = new Ajv({ strict: false }); addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(new URL('../schemas/inspection-result.schema.json', import.meta.url))));
  const bytes = Buffer.from('unsupported bytes');
  const evidence = await measureAttachment(context(bytes));
  const result = unavailableInspection(evidence, { checkedAt: '2026-10-09T12:00:00Z', evidenceRef: 'urn:evidence:test:one', source: 'test-only' });
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
});

test('live cancellation settles after child close and retained limits cannot change', async () => {
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } }).png().toBuffer();
  const controller = new AbortController();
  const input = { ...context(bytes), signal: controller.signal };
  const pending = measureAttachment(input); // child is spawned synchronously before this returns
  input.limits.maxPixels = 1; input.limits.deadlineMillis = 1;
  await setTimeout(5);
  controller.abort();
  const result = await pending; // decoder resolves only from the child close event
  assert.equal(result.decoding.reason, 'cancelled');
  assert.equal(result.limits.maxPixels, 1000);
  assert.equal(result.limits.deadlineMillis, 4000);
});

test('limit accessors are read once and captured over-cap values refuse', async () => {
  const bytes = Buffer.from('not image');
  let reads = 0;
  const limits = { maxBytes: 100, get maxPixels() { reads++; return reads === 1 ? 100 : 100_000_000; }, deadlineMillis: 100 };
  const result = await measureAttachment({ ...context(bytes), limits });
  assert.equal(reads, 1);
  assert.equal(result.limits.maxPixels, 100);
  await assert.rejects(measureAttachment({ ...context(bytes), limits: { ...limits, maxPixels: 100_000_000 } }), /maxPixels/);
});

test('explicit local decimal size range reports real below-minimum and repaired bytes', async () => {
  const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer();
  const pixels = Buffer.alloc(200 * 200 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 197 + Math.floor(i / 11) * 37) % 256;
  const repaired = await sharp(pixels, { raw: { width: 200, height: 200, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const before = await measureAttachment(context(small));
  const input = context(repaired); input.limits.maxPixels = 100000;
  const after = await measureAttachment(input);
  assert.equal(before.fileSizeObservation.withinRange, false);
  assert.equal(after.fileSizeObservation.withinRange, true);
  assert.equal(after.decoding.status, 'decoded');
  assert.notEqual(before.binding.attachmentHash, after.binding.attachmentHash);
});
