import { describe, expect, it } from 'vitest';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';

describe('stubSubmitTransport caseUrn (FW-0039 slice 1)', () => {
  it('returns a deterministic WOS case URN alongside the reference number', async () => {
    const transport = stubSubmitTransport();
    const confirmation = await transport.submit(sampleIntakeHandoff, generateIdempotencyKey());
    expect(confirmation.referenceNumber).toMatch(/^STUB-/);
    expect(confirmation.caseUrn).toBeDefined();
    expect(confirmation.caseUrn).toMatch(/^urn:wos:case_demo_/);
  });

  it('keeps caseUrn stable across retries with the same idempotency key', async () => {
    const transport = stubSubmitTransport();
    const key = generateIdempotencyKey();
    const a = await transport.submit(sampleIntakeHandoff, key);
    const b = await transport.submit(sampleIntakeHandoff, key);
    expect(a.caseUrn).toBe(b.caseUrn);
  });

  it('emits distinct caseUrns for distinct idempotency keys', async () => {
    const transport = stubSubmitTransport();
    const a = await transport.submit(sampleIntakeHandoff, generateIdempotencyKey());
    const b = await transport.submit(sampleIntakeHandoff, generateIdempotencyKey());
    expect(a.caseUrn).not.toBe(b.caseUrn);
  });
});
