import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { createStubComposition } from '../../src/composition/stub.ts';
import type { DraftKey, DraftStore } from '../../src/ports/draft-store.ts';
import type { SubmitTransport } from '../../src/ports/submit-transport.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

const definition: FormDefinition = {
  $formspec: '1.0', url: 'https://example.test/forms/locale', version: '1.0.0',
  title: 'Inline wording', items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
};
const spanish: LocaleDocument = {
  $formspecLocale: '2.0', url: 'https://example.test/locales/es-US', version: '2.1.0',
  locale: 'es-us', target: { kind: 'definition', url: definition.url },
  strings: {
    '$form.title': 'Texto guardado', 'name.label': 'Nombre',
    '$ui.form.languageSaveFailed': 'No se pudo guardar el cambio de idioma. Inténtelo de nuevo.',
  },
};

beforeAll(() => initFormspecEngine());
afterEach(cleanup);

function snapshot(document?: LocaleDocument): FormResponse {
  const engine = createFormEngine(definition);
  if (document) { engine.loadLocale(document); engine.setLocale(document.locale); }
  engine.setValue('name', 'Retained answer');
  return engine.getResponse({ profile: 'off' });
}

function setup(draft?: FormResponse, documents: LocaleDocument[] = [spanish], overrides: {
  submitTransport?: SubmitTransport;
  draftStore?: Partial<DraftStore>;
} = {}) {
  const save = vi.fn(async (_key: DraftKey, _response: FormResponse): Promise<void> => {});
  const base = createStubComposition();
  const composition = {
    ...base, initialDefinitionUrl: definition.url,
    definitionSource: {
      getDefinition: async () => definition,
      getLocaleDocuments: async () => documents,
    },
    draftStore: { ...base.draftStore, load: async () => draft, save, ...overrides.draftStore },
    submitTransport: overrides.submitTransport ?? base.submitTransport,
  };
  render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
  return save;
}

describe('canonical draft wording (ADR 0082 D16.2)', () => {
  it('restores the exact saved language and answers before rendering', async () => {
    setup(snapshot(spanish));
    await screen.findByRole('heading', { name: 'Texto guardado' });
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Retained answer');
    expect(screen.getByRole('button', { name: /español/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it.each(['version', 'url', 'missing'] as const)('refuses a %s mismatch instead of reverting to inline wording', async mismatch => {
    const documents = mismatch === 'missing' ? [] : [{
      ...spanish,
      ...(mismatch === 'version' ? { version: '3.0.0' } : { url: 'https://example.test/another-locale' }),
    }];
    setup(snapshot(spanish), documents);
    await screen.findByText(/saved draft language document is unavailable/i);
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('keeps saved inline wording when a new locale document is available', async () => {
    setup(snapshot(), [{ ...spanish, locale: 'en', strings: { '$form.title': 'New English wording' } }]);
    await screen.findByRole('heading', { name: 'Inline wording' });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Retained answer');
  });

  it('refuses a matching pin shadowed by another loaded version of the same language', async () => {
    setup(snapshot(spanish), [spanish, { ...spanish, version: '3.0.0' }]);
    await screen.findByText(/loaded language document does not match/i);
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  it('saves changed language with current answers through DraftStore', async () => {
    const save = setup(snapshot());
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited answer' } });
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const response = save.mock.calls[0][1] as FormResponse;
    expect(response.data).toEqual({ name: 'Edited answer' });
    expect(response.displayedLocale).toEqual({ url: spanish.url, version: spanish.version, locale: 'es-US' });
  });

  it('reports a failed language save without losing the edited answers', async () => {
    const save = setup(snapshot());
    save.mockRejectedValueOnce(new Error('Draft storage unavailable'));
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved answer' } });
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    await screen.findByText('No se pudo guardar el cambio de idioma. Inténtelo de nuevo.');
    expect(screen.queryByText(/Draft storage unavailable/)).toBeNull();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Unsaved answer');
  });

  it('serializes rapid language changes so an earlier save cannot overwrite the latest pin', async () => {
    const english = { ...spanish, locale: 'en', url: 'https://example.test/locales/en', strings: {} };
    const save = setup(snapshot(), [spanish, english]);
    let releaseFirst!: () => void;
    save.mockImplementationOnce(() => new Promise<void>(resolve => { releaseFirst = resolve; }));
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(save).toHaveBeenCalledOnce();
    releaseFirst();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0][1].displayedLocale?.locale).toBe('es-US');
    expect(save.mock.calls[1][1].displayedLocale?.locale).toBe('en');
    expect(save.mock.calls[1][1].data).toEqual({ name: 'Retained answer' });
  });

  it('freezes language during submit and confirmation, and clears only after queued saves finish', async () => {
    const english = { ...spanish, locale: 'en', url: 'https://example.test/locales/en', strings: {} };
    const events: string[] = [];
    const deleteDraft = vi.fn(async () => { events.push('delete'); });
    const submit = vi.fn(async () => {
      events.push('submit');
      return { referenceNumber: 'LOCALE-RECEIPT', status: 'accepted' as const };
    });
    const save = setup(snapshot(), [spanish, english], {
      submitTransport: { submit }, draftStore: { delete: deleteDraft },
    });
    let releaseFirst!: () => void;
    save.mockImplementationOnce(() => new Promise<void>(resolve => {
      releaseFirst = () => { events.push('language-save'); resolve(); };
    }));
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    await waitFor(() => expect((screen.getByRole('button', { name: /español/i }) as HTMLButtonElement).disabled).toBe(true));
    // Exercise the handler guard as well as disabled markup (e.g. a stale queued event).
    screen.getByRole('button', { name: /español/i }).removeAttribute('disabled');
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    screen.getByRole('button', { name: /español/i }).setAttribute('disabled', '');
    expect(save).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    releaseFirst();
    await screen.findByText('LOCALE-RECEIPT');
    const savesBeforeClear = save.mock.calls.length;
    expect(save.mock.calls[1][1].displayedLocale?.locale).toBe('en');
    expect((screen.getByRole('button', { name: /español/i }) as HTMLButtonElement).disabled).toBe(true);
    screen.getByRole('button', { name: /español/i }).removeAttribute('disabled');
    fireEvent.click(screen.getByRole('button', { name: /español/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear this computer' }));
    await screen.findByText('Saved access cleared');
    expect(events).toEqual(['language-save', 'submit', 'delete']);
    expect(save).toHaveBeenCalledTimes(savesBeforeClear);
    expect(deleteDraft).toHaveBeenCalledOnce();
  });

  it('allows language changes again after a failed submission', async () => {
    const submit = vi.fn(async () => { throw new Error('Submission unavailable'); });
    const save = setup(snapshot(), [spanish], { submitTransport: { submit } });
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    await screen.findByText('Submission unavailable');
    const previousSaves = save.mock.calls.length;
    const button = screen.getByRole('button', { name: /español/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(previousSaves + 1));
    expect(save.mock.calls.at(-1)?.[1].displayedLocale?.locale).toBe('es-US');
  });
});
