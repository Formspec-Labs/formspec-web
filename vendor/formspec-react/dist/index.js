/** @filedesc formspec-react — React hooks, auto-renderer, and default components for Formspec. */
// ── Hooks (re-exported from hooks barrel) ──
export { FormspecProvider, useFormspecContext, emitThemeTokens } from './context';
export { useSignal } from './use-signal';
export { useField } from './use-field';
export { useFieldValue } from './use-field-value';
export { useFieldError } from './use-field-error';
export { useForm } from './use-form';
export { useWhen } from './use-when';
export { useRepeatCount } from './use-repeat-count';
export { useLocale } from './use-locale';
export { useExternalValidation } from './use-external-validation';
// ── Parity hooks ──
export { useSubmitPending } from './use-submit-pending';
export { useDiagnostics } from './use-diagnostics';
export { useReplay } from './use-replay';
export { useFocusField } from './use-focus-field';
export { useRuntimeContext } from './use-runtime-context';
// ── Auto-renderer ──
export { FormspecForm } from './renderer';
export { FormspecNode } from './node-renderer';
export { IssuerChromeSlot, parseQueryIssuerOverride } from './issuer';
export { componentGraphIdentityAttrs, projectionMetadataAttrs, uiGraphRoutePolicyAttrs, } from './projection-metadata';
// ── Screener ──
export { FormspecScreener, useScreener } from './screener';
// ── Default components (for composition / override bases) ──
export { DefaultField } from './defaults/fields/default-field';
export { DefaultLayout } from './defaults/layout/default-layout';
export { Wizard } from './defaults/layout/wizard';
export { Tabs } from './defaults/layout/tabs';
export { ValidationSummary } from './validation-summary';
// ── Default theme ──
import { buildPlatformTheme } from '@formspec-org/layout';
export const defaultTheme = buildPlatformTheme();
