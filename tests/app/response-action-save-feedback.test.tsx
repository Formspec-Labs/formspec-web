import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine, resolveResponseAction, type ResponseActionInvocationResult } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { FormspecForm, type ResponseActionInvoker, type SubmitResult } from '@formspec-org/react';
import type { ComponentDocument, FormDefinition, LocaleDocument, ResponseActionsDocument } from '@formspec-org/types';

const definition: FormDefinition = { $formspec: '1.0', url: 'urn:test:save-feedback', version: '1', title: 'Draft feedback', items: [] };
const component: ComponentDocument = { $formspecComponent: '1.2', url: 'urn:test:save-feedback:component', version: '1',
  targetDefinition: { url: definition.url }, tree: { component: 'Stack', children: [{ component: 'ActionButton', actionRef: 'action' }] } };
const english = 'Saving could not be confirmed. Keep this page open.';
const spanish = 'No se pudo confirmar que se haya guardado. Mantenga esta página abierta.';
const spanishLocale: LocaleDocument = { $formspecLocale: '2.0', url: 'urn:test:save-feedback:es', version: '1', locale: 'es-US',
  target: { kind: 'definition', url: definition.url }, strings: {
    '$ui.draft.saveUnconfirmed': spanish, '$ui.action.inProgress': 'Acción en curso…',
    '$ui.action.deferred': 'Aplazada', '$ui.action.failed': 'Fallida', '$ui.action.status': '{{$status}}.',
  } };
const engines: ReturnType<typeof createFormEngine>[] = [];
beforeAll(() => initFormspecEngine());
afterEach(() => { cleanup(); engines.splice(0).forEach(engine => engine.dispose()); });

function mount(intent: 'save-draft' | 'autosave' | 'submit', status: ResponseActionInvocationResult<SubmitResult>['status'], pending = false) {
  const engine = createFormEngine(definition); engines.push(engine); engine.loadLocale(spanishLocale);
  const document: ResponseActionsDocument = { $formspecResponseActions: '1.0', version: '1', scope: 'response', targetDefinition: { url: definition.url },
    actions: [{ id: 'action', intent, label: { literal: 'Run action' },
      validation: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' }, effects: [{ type: 'hostEvent', eventName: 'test-action' }] }] };
  const result: ResponseActionInvocationResult<SubmitResult> = { status, resolution: resolveResponseAction(document, 'action'),
    validationTuple: document.actions[0].validation ?? null, detail: null, effectTrace: [], failureReason: 'private-server-diagnostic' };
  let settle!: () => void;
  const gate = new Promise<typeof result>(resolve => { settle = () => resolve(result); });
  const invoker = vi.fn<ResponseActionInvoker<SubmitResult>>(() => pending ? gate : result);
  const onResult = vi.fn();
  const mounted = render(<FormspecForm engine={engine} componentDocument={component} responseActionsDocument={document}
    responseActionInvoker={invoker} onActionResult={onResult} />);
  return { engine, result, settle, invoker, onResult, mounted };
}

describe('maintained Response Action Save feedback', () => {
  it.each(['failed', 'unresolved'] as const)('uses the canonical Save message for %s and retains the original diagnostic result', async status => {
    const test = mount('save-draft', status);
    fireEvent.click(screen.getByRole('button', { name: 'Run action' }));
    await screen.findByText(english);
    expect(test.onResult).toHaveBeenCalledExactlyOnceWith(test.result);
    expect(test.onResult.mock.calls[0][0]).toBe(test.result);
    expect(test.mounted.container.textContent).not.toContain(test.result.failureReason);
    act(() => test.engine.setLocale('es-US'));
    await screen.findByText(spanish); expect(screen.queryByText(english)).toBeNull();
    act(() => test.engine.setLocale('en'));
    await screen.findByText(english); expect(test.invoker).toHaveBeenCalledOnce();
  });

  it.each([['save-draft', 'deferred', 'Deferred.'], ['save-draft', 'blocked', 'Blocked.'], ['save-draft', 'completed', 'Completed.'],
    ['autosave', 'failed', 'Failed.'], ['submit', 'failed', 'Failed.']] as const)(
    'excludes %s/%s from unconfirmed Save copy', async (intent, status, expected) => {
      const test = mount(intent, status);
      fireEvent.click(screen.getByRole('button', { name: 'Run action' }));
      await screen.findByText(expected); expect(screen.queryByText(english)).toBeNull();
      expect(test.onResult).toHaveBeenCalledExactlyOnceWith(test.result);
      expect(test.mounted.container.textContent).not.toContain(test.result.failureReason);
    });

  it('resolves both pending and settled feedback in the current Locale without starting another invocation', async () => {
    const test = mount('save-draft', 'failed', true);
    const button = screen.getByRole('button', { name: 'Run action' }); fireEvent.click(button);
    await screen.findByText('In progress.'); expect(button.getAttribute('aria-busy')).toBe('true');
    act(() => test.engine.setLocale('es-US'));
    await screen.findByText('Acción en curso…'); expect(test.onResult).not.toHaveBeenCalled();
    await act(async () => test.settle());
    await screen.findByText(spanish); expect(button.getAttribute('aria-busy')).toBe('false');
    act(() => test.engine.setLocale('en'));
    await screen.findByText(english); expect(test.invoker).toHaveBeenCalledOnce();
    expect(test.onResult.mock.calls[0][0]).toBe(test.result);
  });
});
