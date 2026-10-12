import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { ResponseActionsDocument } from '@formspec-org/types';
import type { ResponseActionInvoker } from '@formspec-org/react';
import type { SubmitResult } from '@formspec-org/react';
import { RespondentDefinitionController } from '../../src/app/RespondentRuntime.tsx';
import { admitNativeHostEvents } from '../../src/shared/native-host-events.ts';
import { createTestComposition } from '../fixtures/composition.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

beforeAll(() => initFormspecEngine());
afterEach(cleanup);

it.each(['completed', 'failed'] as const)('evaluates the retained authored photo detail and preserves the native capability result: %s', async expectedStatus => {
  const bundle = JSON.parse(readFileSync('tests/fixtures/photo-complete-successor-v1.bundle.json', 'utf8')) as {
    documents: Record<string, Partial<ResponseActionsDocument>>;
  };
  const original = Object.values(bundle.documents).find(value => value.actions?.some(action => action.id === 'inspect-photo')) as ResponseActionsDocument;
  const action = structuredClone(original.actions.find(value => value.id === 'inspect-photo')!);
  expect(action.effects).toEqual([{ type: 'hostEvent', eventName: 'formspec-attachment-inspection-request', detailRef: '$photo' }]);
  const definition = { $formspec: '1.0' as const, url: original.targetDefinition!.url, version: '1', title: 'Photo action',
    items: [{ key: 'photo', type: 'field' as const, dataType: 'string' as const, label: 'Photo reference', initialValue: 'retained-photo' }] };
  const document: ResponseActionsDocument = { ...original, scope: 'response', actions: [{ ...action, label: { literal: 'Check retained photo' } }] };
  const handle = vi.fn(async ({ detail, refreshSavedFacts }) => { expect(detail).toBe('retained-photo'); await refreshSavedFacts(); });
  const refreshSavedFacts = vi.fn(async () => {
    if (expectedStatus === 'failed') throw new Error('private provider detail');
  });
  const events = admitNativeHostEvents({ documents: { 'urn:test:actions': document }, definitionUrl: definition.url, controllerActions: [],
    capabilities: [{ artifactRef: 'urn:test:actions', actionRef: action.id, eventName: 'formspec-attachment-inspection-request', handle }] });
  const base = createTestComposition({ definition });
  const composition = { ...base, identityProvider: { ...base.identityProvider, discover: async () => [],
    subscribe(listener: (claim: null) => void) { listener(null); return () => {}; } } };
  const invoke = vi.fn<ResponseActionInvoker<SubmitResult>>(async input => {
    const result = await events.invoke(input, { signal: new AbortController().signal, assertCurrent() {}, refreshSavedFacts });
    const invocation = 'invocation' in result ? result.invocation : result;
    expect(invocation.status, invocation.failureReason).toBe('completed');
    return result;
  });
  render(<RespondentDefinitionController composition={composition} config={departmentAppProfile} form={{ definition,
    themeDocument: { $formspecTheme: '1.0', url: 'urn:test:theme', version: '1', targetDefinition: { url: definition.url } }, registryEntries: [],
    responseActionsDocument: document, componentDocument: { $formspecComponent: '1.2', url: 'urn:test:component', version: '1',
      targetDefinition: { url: definition.url }, tree: { component: 'Stack', children: [{ component: 'ActionButton', actionRef: action.id }] } },
    configureRuntime: async () => ({ invalidate() {}, dispose() {}, semanticControlScope: undefined, responseActionInvoker: invoke }),
  }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check retained photo' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  if (expectedStatus === 'failed') {
    await expect(invoke.mock.results[0].value).rejects.toThrow('native-host-event-handler-failed');
  } else await invoke.mock.results[0].value;
  await waitFor(() => expect(handle).toHaveBeenCalledOnce());
  expect(refreshSavedFacts).toHaveBeenCalledOnce();
  await screen.findByText(expectedStatus === 'completed' ? 'Completed.' : 'Failed.');
  expect(screen.queryByText('private provider detail')).toBeNull();
});
