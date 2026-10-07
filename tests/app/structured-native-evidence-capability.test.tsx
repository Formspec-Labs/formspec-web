import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { resolveModules } from '@formspec-org/app-graph';
import { StructuredPanel, STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA, STRUCTURED_PANEL_DELIVERY_CONTRACT_ID,
  STRUCTURED_PANEL_RENDERED_CONFIG_NODES, starterWidgetModule, type StructuredJsonBlockConfig, type SurfaceWidgetProps } from '@formspec-org/surface-react';
import commonSchema from '../../vendor/formspec-schemas/common.schema.json';

const trace = { 'x-generation': { anchors: ['need:inspect-retained-evidence@1'] } };
const block: StructuredJsonBlockConfig = { type: 'json', id: 'evidence', path: 'evidence', title: 'Retained evidence',
  emptyMessage: 'No evidence supplied', unavailableMessage: 'Evidence unavailable', ...trace };
afterEach(cleanup);
function view(data: Record<string, unknown>, selected: StructuredJsonBlockConfig = block, extraConfig: Record<string, unknown> = {}) {
  const props: SurfaceWidgetProps = { moduleId: 'x-test-evidence', widgetName: 'StructuredPanel', slot: { id: 'evidence' },
    route: { surfaceId: 'surface', routeId: 'review', routeClass: 'operation', params: {} }, headingLevel: 2, admitsTenantTheme: false,
    config: { ...trace, blocks: [selected], ...extraConfig }, data, emitAction: vi.fn() };
  return render(<StructuredPanel {...props} />);
}

