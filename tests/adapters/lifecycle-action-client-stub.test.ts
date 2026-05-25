import { describe, expect, it } from 'vitest';
import { stubLifecycleActionClient } from '../../src/adapters/stub/lifecycle-action-client.ts';
import { sampleLifecycleActionSnapshot } from '../../src/adapter-conformance/fixtures.ts';
import { DEMO_STUB_ADAPTER, isDemoStubAdapter } from '../../src/policy/sentinel.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';

describe('stubLifecycleActionClient', () => {
  it('carries the demo-stub marker pinned to recordLifecycle', () => {
    const adapter = stubLifecycleActionClient();
    expect(isDemoStubAdapter(adapter)).toBe(true);
    if (!isDemoStubAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[DEMO_STUB_ADAPTER].featureKey).toBe('recordLifecycle');
  });

  it('routes correct to amendment when the changed field is outside the declared correction set', async () => {
    const adapter = stubLifecycleActionClient({
      correctableFieldSet: ['/householdSize'],
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });
    adapter.registerLifecycle(sampleLifecycleActionSnapshot);
    const receipt = await adapter.submitCorrection(
      {
        caseUrn: sampleLifecycleActionSnapshot.caseUrn,
        changedFields: [{ path: '/address/street', label: 'Street address' }],
        reason: 'The service address changed.',
      },
      generateIdempotencyKey(),
    );
    expect(receipt.event.kind).toBe('correction');
    if (receipt.event.kind !== 'correction') throw new Error('unreachable');
    expect(receipt.event.recordedAs).toBe('amendment');
  });

  it('routes correct to correction only for declared fields before decision', async () => {
    const adapter = stubLifecycleActionClient({
      correctableFieldSet: ['/householdSize'],
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });
    adapter.registerLifecycle(sampleLifecycleActionSnapshot);
    const receipt = await adapter.submitCorrection(
      {
        caseUrn: sampleLifecycleActionSnapshot.caseUrn,
        changedFields: [
          {
            path: '/householdSize',
            label: 'Household size',
            originalValue: { text: '1' },
            correctedValue: { text: '3' },
          },
        ],
        caseDecisionReached: false,
        reason: 'I typed the wrong household size.',
      },
      generateIdempotencyKey(),
    );
    expect(receipt.event.kind).toBe('correction');
    if (receipt.event.kind !== 'correction') throw new Error('unreachable');
    expect(receipt.event.recordedAs).toBe('correction');
  });

  it('routes correct to amendment after a decision has been reached', async () => {
    const adapter = stubLifecycleActionClient({
      correctableFieldSet: ['/householdSize'],
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });
    adapter.registerLifecycle(sampleLifecycleActionSnapshot);
    const receipt = await adapter.submitCorrection(
      {
        caseUrn: sampleLifecycleActionSnapshot.caseUrn,
        changedFields: [{ path: '/householdSize', label: 'Household size' }],
        caseDecisionReached: true,
        reason: 'The decision has already been issued.',
      },
      generateIdempotencyKey(),
    );
    expect(receipt.event.kind).toBe('correction');
    if (receipt.event.kind !== 'correction') throw new Error('unreachable');
    expect(receipt.event.recordedAs).toBe('amendment');
  });

  it('routes correct to amendment when the request introduces a new field', async () => {
    const adapter = stubLifecycleActionClient({
      correctableFieldSet: ['/householdSize'],
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });
    adapter.registerLifecycle(sampleLifecycleActionSnapshot);
    const receipt = await adapter.submitCorrection(
      {
        caseUrn: sampleLifecycleActionSnapshot.caseUrn,
        changedFields: [
          {
            path: '/householdSize',
            label: 'Household size',
            correctedValue: { text: '3' },
          },
        ],
        reason: 'I am adding the omitted value.',
      },
      generateIdempotencyKey(),
    );
    expect(receipt.event.kind).toBe('correction');
    if (receipt.event.kind !== 'correction') throw new Error('unreachable');
    expect(receipt.event.recordedAs).toBe('amendment');
  });

  it('rejects correction when no correctable field set is declared', async () => {
    const adapter = stubLifecycleActionClient();
    adapter.registerLifecycle({
      ...sampleLifecycleActionSnapshot,
      actions: [{ action: 'correct', enabled: true, requiresReason: true }],
    });
    await expect(
      adapter.submitCorrection(
        {
          caseUrn: sampleLifecycleActionSnapshot.caseUrn,
          changedFields: [{ path: '/householdSize', label: 'Household size' }],
          correctableFieldSet: [],
          reason: 'No field set exists.',
        },
        generateIdempotencyKey(),
      ),
    ).rejects.toThrow(/field set/i);
  });

  it('keeps submitted events on the lifecycle snapshot', async () => {
    const adapter = stubLifecycleActionClient({
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });
    adapter.registerLifecycle(sampleLifecycleActionSnapshot);
    await adapter.submitWithdrawal(
      { caseUrn: sampleLifecycleActionSnapshot.caseUrn, reason: 'Changed intent.' },
      generateIdempotencyKey(),
    );
    const snapshot = adapter._internalSnapshot(sampleLifecycleActionSnapshot.caseUrn);
    expect(snapshot?.events.at(-1)?.kind).toBe('withdrawal');
  });

  it('rejects post-determination withdrawal review unless the record action authorizes it', async () => {
    const adapter = stubLifecycleActionClient();
    adapter.registerLifecycle(sampleLifecycleActionSnapshot);
    await expect(
      adapter.submitWithdrawal(
        {
          caseUrn: sampleLifecycleActionSnapshot.caseUrn,
          reason: 'Please review the decision.',
          rescissionRequested: true,
        },
        generateIdempotencyKey(),
      ),
    ).rejects.toThrow(/post-determination withdrawal review/i);
  });
});
