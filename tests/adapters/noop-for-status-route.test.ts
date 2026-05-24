import { describe, expect, it } from 'vitest';
import {
  noopDefinitionSource,
  noopDraftStore,
  noopIdentityProvider,
  noopSubmitTransport,
} from '../../src/adapters/noop-for-status-route/index.ts';
import type { FormResponse, IntakeHandoff } from '../../src/ports/index.ts';

describe('noop-for-status-route adapters throw with FW-0068 cite on any call', () => {
  it('noopDefinitionSource.getDefinition throws with FW-0068 cite', async () => {
    await expect(noopDefinitionSource().getDefinition('https://x')).rejects.toThrow(/FW-0068/);
  });

  it('noopDraftStore.save throws with FW-0068 cite', async () => {
    const minimalResponse: FormResponse = {
      definitionUrl: 'https://x',
      definitionVersion: undefined,
      data: {},
      metadata: undefined,
    } as unknown as FormResponse;
    await expect(
      noopDraftStore().save({ formUrl: 'https://x', subjectRef: 's' }, minimalResponse),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopDraftStore.load throws with FW-0068 cite', async () => {
    await expect(
      noopDraftStore().load({ formUrl: 'https://x', subjectRef: 's' }),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopDraftStore.list throws with FW-0068 cite', async () => {
    await expect(noopDraftStore().list('subject')).rejects.toThrow(/FW-0068/);
  });

  it('noopDraftStore.delete throws with FW-0068 cite', async () => {
    await expect(
      noopDraftStore().delete({ formUrl: 'https://x', subjectRef: 's' }),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopDraftStore.invalidateSubject throws with FW-0068 cite', async () => {
    await expect(noopDraftStore().invalidateSubject('s')).rejects.toThrow(/FW-0068/);
  });

  it('noopSubmitTransport.submit throws with FW-0068 cite', async () => {
    await expect(
      noopSubmitTransport().submit({} as IntakeHandoff, 'idempotency-key'),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopIdentityProvider.discover throws with FW-0068 cite', async () => {
    await expect(noopIdentityProvider().discover()).rejects.toThrow(/FW-0068/);
  });

  it('noopIdentityProvider.authenticate throws with FW-0068 cite', async () => {
    await expect(
      noopIdentityProvider().authenticate({
        kind: 'anonymous',
        minAssurance: 'L1',
      }),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopIdentityProvider.revoke throws with FW-0068 cite', async () => {
    await expect(
      noopIdentityProvider().revoke({
        provider: 'noop',
        adapter: 'noop@0',
        subjectRef: 's',
        credentialType: 'other',
        subjectBinding: 'respondent',
        assuranceLevel: 'L1',
      }),
    ).rejects.toThrow(/FW-0068/);
  });

  it('noopIdentityProvider.subscribe delivers null synchronously then is inert', () => {
    const received: Array<unknown> = [];
    const unsub = noopIdentityProvider().subscribe((c) => received.push(c));
    expect(received).toEqual([null]);
    unsub();
  });
});
