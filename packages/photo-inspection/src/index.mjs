import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const rules = ['format', 'file-size', 'decode', 'color', 'quality', 'background', 'lighting', 'face-position', 'expression', 'face-obstruction', 'visible-manipulation'];
const digestPattern = /^sha256:[0-9a-f]{64}$/;
function signature(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  return null; // HEIC/HEIF requires a separately qualified codec and format detector.
}
function decode(bytes, maxPixels, deadlineMillis, signal) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./decode-worker.mjs', import.meta.url)), String(maxPixels)], { stdio: ['pipe', 'pipe', 'ignore'] });
    let reason;
    let output = '';
    const kill = value => { reason ??= value; child.kill('SIGKILL'); };
    const abort = () => kill('cancelled');
    const timer = setTimeout(() => kill('deadline-exceeded'), deadlineMillis);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      output += chunk.toString('utf8');
      if (output.length > 4096) kill('decoder-output-exceeded');
    });
    child.stdin.on('error', () => {});
    child.on('error', () => { reason = 'decoder-start-failed'; });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (reason || code !== 0) return resolve({ status: 'inconclusive', reason: reason ?? 'decoder-exited' });
      try { resolve(JSON.parse(output)); } catch { resolve({ status: 'inconclusive', reason: 'decoder-output-invalid' }); }
    });
    if (signal?.aborted) abort();
    else child.stdin.end(bytes);
  });
}

/** Offline diagnostics only. This function never returns qualified compliance facts. */
export async function measureAttachment({ bytes, attachmentRef, attachmentHash, declaredSize, requestHash, candidateHash, policyHash, rulesEdition,
  limits, sizeRange, signal }) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('bytes must be a Buffer');
  for (const value of [attachmentHash, requestHash, candidateHash, policyHash]) if (typeof value !== 'string' || !digestPattern.test(value)) throw new TypeError('invalid digest');
  if (typeof attachmentRef !== 'string' || !attachmentRef || typeof rulesEdition !== 'string' || !rulesEdition) throw new TypeError('exact attachment reference and rules edition required');
  new URL(attachmentRef);
  limits = { maxBytes: limits?.maxBytes, maxPixels: limits?.maxPixels, deadlineMillis: limits?.deadlineMillis };
  for (const [key, cap] of [['maxBytes', 15 * 1024 * 1024], ['maxPixels', 16_000_000], ['deadlineMillis', 10_000]]) {
    if (!Number.isSafeInteger(limits?.[key]) || limits[key] < 1 || limits[key] > cap) throw new TypeError(`invalid ${key}`);
  }
  sizeRange = { minimumBytes: sizeRange?.minimumBytes, maximumBytes: sizeRange?.maximumBytes };
  if (!Number.isSafeInteger(sizeRange.minimumBytes) || !Number.isSafeInteger(sizeRange.maximumBytes)
    || sizeRange.minimumBytes < 0 || sizeRange.maximumBytes < sizeRange.minimumBytes || sizeRange.maximumBytes > 15 * 1024 * 1024) throw new TypeError('invalid explicit sizeRange');
  if (bytes.length > limits.maxBytes) throw new RangeError('attachment byte budget exceeded');
  // Snapshot prevents caller mutation after digest verification while the child runs.
  bytes = Buffer.from(bytes);
  if (hash(bytes) !== attachmentHash || declaredSize !== bytes.length) throw new Error('attachment custody mismatch');
  const detectedMimeType = signature(bytes);
  const decoding = signal?.aborted ? { status: 'inconclusive', reason: 'cancelled' }
    : detectedMimeType ? await decode(bytes, limits.maxPixels, limits.deadlineMillis, signal)
      : { status: 'unsupported', reason: 'format-detector-or-codec-unavailable' };
  const binding = { requestHash, candidateHash, policyHash, rulesEdition, attachmentRef, attachmentHash };
  return { version: '0.1', purpose: 'unqualified-photo-byte-measurements', binding, byteLength: bytes.length,
    fileSizeObservation: { ...sizeRange, withinRange: bytes.length >= sizeRange.minimumBytes && bytes.length <= sizeRange.maximumBytes },
    detectedMimeType, formatObservation: 'signature only; decoder format reported separately', decoding, limits: { ...limits },
    qualification: 'pending: native-memory isolation, executor qualification', historyVerified: false };
}

/** Studio schema requires qualified executors even for inconclusive findings. */
export function unavailableInspection(measurements, { checkedAt, evidenceRef, source }) {
  if (!Number.isFinite(Date.parse(checkedAt))) throw new TypeError('checkedAt required');
  new URL(evidenceRef);
  if (!source) throw new TypeError('source required');
  return { version: '1.0', status: 'unavailable', scope: 'required-basic-automatic-checks; not history or agency acceptance',
    binding: { ...measurements.binding }, observations: rules.map(ruleId => ({ ruleId, status: 'unsupported', evidenceKind: 'unavailable',
      checkedAt, executor: null, evidenceRef, reason: 'No qualified executor is configured. Separate byte measurements are diagnostic evidence only.', fix: null, result: null })),
    source, checkedAt, evidenceRef };
}
