import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine, initFormspecEngine, initFormspecEngineTools, isFormspecEngineInitialized,
  isFormspecEngineToolsInitialized, lintDocument } from '@formspec-org/engine';
import { STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA, STRUCTURED_PANEL_CONFIG_SCHEMA } from '@formspec-org/surface-react';

const config = { type: 'json', id: 'report', path: 'evidence.validationReport', emptyMessage: 'Empty',
  unavailableMessage: 'Unavailable', 'x-generation': { anchors: ['need:inspect-retained-evidence@1'] } };
const variants: Record<string, { props: unknown; config: unknown; valid: boolean }> = {
  valid: { props: STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA, config, valid: true },
  badPath: { props: STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA, config: { ...config, path: 'bad..path' }, valid: false },
  malformedGeneration: { props: STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA, config: { ...config, 'x-generation': { anchors: 7 } }, valid: false },
  missingFragment: { props: { $ref: 'https://formspec.org/schemas/common/1.0#/$defs/DoesNotExist' }, config, valid: false },
  unknownReference: { props: { $ref: 'https://invalid.example/schema' }, config, valid: false },
  invalidSchema: { props: { type: 'banana' }, config, valid: false },
  localDefs: { props: { $defs: { Config: { type: 'object' } }, $ref: '#/$defs/Config' }, config, valid: true },
  booleanTrue: { props: true, config, valid: true },
  booleanFalse: { props: false, config, valid: false },
};
const sites = ['defaults', 'selectors', 'surface'] as const;
const trace = { 'x-generation': config['x-generation'] };
const wholePanel = {
  id: 'panel', title: 'Evidence', ...trace,
  blocks: [
    { type: 'metric', id: 'count', path: 'evidence.count', ...trace },
    { type: 'key-value', id: 'facts', items: [{ id: 'fact', label: 'Fact', path: 'evidence.fact', ...trace }], ...trace },
    { type: 'list', id: 'list', path: 'evidence.items', itemPath: 'label', ...trace },
    { type: 'table', id: 'table', path: 'evidence.rows', columns: [{ id: 'column', label: 'Column', path: 'value', ...trace }], ...trace },
    { type: 'progress', id: 'progress', path: 'evidence.progress', max: 100, ...trace },
    config,
  ],
  actions: [{ outputName: 'inspect', ...trace, confirmation: { heading: 'Inspect', body: 'Inspect evidence?',
    confirmLabel: 'Confirm', cancelLabel: 'Cancel', ...trace } }],
};
const wholeVariants = {
  valid: wholePanel,
  invalidConfirmation: { ...wholePanel, actions: [{ ...wholePanel.actions[0], confirmation: { ...wholePanel.actions[0].confirmation, body: false } }] },
  malformedGeneration: { ...wholePanel, 'x-generation': { anchors: 7 } },
};
type Site = typeof sites[number];
function registry(props: unknown) {
  const metadata = { version: '1.0.0', status: 'stable', description: 'Evidence', compatibility: { formspecVersion: '>=1.0.0' } };
  return { $formspecRegistry: '1.1', publisher: { name: 'Example' }, published: '2026-10-07T00:00:00Z', entries: [
    { name: 'x-evidence', category: 'module', ...metadata, contributes: ['x-evidence-panel'] },
    { name: 'x-evidence-panel', category: 'widget', ...metadata, widgetShape: { widgetName: 'StructuredPanel', props } },
  ] };
}
function document(site: Site, value: unknown) {
  const modules = [{ id: 'x-evidence', version: '1.0.0' }];
  if (site === 'surface') return { $formspecSurface: '0.2', id: 'evidence', entry: 'review', modules,
    routes: [{ id: 'review', path: '/', slots: [{ id: 'panel', slotType: 'module-widget', binding: {
      moduleId: 'x-evidence', widgetName: 'StructuredPanel', config: value } }] }] };
  const block = { widget: 'x-evidence-panel', widgetConfig: value, fallback: ['TextInput'] };
  return { $formspecTheme: '1.0', version: '1.0.0', modules,
    ...(site === 'defaults' ? { defaults: block } : { selectors: [{ match: { dataType: 'string' }, apply: block }] }) };
}
type LintResult = ReturnType<typeof lintDocument>;
const results: Record<string, LintResult> = {};
const supplemental: Record<string, LintResult> = {};
const retained: Record<string, unknown> = {};
const fetch = vi.fn(() => { throw new Error('Unexpected lint schema retrieval'); });

