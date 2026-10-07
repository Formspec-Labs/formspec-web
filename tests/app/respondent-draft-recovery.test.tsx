import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { createStubComposition } from '../../src/composition/stub.ts';
import { DraftVersionConflictError, type DraftKey } from '../../src/ports/draft-store.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

const definition: FormDefinition = {
  $formspec: '1.0', url: 'https://example.test/forms/recovery', version: '0.1.3',
  title: 'Current form', items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
};
const spanish: LocaleDocument = {
  $formspecLocale: '2.0', url: 'https://example.test/locales/recovery-es', version: '0.1.3',
  locale: 'es-US', target: { kind: 'definition', url: definition.url },
  strings: {
    '$form.title': 'Formulario actual', 'name.label': 'Nombre',
    '$ui.draft.versionChangedTitle': 'Este borrador usa otra versión',
    '$ui.draft.versionChanged': 'El borrador usa la versión {{$version}}.',
    '$ui.draft.startCurrent': 'Borrar acceso guardado y empezar de nuevo',
    '$ui.draft.startingCurrent': 'Empezando de nuevo...',
    '$ui.draft.startCurrentFailed': 'No se pudo borrar el acceso guardado.',
    '$ui.receipt.answersReceived': 'Respuestas recibidas',
    '$ui.receipt.clear': 'Borrar los datos de esta computadora',
    '$ui.receipt.clearedTitle': 'Acceso guardado borrado',
    '$ui.receipt.clearedDetail': 'Este navegador ya no tiene acceso guardado a este borrador.',
    '$ui.draft.browserAccessNotice': 'Se quitará el acceso a este borrador de este navegador.',
  },
};

beforeAll(() => initFormspecEngine());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup({ deletionFails = false, partyRef, conflict = true, multiParty = false, localPackagePreview = false }: { deletionFails?: boolean; partyRef?: string; conflict?: boolean; multiParty?: boolean; localPackagePreview?: boolean } = {}) {
  const base = createStubComposition();
  let cleared = false;
  const conflictKeys: DraftKey[] = [];
  const load = vi.fn(async (key: DraftKey): Promise<FormResponse | undefined> => {
    if (cleared || key.partyRef === '__formspec-multi-party-progress') return undefined;
    if (!conflict) {
      const engine = createFormEngine(definition);
      engine.setValue('name', 'Retained answer');
      const response = engine.getResponse({ profile: 'off' });
      engine.dispose();
      return response;
    }
    const current = { ...key, ...(partyRef ? { partyRef } : {}) };
    conflictKeys.push(current);
    throw new DraftVersionConflictError(current, '0.1.2');
  });
  const save = vi.fn(async (_key: DraftKey, _response: FormResponse): Promise<void> => {});
  const remove = vi.fn(async (_key: DraftKey): Promise<void> => {
    if (deletionFails) throw new Error('Private host deletion details');
    cleared = true;
  });
  const getDefinition = vi.fn(async () => definition);
  const composition = {
    ...base, initialDefinitionUrl: definition.url,
    ...(localPackagePreview ? {
      localPackagePreview: true,
      submitTransport: { submit: vi.fn(async () => ({ recordKind: 'response' as const, referenceNumber: 'SPANISH-RESPONSE-ID', status: 'accepted' as const })) },
    } : {}),
    ...(multiParty ? {
      instanceCapabilities: { ...base.instanceCapabilities, multiParty: 'available' as const },
      orgRuntimePolicy: { ...base.orgRuntimePolicy, features: { ...base.orgRuntimePolicy.features, multiParty: 'allowed' as const } },
      formRuntimePolicyExtractor: { extract: () => ({ features: { multiParty: 'required' as const }, limits: {
        multiParty: { tier: 'coEqual' as const, invitationChannel: 'magic-link' as const, parties: [
          { roleId: 'applicant', label: 'Applicant', role: 'coEqual' as const, cardinality: { min: 1, max: 1 }, visibilityScope: 'shared' as const },
          { roleId: 'preparer', label: 'Preparer', role: 'coEqual' as const, cardinality: { min: 1, max: 1 }, visibilityScope: 'shared' as const },
        ] },
      } }) },
    } : {}),
    identityProvider: {
      ...base.identityProvider,
      discover: async () => [],
      subscribe(listener: (claim: null) => void) { listener(null); return () => {}; },
    },
    definitionSource: { getDefinition, getLocaleDocuments: async () => [spanish] },
    draftStore: { ...base.draftStore, load, save, delete: remove },
  };
  render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
  return { load, save, remove, getDefinition, conflictKeys };
}

