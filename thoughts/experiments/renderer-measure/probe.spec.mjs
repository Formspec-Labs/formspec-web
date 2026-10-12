import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
const evidence = '/Users/mikewolfd/Work/formspec-stack/thoughts/plans/benefits-scenarios/execution/reports/formspec-web/renderer-measure/run-04';
fs.mkdirSync(evidence, {recursive: true});
for (const arm of ['react', 'wc']) for (const sample of [{case:'ds82',locale:'en'}, {case:'nj',locale:'en'}, {case:'nj',locale:'es'}]) for (const viewport of [{name:'desktop',width:1280,height:900}, {name:'mobile',width:390,height:844}]) {
 const id = `${arm}-${sample.case}-${sample.locale}-${viewport.name}`;
 test(id, async ({page}) => {
  await page.setViewportSize(viewport);
  const raw = { id, arm, sample, viewport, console: [], errors: [], requests: [], keyboard: [], capability: {}, verdict: 'unresolved' };
  page.on('console', m => { if (['warning','error'].includes(m.type())) raw.console.push({type:m.type(),text:m.text()}); });
  page.on('pageerror', e => raw.errors.push(String(e.stack || e)));
  page.on('requestfailed', r => raw.requests.push({url:r.url(),failure:r.failure()}));
  page.on('response', r => { if (r.status() >= 400) raw.requests.push({url:r.url(),status:r.status()}); });
  try {
   await page.goto(`http://127.0.0.1:5187/?arm=${arm}&case=${sample.case}&locale=${sample.locale}`);
   await page.waitForFunction(() => window.probe && window.probe.status !== 'loading', {timeout:15000});
   raw.mount = await page.evaluate(() => ({status:window.probe.status,error:window.probe.error}));
   if (raw.mount.status !== 'mounted') throw new Error(raw.mount.error || 'mount failed');
   await page.waitForTimeout(600);
   raw.engineInput = await page.evaluate(()=>({instances:window.probe.engine.instanceData, diagnostics:window.probe.engine.getDiagnostics?.()}));
   raw.inventory = await page.locator('#root').evaluate(root => ({text:root.innerText,html:root.outerHTML,inputs:[...root.querySelectorAll('input,textarea,select,button')].map(el=>({tag:el.tagName,type:el.type,name:el.name,id:el.id,text:el.textContent,aria:el.getAttribute('aria-label'),capture:el.getAttribute('capture'),accept:el.accept,disabled:el.disabled,readonly:el.readOnly,display:getComputedStyle(el).display}))}));
   raw.axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
   await page.locator('body').click({position:{x:5,y:5}});
   for(let n=0;n<18;n++) { await page.keyboard.press('Tab'); raw.keyboard.push(await page.evaluate(()=>{const e=document.activeElement;return {tag:e.tagName,type:e.type,id:e.id,name:e.name,text:e.textContent?.slice(0,100),aria:e.getAttribute('aria-label')};})); }
   const radio=page.locator('#root input[type=radio]').first();
   if(await radio.count()) { await radio.focus(); await page.keyboard.press('Space'); raw.radioSpace = await radio.isChecked(); await page.keyboard.press('ArrowDown'); raw.radioAfterArrow = await page.locator('#root input[type=radio]:checked').evaluateAll(es=>es.map(e=>({name:e.name,value:e.value}))); }
   if(sample.case==='ds82') {
    const name=page.getByLabel('Full name', {exact:false}).first();
    if(await name.count() && await radio.count()) { await name.fill(''); await name.focus(); const radioId = await radio.getAttribute('id'); const label = page.locator(`label[for="${radioId}"]`); if(await label.count()) await label.click(); else await radio.locator('..').click(); raw.blurClickChecked = await radio.isChecked(); }
   }
   const files=page.locator('#root input[type=file]');
   raw.capability.fileControls=await files.count();
   raw.capability.cameraButtons=await page.getByRole('button',{name:/camera|capture/i}).count();
   raw.capability.captureAttributes=await page.locator('#root input[capture]').count();
   raw.capability.cryptographicSignButtons=await page.getByRole('button',{name:/^sign( |$)/i}).count();
   const submit=page.getByRole('button',{name:/submit|send|certif|enviar/i}).last();
   if(await submit.count()) { await submit.click(); await page.waitForTimeout(200); raw.afterSubmitAxe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze(); raw.afterSubmit = {alerts:await page.locator('[role=alert],[aria-live]').allTextContents(),invalid:await page.locator('[aria-invalid=true]').count(),text:await page.locator('#root').innerText()}; }
   raw.verdict=raw.errors.length ? 'page-errors' : raw.inventory.inputs.length ? 'mounted-controls' : 'no-controls';
  } catch(e) { raw.failure=String(e.stack || e); }
  finally { await page.screenshot({path:path.join(evidence,`${id}.png`),fullPage:true}).catch(()=>{}); fs.writeFileSync(path.join(evidence,`${id}.json`), JSON.stringify(raw,null,2)+'\n'); }
  if (raw.failure) throw new Error(raw.failure);
 });
}
