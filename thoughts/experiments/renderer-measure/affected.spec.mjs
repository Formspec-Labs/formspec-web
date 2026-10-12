import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
const report='/Users/mikewolfd/Work/formspec-stack/thoughts/plans/benefits-scenarios/execution/reports/formspec-web/renderer-measure/affected-01';fs.mkdirSync(report,{recursive:true});
const example=JSON.parse(fs.readFileSync(new URL('./inputs/nj-example.response.json',import.meta.url)));
const claimant=JSON.parse(fs.readFileSync(new URL('./inputs/claimant.json',import.meta.url)));
const fields=()=>{const root=document.querySelector('#root');return window.probe.engine.getFieldPaths().map(path=>{const nodes=[...root.querySelectorAll('[data-name]')].filter(e=>e.getAttribute('data-name')===path);const visible=nodes.filter(e=>{for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||p.hidden)return false;}return e.getClientRects().length>0;});return {path,relevant:window.probe.engine.isPathRelevant(path),rendered:nodes.length,visible:visible.length>0,text:visible.map(e=>e.innerText),controls:visible.flatMap(e=>[...e.querySelectorAll('input,textarea,select')].map(i=>({type:i.type,value:i.value,readonly:i.readOnly})))};});};
for(const arm of ['react','wc'])for(const locale of ['en','es'])for(const viewport of [{name:'desktop',width:1280,height:900},{name:'mobile',width:390,height:844}])test(`${arm}-nj-${locale}-${viewport.name}`,async({page})=>{
 const id=`${arm}-nj-${locale}-${viewport.name}`;const raw={id,arm,locale,viewport,errors:[],console:[],requests:[]};page.on('pageerror',e=>raw.errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))raw.console.push(m.text());});page.on('requestfailed',r=>raw.requests.push({url:r.url(),failure:r.failure()}));
 try{
  await page.setViewportSize(viewport);await page.goto(`http://127.0.0.1:5187/?arm=${arm}&case=nj&locale=${locale}&actionHost=explicit`);await page.waitForFunction(()=>window.probe?.status!=='loading');
  raw.mount=await page.evaluate(()=>({status:window.probe.status,error:window.probe.error,instances:window.probe.engine?.instanceData}));expect(raw.mount.status).toBe('mounted');expect(raw.mount.instances.claimant).toEqual(claimant);
  raw.initialFields=await page.evaluate(fields);raw.initialText=await page.locator('#root').innerText();raw.initialAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  raw.keyboard=[];await page.locator('body').click({position:{x:5,y:5}});for(let n=0;n<18;n++){await page.keyboard.press('Tab');raw.keyboard.push(await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,name:document.activeElement.name})));}
  const radio=page.locator('#root input[type=radio]').first();await radio.focus();await page.keyboard.press('Space');raw.radioSpace=await radio.isChecked();await page.keyboard.press('ArrowDown');raw.radioArrow=await page.locator('#root input[type=radio]:checked').evaluateAll(es=>es.map(e=>({name:e.name,value:e.value})));
  const label=locale==='en'?'Submit Certification':'Enviar certificación';const submit=page.getByRole('button',{name:label,exact:true});await expect(submit).toHaveCount(1);await submit.click();
  raw.blocked=await page.evaluate(()=>({submission:window.probe.submission||null,validation:window.probe.engine.getValidationReport({profile:'on-submit'})}));expect(raw.blocked.submission).toBeNull();expect(raw.blocked.validation.valid).toBe(false);
  raw.blockedAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  await page.evaluate(data=>window.probe.engine.loadResponseData(data),example.data);await submit.click();await page.waitForFunction(()=>Boolean(window.probe.submission));raw.completed=await page.evaluate(()=>window.probe.submission);expect(raw.completed.response.status).toBe('completed');expect(raw.completed.validationReport.valid).toBe(true);
  raw.completedFields=await page.evaluate(fields);raw.completedText=await page.locator('#root').innerText();raw.completedAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(raw.console).toEqual([]);expect(raw.errors).toEqual([]);
 }catch(e){raw.failure=String(e.stack||e);throw e;}finally{fs.writeFileSync(path.join(report,id+'.json'),JSON.stringify(raw,null,2)+'\n');await page.screenshot({path:path.join(report,id+'.png'),fullPage:true});}
});
