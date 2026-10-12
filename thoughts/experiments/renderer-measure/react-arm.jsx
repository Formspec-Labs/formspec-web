import React from 'react';
import { createRoot } from 'react-dom/client';
import { FormspecForm, FormspecProvider, FormspecNode } from '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/react/formspec-react/dist/index.js';
import { FormEngine } from '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/react/formspec-engine/dist/index.js';
import { initFormspecEngine } from '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/react/formspec-engine/dist/init-formspec-engine.js';
import '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/react/styles/tailwind-formspec-core.css';
import '/@fs/Users/mikewolfd/Work/formspec-stack/formspec-web/output/playwright/renderer-measure-prebuilt/react/styles/app.css';
import { input } from './inputs.js';
await initFormspecEngine();

const engine = new FormEngine(input.definition);
for (const locale of input.locales) engine.loadLocale(locale);
engine.setLocale(window.probe.locale);
if (input.claimant) { await engine.waitForInstanceSources(); await engine.getResolvedIssuer(); }
if (input.claimant && JSON.stringify(engine.instanceData.claimant) !== JSON.stringify(input.claimant)) throw new Error('Claimant source fidelity failed');
window.probe.engine = engine;
const explicitActionHost = new URLSearchParams(location.search).get('actionHost') === 'explicit';
function PublishedActions() {
  return (input.actions?.actions || []).map(action => {
    const label = action.label?.literal ?? engine.lookupLocaleString(action.label?.ref);
    if (!label) throw new Error('Published action label cannot resolve');
    const node = { id: `probe-action-${action.id}`, component: 'ActionButton', category: 'interactive', props: { actionRef: action.id, label: { literal: label } }, children: [], cssClasses: [] };
    return <FormspecNode key={action.id} node={node} />;
  });
}
createRoot(document.getElementById('root')).render(<><FormspecForm engine={engine} themeDocument={input.theme} registryEntries={input.registry?.entries} responseActionsDocument={input.actions} onActionResult={result => { window.probe.actionResult = result; }} onSubmit={result => { window.probe.submission = result; }} />
{explicitActionHost ? <section aria-label="Published Response Actions"><FormspecProvider engine={engine} responseActionsDocument={input.actions} onActionResult={result => { window.probe.actionResult = result; }} onSubmit={result => { window.probe.submission = result; }}><PublishedActions /></FormspecProvider></section> : null}</>);
window.probe.status = 'mounted';
