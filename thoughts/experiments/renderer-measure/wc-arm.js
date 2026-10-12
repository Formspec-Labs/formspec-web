import { FormspecRender, globalRegistry } from '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/wc/formspec-webcomponent/dist/index.js';
import { FormEngine } from '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/wc/formspec-engine/dist/index.js';
import { initFormspecEngine } from '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/wc/formspec-engine/dist/init-formspec-engine.js';
import { uswdsAdapter } from '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/wc/formspec-adapters/dist/index.js';
import { input } from './inputs.js';
await initFormspecEngine();

globalRegistry.registerAdapter(uswdsAdapter);
if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
const form = document.createElement('formspec-render');
if (input.registry) form.registryDocuments = input.registry;
form.localeDocuments = input.locales;
form.locale = window.probe.locale;
form.themeDocument = input.theme ? { ...input.theme, adapter: 'uswds' } : { $formspecTheme: '1.0', targetDefinition: {url: input.definition.url}, adapter: 'uswds' };
form.responseActionsDocument = input.actions || null;
form.addEventListener('formspec-submit', event => { window.probe.submission = event.detail; });
document.getElementById('root').append(form);
form.definition = input.definition;
window.probe.engine = form.getEngine();
if (input.claimant) { await window.probe.engine.waitForInstanceSources(); await window.probe.engine.getResolvedIssuer(); }
if (input.claimant && JSON.stringify(window.probe.engine.instanceData.claimant) !== JSON.stringify(input.claimant)) throw new Error('Claimant source fidelity failed');
window.probe.status = 'mounted';