describe('explicit recovery from a retained immutable draft version', () => {
  it('preserves translated cleared wording after leaving the Spanish Response receipt and disposing its engine', async () => {
    const probe = createFormEngine(definition);
    const dispose = vi.spyOn(Object.getPrototypeOf(probe), 'dispose');
    probe.dispose();
    const { remove } = setup({ conflict: false, localPackagePreview: true });
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    await screen.findByLabelText('Nombre');
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    await screen.findByRole('heading', { name: 'Respuestas recibidas' });
    expect(screen.getByText('SPANISH-RESPONSE-ID')).not.toBeNull();
    const disposalCountBeforeClear = dispose.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Borrar los datos de esta computadora' }));
    await screen.findByRole('heading', { name: 'Acceso guardado borrado' });
    expect(screen.getByText('Este navegador ya no tiene acceso guardado a este borrador.')).not.toBeNull();
    expect(dispose).toHaveBeenCalledTimes(disposalCountBeforeClear + 1);
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.queryByText('SPANISH-RESPONSE-ID')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Respuestas recibidas' })).toBeNull();
    expect(screen.queryByRole('button', { name: /español/i })).toBeNull();
  });

  it('offers the same explicit restart from editable fields and keeps retained data until clicked', async () => {
    const { load, save, remove } = setup({ conflict: false });
    await screen.findByLabelText('Name');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Retained answer');
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved access and start again' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await screen.findByLabelText('Name');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    expect(remove).toHaveBeenCalledWith(load.mock.calls[0][0]);
    expect(save).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Current form' }));
  });

  it('restarts only the active party slice from the editable toolbar', async () => {
    const { load, remove } = setup({ conflict: false, multiParty: true });
    await screen.findByLabelText('Name');
    expect(load.mock.calls.map(([key]) => key.partyRef)).toEqual(['__formspec-multi-party-progress', 'applicant']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved access and start again' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(load.mock.calls[1][0]);
    expect(remove.mock.calls[0][0].partyRef).toBe('applicant');
  });

  it('preserves the chosen recovery language when starting blank current fields', async () => {
    setup();
    await screen.findByRole('heading', { name: 'This saved draft uses a different form version' });
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar acceso guardado y empezar de nuevo' }));
    await screen.findByLabelText('Nombre');
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: /español/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps editable answers and permits retry when toolbar deletion fails', async () => {
    const { load, remove } = setup({ conflict: false, deletionFails: true });
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved access and start again' }));
    await screen.findByText('Saved access could not be cleared. Try again.');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Retained answer');
    expect(load).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved access and start again' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenCalledOnce();
  });

  it('refuses hydration and automatic deletion/save, while translating recovery without saving the conflicting draft', async () => {
    const { load, save, remove } = setup();
    await screen.findByRole('heading', { name: 'This saved draft uses a different form version' });
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.getByText(/0\.1\.2/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    await screen.findByRole('heading', { name: 'Este borrador usa otra versión' });
    expect(screen.getByRole('button', { name: 'Borrar acceso guardado y empezar de nuevo' })).not.toBeNull();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('clears only the exact conflict key after an explicit user action and boots blank current fields', async () => {
    const { load, save, remove, conflictKeys } = setup({ partyRef: 'applicant' });
    await screen.findByRole('heading', { name: 'This saved draft uses a different form version' });
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved access and start again' }));
    await screen.findByLabelText('Name');
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(conflictKeys[0]);
    expect(conflictKeys[0].partyRef).toBe('applicant');
    expect(conflictKeys[0].formVersion).toBe('0.1.3');
    expect(load).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    expect(save).not.toHaveBeenCalled();
  });

  it('retains refusal after failed deletion, shows safe localized copy, and does not reboot or save', async () => {
    const { load, save, remove, getDefinition } = setup({ deletionFails: true });
    await screen.findByRole('heading', { name: 'This saved draft uses a different form version' });
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar acceso guardado y empezar de nuevo' }));
    await screen.findByText('No se pudo borrar el acceso guardado.');
    expect(screen.queryByText('Private host deletion details')).toBeNull();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(getDefinition).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Borrar acceso guardado y empezar de nuevo' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