describe('public structured native evidence display', () => {
  it('preserves all nested JSON, original values and long literal text without deriving a summary', () => {
    const original = { report: { valid: false, results: [{ severity: 'error', code: 'retained-code', message: '<script>literal</script>' }],
      timing: null, extensions: { 'x-custom': [0, false, '', {}, []] } }, verification: { status: 'unverified', details: 'Long exact value '.repeat(600) } };
    const before = structuredClone(original); const rendered = view({ evidence: original });
    const pre = rendered.container.querySelector('pre')!;
    expect(pre.textContent).toBe(JSON.stringify(original, null, 2)); expect(JSON.parse(pre.textContent!)).toEqual(before);
    expect(pre.getAttribute('data-need-anchors')).toBe('need:inspect-retained-evidence@1');
    expect(original).toEqual(before); expect(rendered.container.querySelector('script,input,select,textarea,button')).toBeNull();
  });

  it.each([null, false, 0, '', [], {}])('preserves explicit %j as JSON rather than treating it as missing', value => {
    const rendered = view({ evidence: value });
    expect(rendered.container.querySelector('pre')?.textContent).toBe(JSON.stringify(value, null, 2));
    expect(screen.queryByText(block.emptyMessage)).toBeNull();
  });

  it('distinguishes absent own properties, present undefined and inherited selection', () => {
    const rendered = view({}); expect(screen.getByText(block.emptyMessage)).toBeDefined();
    rendered.unmount(); const present = view({ evidence: undefined }); expect(screen.getByText(block.unavailableMessage)).toBeDefined();
    present.unmount();
    const inherited: Record<string, unknown> = {}; Object.setPrototypeOf(inherited, { evidence: { privateValue: 'inherited' } });
    view(inherited); expect(screen.getByText(block.emptyMessage)).toBeDefined(); expect(screen.queryByText(/inherited/)).toBeNull();
  });

  it.each(['root', 'nested'] as const)('refuses a %s getter without reading it or partially displaying values', kind => {
    const getter = vi.fn(() => 'private'); const target = { retained: 'visible-child' };
    Object.defineProperty(target, kind === 'root' ? 'evidence' : 'private', { enumerable: true, get: getter });
    const rendered = view(kind === 'root' ? target : { evidence: target });
    expect(getter).not.toHaveBeenCalled(); expect(screen.getByText(block.unavailableMessage)).toBeDefined();
    expect(rendered.container.querySelector('pre')).toBeNull(); expect(rendered.container.textContent).not.toContain('visible-child');
  });

  it.each([NaN, Infinity, new Date(), [undefined]])('refuses non-finite or non-JSON evidence %j as a whole', value => {
    const rendered = view({ evidence: { keep: 'retained-child', invalid: value } });
    expect(screen.getByText(block.unavailableMessage)).toBeDefined(); expect(rendered.container.querySelector('pre')).toBeNull();
    expect(rendered.container.textContent).not.toContain('retained-child');
  });

  it('refuses unsafe selectors while retaining legitimate tagged own JSON keys', () => {
    const tagged = { value: { status: 'literal', draft: null, actor: '', constructorLabel: 'ordinary own key' } };
    const rendered = view({ evidence: tagged }, { ...block, path: 'evidence.value' });
    expect(JSON.parse(rendered.container.querySelector('pre')!.textContent!)).toEqual(tagged.value); rendered.unmount();
    const refused = view({ evidence: tagged }, { ...block, path: 'evidence.__proto__' });
    expect(screen.getByText(block.unavailableMessage)).toBeDefined(); expect(refused.container.querySelector('pre')).toBeNull();
  });

  it('requires traced Need content and admits the exact public JSON schema in authored widget props', () => {
    const ajv = new Ajv({ strict: false }); addFormats(ajv); ajv.addSchema(commonSchema);
    const validate = ajv.compile(STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA); expect(validate(block), JSON.stringify(validate.errors)).toBe(true);
    const { 'x-generation': generation, ...untraced } = block; expect(generation).toEqual(trace['x-generation']); expect(validate(untraced)).toBe(false);
    const rendered = view({ evidence: {} }, { ...block, 'x-generation': { anchors: [] } });
    expect(rendered.container.querySelector('[data-block-id]')).toBeNull();
    const registry = { $formspecRegistry: '1.1', publisher: { name: 'Test author' }, published: '2026-10-07T00:00:00Z', entries: [
      { name: 'x-test-evidence', category: 'module', version: '0.1.0', status: 'stable', description: 'Test module', contributes: ['x-structured-panel'] },
      { name: 'x-structured-panel', category: 'widget', version: '0.1.0', status: 'stable', description: 'Literal retained evidence',
        widgetShape: { widgetName: 'StructuredPanel', props: { type: 'object', required: ['blocks'], properties: { blocks: { type: 'array', items: STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA } } },
          childrenPolicy: 'none', dataInputs: [{ name: 'evidence', required: true }], deliveryContractId: STRUCTURED_PANEL_DELIVERY_CONTRACT_ID,
          renderedConfigNodes: STRUCTURED_PANEL_RENDERED_CONFIG_NODES } },
    ] };
    const authored = { $formspecSurface: '0.2', id: 'evidence', entry: 'review', modules: [{ id: 'x-test-evidence', version: '0.1.0' }], routes: [{ id: 'review', path: '/', slots: [{ id: 'evidence', slotType: 'module-widget',
      binding: { moduleId: 'x-test-evidence', widgetName: 'StructuredPanel', config: { blocks: [block] } } }] }] };
    const propsSchema = registry.entries[1].widgetShape!.props;
    const validateProps = ajv.compile(propsSchema);
    const admit = (document: typeof authored) => resolveModules({ appModules: document.modules,
      registries: [{ entries: registry.entries }], documents: [{ artifactSlot: 'surface', artifactKind: 'surface',
        modules: document.modules, uses: [{ site: 'surface.module-widget.binding.widgetName', name: 'x-structured-panel', expectedCategory: 'widget',
          payload: document.routes[0].slots[0].binding.config, payloadValidator: 'widgetShape.props',
          source: { artifactSlot: 'surface', artifactKind: 'surface', jsonPointer: '/routes/0/slots/0/binding/config' } }] }],
      support: { payloadSchemaValidators: ['widgetShape.props'], payloadValidators: { 'widgetShape.props': ({ payload, schema }) => {
        expect(schema).toEqual(propsSchema);
        return { ok: validateProps(payload), ...(validateProps.errors?.[0] ? { path: validateProps.errors[0].instancePath } : {}) };
      } } } });
    expect(admit(authored).ok).toBe(true);
    const invalid = structuredClone(authored); invalid.routes[0].slots[0].binding.config.blocks[0].path = 'bad..path';
    const refused = admit(invalid);
    expect(refused.ok).toBe(false);
    expect(refused.diagnostics.some(diagnostic => diagnostic.code === 'MODULE-PAYLOAD-SCHEMA-MISMATCH')).toBe(true);
  });

  it('preserves legacy text, state and count blocks and identical default/custom module contracts', () => {
    const defaults = starterWidgetModule('x-test-evidence'), custom = starterWidgetModule('x-test-evidence', { responseReview: {} });
    expect(Object.keys(custom.widgets).sort()).toEqual(Object.keys(defaults.widgets).sort()); expect(custom.contracts).toEqual(defaults.contracts);
    expect(defaults.widgets.StructuredPanel).toBe(StructuredPanel); expect(custom.widgets['x-structured-panel']).toBe(StructuredPanel);
    expect(defaults.contracts?.StructuredPanel).toEqual({ deliveryContractId: STRUCTURED_PANEL_DELIVERY_CONTRACT_ID, registryEntryVersion: '0.1.0', renderedConfigNodes: STRUCTURED_PANEL_RENDERED_CONFIG_NODES });
    const rendered = view({ evidence: { literal: 'retained' }, count: 0 }, block, { title: 'Legacy summary', state: 'Needs attention', body: 'Original authored notice',
      blocks: [{ type: 'metric', id: 'count', label: 'Records', path: 'count', ...trace }, block] });
    expect(screen.getByText('Legacy summary')).toBeDefined(); expect(screen.getByText('Needs attention')).toBeDefined();
    expect(screen.getByText('Original authored notice')).toBeDefined(); expect(screen.getByText('0')).toBeDefined();
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2); expect(rendered.container.querySelectorAll('pre')).toHaveLength(1);
  });
});
