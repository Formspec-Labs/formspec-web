import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
import { RespondentDefinitionController } from '../../src/app/RespondentRuntime.tsx';
import { createStubComposition } from '../../src/composition/stub.ts';
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
  it('uses a subordinate recovery heading and returns focus locally after restart in the chosen language', async () => {
    const base = createStubComposition();
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
