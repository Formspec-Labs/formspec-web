import type { FormDefinition, LocaleDocument } from '@formspec-org/types';
import { demoSampleForm } from './index.ts';

export const demoLocaleDocuments: LocaleDocument[] = [
  {
    $formspecLocale: '1.0',
    url: 'https://demo.formspec.org/locales/demo-intake/en',
    version: '1.0.0',
    name: 'demo-intake-en',
    title: 'Demo intake English strings',
    locale: 'en',
    targetDefinition: { url: demoSampleForm.url },
    strings: {
      '$form.title': 'Demo Benefits Intake',
      '$form.description': 'A compact public-intake form used by the zero-config Formspec Web demo.',
      'applicant.label': 'Applicant',
      'applicant.description': 'Primary contact for this intake.',
      'applicant.fullName.label': 'Full name',
      'applicant.fullName.hint': 'As it appears on your ID.',
      'applicant.email.label': 'Email address',
      'applicant.phone.label': 'Phone number',
      'applicant.phone.hint': 'Optional.',
      'applicant.preferredContact.label': 'Preferred contact method',
      'applicant.needsInterpreter.label': 'I need language help',
      'applicant.preferredLanguage.label': 'Preferred language',
      'applicant.preferredLanguage.hint': 'Shown for {{ $applicant.fullName }} when language help is requested.',
      'household.label': 'Household members',
      'household.description': 'Repeat group example.',
      'household.memberName.label': 'Member name',
      'household.memberAge.label': 'Member age',
      'notes.label': 'Anything else we should know?',
      'notes.hint': 'Optional.',
      '$optionSet.languages.en.label': 'English',
      '$optionSet.languages.es.label': 'Spanish',
      '$optionSet.languages.other.label': 'Another language',
      '$optionSet.contactMethods.email.label': 'Email',
      '$optionSet.contactMethods.phone.label': 'Phone',
      '$optionSet.contactMethods.mail.label': 'Mail',
    },
  },
  {
    $formspecLocale: '1.0',
    url: 'https://demo.formspec.org/locales/demo-intake/es',
    version: '1.0.0',
    name: 'demo-intake-es',
    title: 'Textos en espanol para la demostracion de admision',
    locale: 'es',
    fallback: 'en',
    targetDefinition: { url: demoSampleForm.url },
    strings: {
      '$form.title': 'Solicitud de beneficios de demostracion',
      '$form.description': 'Un formulario publico breve para la demostracion sin configuracion de Formspec Web.',
      'applicant.label': 'Solicitante',
      'applicant.description': 'Contacto principal para esta solicitud.',
      'applicant.fullName.label': 'Nombre completo',
      'applicant.fullName.hint': 'Como aparece en su identificacion.',
      'applicant.email.label': 'Correo electronico',
      'applicant.phone.label': 'Numero de telefono',
      'applicant.phone.hint': 'Opcional.',
      'applicant.preferredContact.label': 'Metodo de contacto preferido',
      'applicant.needsInterpreter.label': 'Necesito ayuda con el idioma',
      'applicant.preferredLanguage.label': 'Idioma preferido',
      'applicant.preferredLanguage.hint': 'Se muestra para {{ $applicant.fullName }} cuando solicita ayuda con el idioma.',
      'household.label': 'Miembros del hogar',
      'household.description': 'Ejemplo de grupo repetible.',
      'household.memberName.label': 'Nombre del miembro',
      'household.memberAge.label': 'Edad del miembro',
      'notes.label': 'Algo mas que debamos saber?',
      'notes.hint': 'Opcional.',
      '$optionSet.languages.en.label': 'Ingles',
      '$optionSet.languages.es.label': 'Espanol',
      '$optionSet.languages.other.label': 'Otro idioma',
      '$optionSet.contactMethods.email.label': 'Correo electronico',
      '$optionSet.contactMethods.phone.label': 'Telefono',
      '$optionSet.contactMethods.mail.label': 'Correo postal',
    },
  },
];

export function localeOptionsForDefinition(definition: FormDefinition): Array<{ code: string; label: string }> {
  const localeExtension = definition.extensions?.['x-formspec-locales'];
  if (!isRecord(localeExtension) || !Array.isArray(localeExtension.available)) {
    return [{ code: 'en', label: 'English' }];
  }

  const labels = isRecord(localeExtension.labels) ? localeExtension.labels : {};
  return localeExtension.available
    .filter((code): code is string => typeof code === 'string')
    .map((code) => ({
      code,
      label: typeof labels[code] === 'string' ? labels[code] : code.toUpperCase(),
    }));
}

export function defaultLocaleForDefinition(definition: FormDefinition): string {
  const localeExtension = definition.extensions?.['x-formspec-locales'];
  if (!isRecord(localeExtension)) {
    return 'en';
  }
  return typeof localeExtension.default === 'string' ? localeExtension.default : 'en';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