beforeAll(async () => {
  await initFormspecEngine(); await initFormspecEngineTools();
  // Initialization is outside this guard; only actual public lint retrieval is measured.
  vi.stubGlobal('fetch', fetch);
  for (const [name, variant] of Object.entries(variants)) for (const site of sites) {
    results[`${site}/${name}`] = lintDocument(document(site, structuredClone(variant.config)), { registryDocuments: [registry(structuredClone(variant.props))] });
  }
  for (const [name, value] of Object.entries(wholeVariants)) for (const site of sites) {
    supplemental[`${site}/${name}`] = lintDocument(document(site, structuredClone(value)),
      { registryDocuments: [registry(structuredClone(STRUCTURED_PANEL_CONFIG_SCHEMA))] });
  }
  const locale = { $formspecLocale: '2.0', version: '1.0.0', target: { kind: 'definition', url: 'urn:test:locale' },
    locale: 'en', strings: { '$ui.draft.saveUnconfirmed': 'Keep this page open.' } };
  retained.localeKnown = lintDocument(locale);
  retained.localeUnknown = lintDocument({ ...locale, strings: { '$ui.draft.saveUnconfirmd': 'Unknown key' } });
  const engine = createFormEngine({ $formspec: '1.0', url: 'urn:test:sdk', version: '1.0.0', status: 'draft', title: 'SDK fixture',
    items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Answer' }] });
  try { engine.setValue('answer', 'Retained'); retained.sdkData = engine.getResponse({ id: '019cb93a-a710-7000-8000-000000000001' }).data; }
  finally { engine.dispose(); }
  retained.initialized = { runtime: isFormspecEngineInitialized(), tools: isFormspecEngineToolsInitialized() };
  const capture = process.env.FORMSPEC_NATIVE_TOOLS_CAPTURE;
  if (capture) writeFileSync(capture, `${JSON.stringify({ cases: results, supplemental, retained, lintFetchCalls: fetch.mock.calls.length }, null, 2)}\n`);
});
afterAll(() => vi.unstubAllGlobals());

describe('actual web public native Tools widget props compilation', () => {
  for (const name of Object.keys(wholeVariants)) for (const site of sites) {
    it(`${site}/whole-panel/${name} compiles the installed public whole schema`, () => {
      const result = supplemental[`${site}/${name}`];
      expect(result.valid).toBe(name === 'valid');
      const diagnostics = result.diagnostics.filter(diagnostic => diagnostic.code === 'E604');
      if (name === 'valid') expect(diagnostics).toEqual([]);
      else expect(diagnostics).toEqual([expect.objectContaining({ code: 'E604', severity: 'error' })]);
      expect(fetch).not.toHaveBeenCalled();
    });
  }
  for (const [name, variant] of Object.entries(variants)) for (const site of sites) {
    it(`${site}/${name} uses the maintained native props compiler`, () => {
      const result = results[`${site}/${name}`];
      expect(result.valid).toBe(variant.valid);
      const diagnostics = result.diagnostics.filter(diagnostic => diagnostic.code === 'E604');
      if (variant.valid) expect(diagnostics).toEqual([]);
      else {
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].severity).toBe('error');
        expect(diagnostics[0].path).toContain(site === 'surface' ? 'routes[0].slots[0].binding.config' : site === 'defaults' ? 'defaults.widgetConfig' : 'selectors[0].apply.widgetConfig');
      }
      expect(fetch).not.toHaveBeenCalled();
    });
  }
  it('preserves ordinary boolean-false E604 metadata and retained Locale/SDK results exactly', () => {
    expect({ ordinaryFalse: Object.fromEntries(sites.map(site => [site, results[`${site}/booleanFalse`]])), retained }).toMatchInlineSnapshot(`
      {
        "ordinaryFalse": {
          "defaults": {
            "diagnostics": [
              {
                "code": "E604",
                "message": "Module contribution 'x-evidence-panel' (from module 'x-evidence') payload mismatch: False schema does not allow {"type":"json","id":"report","path":"evidence.validationReport","emptyMessage":"Empty","unavailableMessage":"Unavailable","x-generation":{"anchors":["need:inspect-retained-evidence@1"]}}",
                "pass": 3,
                "path": "$.defaults.widgetConfig",
                "severity": "error",
                "specRef": "specs/registry/extension-registry.md#32-category-specific-properties",
                "suggestedFix": "align the consuming-document value to the contributing module's payload schema (widget.widgetShape.props, slot-type.slotShape, unit-kind.semantics, validation-mapping-row.row, or token-category.categoryShape); future module-contributed \`Component.component: x-...\` widget admittance gates through this pass per ADR 0150 §4.5 (deferred from Task 5)",
              },
            ],
            "documentType": "theme",
            "valid": false,
          },
          "selectors": {
            "diagnostics": [
              {
                "code": "E604",
                "message": "Module contribution 'x-evidence-panel' (from module 'x-evidence') payload mismatch: False schema does not allow {"type":"json","id":"report","path":"evidence.validationReport","emptyMessage":"Empty","unavailableMessage":"Unavailable","x-generation":{"anchors":["need:inspect-retained-evidence@1"]}}",
                "pass": 3,
                "path": "$.selectors[0].apply.widgetConfig",
                "severity": "error",
                "specRef": "specs/registry/extension-registry.md#32-category-specific-properties",
                "suggestedFix": "align the consuming-document value to the contributing module's payload schema (widget.widgetShape.props, slot-type.slotShape, unit-kind.semantics, validation-mapping-row.row, or token-category.categoryShape); future module-contributed \`Component.component: x-...\` widget admittance gates through this pass per ADR 0150 §4.5 (deferred from Task 5)",
              },
            ],
            "documentType": "theme",
            "valid": false,
          },
          "surface": {
            "diagnostics": [
              {
                "code": "E604",
                "message": "Module contribution 'x-evidence-panel' (from module 'x-evidence') payload mismatch: False schema does not allow {"type":"json","id":"report","path":"evidence.validationReport","emptyMessage":"Empty","unavailableMessage":"Unavailable","x-generation":{"anchors":["need:inspect-retained-evidence@1"]}}",
                "pass": 3,
                "path": "$.routes[0].slots[0].binding.config",
                "severity": "error",
                "specRef": "specs/registry/extension-registry.md#32-category-specific-properties",
                "suggestedFix": "align the consuming-document value to the contributing module's payload schema (widget.widgetShape.props, slot-type.slotShape, unit-kind.semantics, validation-mapping-row.row, or token-category.categoryShape); future module-contributed \`Component.component: x-...\` widget admittance gates through this pass per ADR 0150 §4.5 (deferred from Task 5)",
              },
            ],
            "documentType": "surface",
            "valid": false,
          },
        },
        "retained": {
          "initialized": {
            "runtime": true,
            "tools": true,
          },
          "localeKnown": {
            "diagnostics": [],
            "documentType": "locale",
            "valid": true,
          },
          "localeUnknown": {
            "diagnostics": [
              {
                "code": "E101",
                "message": ""$ui.draft.saveUnconfirmd" is not one of "$ui.select.placeholder", "$ui.select.clearSelection" or 151 other candidates",
                "pass": 1,
                "path": "$.strings",
                "severity": "error",
                "specRef": "specs/core/spec.md#4-definition-schema",
                "suggestedFix": "align the document with schemas/*.schema.json — fix the flagged property or value",
              },
              {
                "code": "E101",
                "message": ""$ui.draft.saveUnconfirmd" is not one of "$ui.select.placeholder", "$ui.select.clearSelection" or 139 other candidates",
                "pass": 1,
                "path": "$.strings",
                "severity": "error",
                "specRef": "specs/core/spec.md#4-definition-schema",
                "suggestedFix": "align the document with schemas/*.schema.json — fix the flagged property or value",
              },
              {
                "code": "E1401",
                "message": "Locale $ui key references unknown ChromeStringKey "draft.saveUnconfirmd"",
                "pass": 9,
                "path": "$.strings["$ui.draft.saveUnconfirmd"]",
                "severity": "error",
                "specRef": "specs/locale/locale-spec.md#static-semantics-and-lint",
                "suggestedFix": "change the string key to a supported Locale namespace and presentation terminal",
              },
            ],
            "documentType": "locale",
            "valid": false,
          },
          "sdkData": {
            "answer": "Retained",
          },
        },
      }
    `);
    expect(retained.localeKnown).toMatchObject({ documentType: 'locale', valid: true, diagnostics: [] });
    expect(retained.localeUnknown).toMatchObject({ valid: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'E1401' })]) });
    expect(retained.initialized).toEqual({ runtime: true, tools: true });
    expect(retained.sdkData).toEqual({ answer: 'Retained' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
