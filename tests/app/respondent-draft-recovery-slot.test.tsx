import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { invokeResponseActionAsync } from '@formspec-org/engine';
import { createSemanticControlRegistry, type ResponseActionInvoker, type SemanticControlScope, type SubmitResult } from '@formspec-org/react';
import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
import { RespondentDefinitionController, type RespondentOwnedRuntime, type RespondentOwnedRuntimeInput, type ResolvedRespondentFormInput } from '../../src/app/RespondentRuntime.tsx';
import { createTestComposition, testDefinition } from '../fixtures/composition.ts';
import { DraftVersionConflictError, type DraftKey } from '../../src/ports/draft-store.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

// Same immutable-version recovery shape as the standalone recovery fixtures.
const definition: FormDefinition = {
  $formspec: '1.0', url: 'https://example.test/forms/recovery', version: '0.1.3',
  title: 'Current form', items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
};
const spanish: LocaleDocument = {
  $formspecLocale: '2.0', url: 'https://example.test/locales/recovery-es', version: '0.1.3',
  locale: 'es-US', target: { kind: 'definition', url: definition.url }, strings: {
    'name.label': 'Nombre',
    '$ui.form.fields': 'Campos del formulario',
    '$ui.draft.versionChangedTitle': 'Este borrador usa otra versión',
    '$ui.draft.startCurrent': 'Borrar acceso guardado y empezar de nuevo',
  },
};

beforeAll(() => initFormspecEngine());
afterEach(cleanup);

