import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const report='/Users/mikewolfd/Work/formspec-stack/thoughts/plans/benefits-scenarios/execution/reports/formspec-web/renderer-measure/targeted-01';
fs.mkdirSync(report,{recursive:true});
const example=JSON.parse(fs.readFileSync(new URL('./inputs/nj-example.response.json',import.meta.url)));
const claimant=JSON.parse(fs.readFileSync(new URL('./inputs/claimant.json',import.meta.url)));
const artifacts=['form-v2.definition.json','form-v2.theme.json','form-v2.response-actions.json','form-v2.en.locale.json','form-v2.es.locale.json','weekly-certification.registry.json'];
for(const arm of ['react','wc']) test(`${arm}-host-fidelity`,async({page})=>{
 const raw={arm,errors:[],console:[],sourceResponses:[]};page.on('pageerror',e=>raw.errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))raw.console.push(m.text());});
 page.on('response',async r=>{if(r.url().includes('/data/claimant.json'))raw.sourceResponses.push({url:r.url(),status:r.status(),body:await r.text()});});
 try {
  await page.goto(`http://127.0.0.1:5187/?arm=${arm}&case=nj&locale=en&actionHost=explicit`);
  await page.waitForFunction(()=>window.probe?.status!=='loading');
  raw.mount=await page.evaluate(()=>({status:window.probe.status,error:window.probe.error,claimant:window.probe.engine?.instanceData.claimant}));
  expect(raw.mount.status).toBe('mounted');expect(raw.mount.claimant).toEqual(claimant);
  raw.artifacts=await page.evaluate(async names=>Object.fromEntries(await Promise.all(names.map(async name=>[name,await(await fetch('/inputs/'+name)).json()]))),artifacts);
  for(const name of artifacts)expect(raw.artifacts[name]).toEqual(JSON.parse(fs.readFileSync(new URL('./inputs/'+name,import.meta.url))));
  const submit=page.getByRole('button',{name:'Submit Certification',exact:true});await expect(submit).toHaveCount(1);
  await submit.click();raw.invalid=await page.evaluate(()=>({submission:window.probe.submission||null,report:window.probe.engine.getValidationReport({profile:'on-submit'}),actionResult:window.probe.actionResult||null}));
  expect(raw.invalid.submission).toBeNull();expect(raw.invalid.report.valid).toBe(false);
  await page.evaluate(data=>window.probe.engine.loadResponseData(data),example.data);
  await submit.click();await page.waitForFunction(()=>Boolean(window.probe.submission));
  raw.valid=await page.evaluate(()=>({submission:window.probe.submission,report:window.probe.engine.getValidationReport({profile:'on-submit'})}));
  expect(raw.valid.report.valid).toBe(true);expect(raw.valid.submission.response.status).toBe('completed');
  raw.visibleFields=await page.locator('#root [data-name]').evaluateAll(es=>es.filter(e=>{for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||p.hidden)return false;}return e.getClientRects().length>0&&[...e.querySelectorAll('input,select,textarea')].some(i=>i.closest('[data-name]')===e);}).map(e=>e.getAttribute('data-name')));
 }catch(e){raw.failure=String(e.stack||e);throw e;}finally{fs.writeFileSync(path.join(report,arm+'.json'),JSON.stringify(raw,null,2)+'\n');await page.screenshot({path:path.join(report,arm+'.png'),fullPage:true});}
});