describe('draft recovery inside a definition-form Surface slot', () => {
  it('configures owned execution after hydration and before mounting the authored Component', async () => {
    const base = createTestComposition({ definition: testDefinition });
    const restored: FormResponse = { $formspecResponse: '1.0', id: 'retained-response',
      definitionUrl: definition.url, definitionVersion: definition.version, status: 'in-progress',
      authored: '2026-10-06T00:00:00Z', data: { name: 'Retained answer' } };
    let finish!: (runtime: RespondentOwnedRuntime) => void;
    const configureRuntime = vi.fn(async (input: RespondentOwnedRuntimeInput) => {
      expect(input.restoredResponse).toEqual(restored);
      expect(input.engine.getResponse({ profile: 'off' }).data).toEqual(restored.data);
      expect(input.draftKey).toEqual({ formUrl: definition.url, formVersion: definition.version, subjectRef: undefined });
      return new Promise<RespondentOwnedRuntime>(resolve => { finish = resolve; });
    });
    const runtime = ownedRuntime();
    const composition = anonymousComposition(base);
    composition.draftStore.load = vi.fn(async () => structuredClone(restored));
    const view = render(<RespondentDefinitionController composition={composition} config={departmentAppProfile}
      form={{ ...resolvedForm(), configureRuntime, componentDocument: {
        $formspecComponent: '1.2', url: 'urn:test:owned-component', version: '1.0',
        targetDefinition: { url: definition.url }, tree: { component: 'Stack', children: [
          { component: 'TextInput', bind: 'name', placeholder: 'Authored Component field' },
        ] },
      } }} />);
    await waitFor(() => expect(configureRuntime).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText('Name')).toBeNull();
    await act(async () => { finish(runtime); });
    expect((await screen.findByPlaceholderText('Authored Component field') as HTMLInputElement).value).toBe('Retained answer');
    view.unmount();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(runtime.invalidate).not.toHaveBeenCalled();
  });

  it('disposes a superseded asynchronous owned runtime before disposing its engine', async () => {
    let finish!: (runtime: RespondentOwnedRuntime) => void;
    let disposeEngine: ReturnType<typeof vi.spyOn> | undefined;
    const calls: string[] = [];
    const configureRuntime = vi.fn(async ({ engine }: RespondentOwnedRuntimeInput) => {
      disposeEngine = vi.spyOn(engine, 'dispose').mockImplementation(() => { calls.push('engine'); });
      return new Promise<RespondentOwnedRuntime>(resolve => { finish = resolve; });
    });
    const runtime = ownedRuntime();
    runtime.dispose.mockImplementation(() => { calls.push('runtime'); });
    const view = render(<RespondentDefinitionController composition={anonymousComposition(createTestComposition({ definition: testDefinition }))}
      config={departmentAppProfile} form={{ ...resolvedForm(), configureRuntime }} />);
    await waitFor(() => expect(configureRuntime).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => { finish(runtime); });
    expect(calls).toEqual(['runtime', 'engine']);
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(disposeEngine).toHaveBeenCalledOnce();
  });

  it('refuses incomplete owned execution rather than falling back to the legacy factory', async () => {
    const composition = anonymousComposition(createTestComposition({ definition: testDefinition }));
    const factory = vi.fn(() => null);
    composition.responseActionInvoker = factory;
    const runtime = ownedRuntime();
    const configureRuntime = async () => ({ ...runtime, responseActionInvoker: null } as unknown as RespondentOwnedRuntime);
    render(<RespondentDefinitionController composition={composition} config={departmentAppProfile}
      form={{ ...resolvedForm(), configureRuntime }} />);
    await screen.findByText('An owned action runtime must supply its complete execution and lifecycle hooks');
    expect(factory).not.toHaveBeenCalled();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('refuses the legacy submit event when the configured runtime owns execution', async () => {
    const composition = anonymousComposition(createTestComposition({ definition: testDefinition }));
    const save = vi.spyOn(composition.draftStore, 'save');
    const submit = vi.spyOn(composition.submitTransport, 'submit');
    const factory = vi.fn(() => null); composition.responseActionInvoker = factory;
    const runtime = ownedRuntime();
    runtime.responseActionInvoker.mockImplementation(input => invokeResponseActionAsync<SubmitResult>(
      input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext));
    const form = resolvedForm();
    const configureRuntime = async () => runtime;
    render(<RespondentDefinitionController composition={composition} config={departmentAppProfile} form={{
      ...form, configureRuntime, componentDocument: {
        $formspecComponent: '1.2', url: 'urn:test:explicit-action', version: '1.0',
        targetDefinition: { url: definition.url }, tree: { component: 'Stack', children: [
          { component: 'TextInput', bind: 'name' }, { component: 'ActionButton', actionRef: 'legacy' },
        ] },
      }, responseActionsDocument: { $formspecResponseActions: '1.0', version: '1.0',
        scope: 'response', targetDefinition: { url: definition.url }, actions: [{
          id: 'legacy', intent: 'submit', label: { literal: 'Legacy submit event' },
          validation: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' },
          effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
        }] },
    }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Legacy submit event' }));
    await waitFor(() => expect(runtime.responseActionInvoker).toHaveBeenCalledOnce());
    await screen.findByText('Completed.');
    expect(save).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });
  it('preserves the supplied Surface invoker and semantic scope without invoking the legacy submit transport', async () => {
    const base = createTestComposition({ definition: testDefinition });
    const factory = vi.fn(() => null);
    const submit = vi.fn(base.submitTransport.submit);
    const registry = createSemanticControlRegistry();
    const register = vi.spyOn(registry, 'register');
    const scope: SemanticControlScope = {
      registry, renderInstanceId: 'qualified-slot', responseId: 'qualified-response', initialResponseRevision: 7,
      definitionArtifact: { artifactRef: definition.url, artifactDigest: `sha256:${'a'.repeat(64)}` },
      responseActionsArtifact: { artifactRef: 'https://example.test/actions/prepare', artifactDigest: `sha256:${'b'.repeat(64)}` },
    };
    const effect = vi.fn(async (_effect: unknown, detail: SubmitResult) => {
      expect(detail.response.id).toBe(scope.responseId);
    });
    const invoker: ResponseActionInvoker<SubmitResult> = vi.fn((input: Parameters<ResponseActionInvoker<SubmitResult>>[0]) => invokeResponseActionAsync<SubmitResult>(
      input.document, input.actionRef, { ...input.ports,
        dispatchEffect: effect, resolveIdempotencyKey: () => 'host-operation',
      }, input.nodeId, input.invocationContext,
    ));
    const composition = { ...base, responseActionInvoker: factory,
      submitTransport: { submit }, identityProvider: { ...base.identityProvider,
        discover: async () => [], subscribe(listener: (claim: null) => void) { listener(null); return () => {}; },
      },
    };
    render(<RespondentDefinitionController composition={composition} config={departmentAppProfile} form={{
      definition,
      themeDocument: { $formspecTheme: '1.0', url: 'https://example.test/themes/recovery', version: '1.0.0', targetDefinition: { url: definition.url } },
      registryEntries: [], semanticControlScope: scope, responseActionInvoker: invoker,
      responseActionsDocument: { $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition.url },
        actions: [{ id: 'prepare', intent: 'x-prepare', label: { literal: 'Prepare for signing' },
          validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
          effects: [{ type: 'serviceRequest', requestRef: 'prepare', idempotencyKey: '@invocation.id' }] }],
      },
    }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare for signing' }));
    await waitFor(() => expect(invoker).toHaveBeenCalledOnce());
    await waitFor(() => expect(effect).toHaveBeenCalledOnce());
    expect(factory).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(register.mock.calls.some(([control]) => control.renderInstanceId === scope.renderInstanceId
      && control.responseId === scope.responseId && control.control.artifactDigest === scope.responseActionsArtifact!.artifactDigest)).toBe(true);
  });

  it('forwards an actual asynchronous owned Prepare terminal once without a legacy confirmation', async () => {
    const runtime = { ...ownedRuntime(), getCompletionGeneration: vi.fn(() => 1) }; const completed = vi.fn(); let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    runtime.responseActionInvoker.mockImplementation(input => invokeResponseActionAsync<SubmitResult>(input.document, input.actionRef,
      { ...input.ports, dispatchEffect: () => pending, resolveIdempotencyKey: () => 'owned-prepare' }, input.nodeId, input.invocationContext));
    const composition = anonymousComposition(createTestComposition({ definition: testDefinition })); const submit = vi.spyOn(composition.submitTransport, 'submit');
    render(<RespondentDefinitionController composition={composition} config={departmentAppProfile} form={ownedPrepareForm(runtime, completed)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare owned response' }));
    await waitFor(() => expect(runtime.responseActionInvoker).toHaveBeenCalledOnce()); expect(completed).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    await waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(completed.mock.calls[0][0].id).toBe('prepare');
    expect(completed.mock.calls[0][1]).toMatchObject({ status: 'completed', detail: { validationReport: { valid: true } } });
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps the unsigned action terminal waiting for its actual submit confirmation', async () => {
    const composition = anonymousComposition(createTestComposition({ definition: testDefinition })); const original = composition.submitTransport.submit;
    let finish!: () => void; const pending = new Promise<void>(resolve => { finish = resolve; });
    const submit = vi.fn(async (...args: Parameters<typeof original>) => { await pending; return original(...args); });
    composition.submitTransport = { submit }; const completed = vi.fn();
    render(<RespondentDefinitionController composition={composition} config={departmentAppProfile} form={{ ...resolvedForm(), onActionCompleted: completed,
      responseActionsDocument: { $formspecResponseActions: '1.0', version: '1.0', scope: 'response', targetDefinition: { url: definition.url },
        actions: [{ id: 'submit', intent: 'submit', label: { literal: 'Submit unsigned response' },
          validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
          effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }] }] },
    }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit unsigned response' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce()); expect(completed).not.toHaveBeenCalled();
    await act(async () => { finish(); }); await waitFor(() => expect(completed).toHaveBeenCalledOnce());
  });

  it('rejects a queued owned terminal when the same lease advances its private generation', async () => {
    const runtime = { ...ownedRuntime(), getCompletionGeneration: vi.fn().mockReturnValueOnce(1).mockReturnValue(2) };
    runtime.responseActionInvoker.mockImplementation(input => invokeResponseActionAsync<SubmitResult>(input.document, input.actionRef,
      { ...input.ports, dispatchEffect: async () => {}, resolveIdempotencyKey: () => 'owned-prepare' }, input.nodeId, input.invocationContext));
    const completed = vi.fn(); render(<RespondentDefinitionController composition={anonymousComposition(createTestComposition({ definition: testDefinition }))}
      config={departmentAppProfile} form={ownedPrepareForm(runtime, completed)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare owned response' }));
    await screen.findByText('Completed.'); await act(async () => {});
    expect(runtime.getCompletionGeneration).toHaveBeenCalledTimes(2); expect(completed).not.toHaveBeenCalled();
  });

  it('refuses failed owned terminals and completions from an unmounted renderer', async () => {
    const failed = ownedRuntime(); const completed = vi.fn();
    failed.responseActionInvoker.mockImplementation(input => invokeResponseActionAsync<SubmitResult>(input.document, input.actionRef,
      { ...input.ports, dispatchEffect: async () => { throw new Error('owned-prepare-failed'); } }, input.nodeId, input.invocationContext));
    const composition = anonymousComposition(createTestComposition({ definition: testDefinition }));
    const first = render(<RespondentDefinitionController composition={composition} config={departmentAppProfile} form={ownedPrepareForm(failed, completed)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare owned response' }));
    await waitFor(() => expect(failed.responseActionInvoker).toHaveBeenCalledOnce()); await act(async () => {});
    expect(completed).not.toHaveBeenCalled(); first.unmount();
    const late = ownedRuntime(); let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    late.responseActionInvoker.mockImplementation(input => invokeResponseActionAsync<SubmitResult>(input.document, input.actionRef,
      { ...input.ports, dispatchEffect: () => pending }, input.nodeId, input.invocationContext));
    const second = render(<RespondentDefinitionController composition={composition} config={departmentAppProfile} form={ownedPrepareForm(late, completed)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare owned response' }));
    await waitFor(() => expect(late.responseActionInvoker).toHaveBeenCalledOnce()); second.unmount();
    await act(async () => { finish(); }); expect(completed).not.toHaveBeenCalled(); expect(late.dispose).toHaveBeenCalledOnce();
  });

  it('uses a subordinate recovery heading and returns focus locally after restart in the chosen language', async () => {
    const base = createTestComposition({ definition: testDefinition });
    let cleared = false;
    const load = vi.fn(async (key: DraftKey): Promise<FormResponse | undefined> => {
      if (cleared) return undefined;
      throw new DraftVersionConflictError(key, '0.1.2');
    });
    const remove = vi.fn(async (_key: DraftKey): Promise<void> => { cleared = true; });
    const save = vi.fn(async (_key: DraftKey, _response: FormResponse): Promise<void> => {});
    const composition = {
      ...base, initialDefinitionUrl: definition.url,
      identityProvider: {
        ...base.identityProvider, discover: async () => [],
        subscribe(listener: (claim: null) => void) { listener(null); return () => {}; },
      },
      draftStore: { ...base.draftStore, load, save, delete: remove },
    };
    render(<>
      <h1 id="respondent-title" tabIndex={-1}>Host route heading</h1>
      <RespondentDefinitionController composition={composition} config={departmentAppProfile} form={{
        definition,
        themeDocument: { $formspecTheme: '1.0', url: 'https://example.test/themes/recovery', version: '1.0.0', targetDefinition: { url: definition.url } },
        registryEntries: [], responseActionsDocument: undefined, localeDocuments: [spanish],
      }} />
    </>);
    await screen.findByRole('heading', { name: 'This saved draft uses a different form version', level: 2 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByLabelText('Name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    await screen.findByRole('heading', { name: 'Este borrador usa otra versión', level: 2 });
    const start = screen.getByRole('button', { name: 'Borrar acceso guardado y empezar de nuevo' });
    start.focus();
    fireEvent.click(start);
    await screen.findByLabelText('Nombre');
    const localHeading = screen.getByRole('heading', { name: 'Campos del formulario', level: 2 });
    await waitFor(() => expect(document.activeElement).toBe(localHeading));
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Host route heading' }));
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('');
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(load.mock.calls[0][0]);
    expect(save).not.toHaveBeenCalled();
  });
});

function resolvedForm(): ResolvedRespondentFormInput {
  return { definition, themeDocument: { $formspecTheme: '1.0', url: 'urn:test:theme', version: '1.0',
    targetDefinition: { url: definition.url } }, registryEntries: [], responseActionsDocument: undefined };
}

function anonymousComposition(base: ReturnType<typeof createTestComposition>) {
  return { ...base, identityProvider: { ...base.identityProvider, discover: async () => [],
    subscribe(listener: (claim: null) => void) { listener(null); return () => {}; } } };
}

function ownedRuntime() {
  return { responseActionInvoker: vi.fn<ResponseActionInvoker<SubmitResult>>(),
    semanticControlScope: undefined, invalidate: vi.fn(), dispose: vi.fn() };
}

function ownedPrepareForm(runtime: RespondentOwnedRuntime, completed: NonNullable<ResolvedRespondentFormInput['onActionCompleted']>): ResolvedRespondentFormInput {
  return { ...resolvedForm(), configureRuntime: async () => runtime, onActionCompleted: completed,
    componentDocument: { $formspecComponent: '1.2', url: 'urn:test:owned-prepare-component', version: '1.0',
      targetDefinition: { url: definition.url }, tree: { component: 'Stack', children: [
        { component: 'TextInput', bind: 'name' }, { component: 'ActionButton', actionRef: 'prepare' },
      ] } },
    responseActionsDocument: { $formspecResponseActions: '1.0', version: '1.0', scope: 'response', targetDefinition: { url: definition.url },
      actions: [{ id: 'prepare', intent: 'x-prepare', label: { literal: 'Prepare owned response' },
        validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
        effects: [{ type: 'serviceRequest', requestRef: 'prepare', idempotencyKey: '@invocation.id' }] }] },
  };
}
