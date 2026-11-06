// Diagnostic CPU/storage timings. This is not a graphics or 60 FPS certificate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import {createTutorial} from '../game/demo/tutorial.js';
import {spawn,deploy,compute} from '../game/demo/engine.js';
import {createOperation} from '../game/demo/operation.js';
import {LocalArchive,SAVE_KEY,TUTORIAL_SAVE_KEY} from '../game/demo/local-archive.js';
import {LocalArchive as OldArchive} from './fixtures/first-light/local-archive-v2.mjs';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const measure=async fn=>{const times=[];for(let i=0;i<35;i++){const start=performance.now();await fn();if(i>=5)times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {p50:times[14],p95:times[28],max:times[29]};};
const report={runtime:process.version,platform:process.platform,cpu:os.cpus()[0].model,graphicsChanged:false,fpsCertified:false,iterations:30,warmups:5,shapes:{}};
for(const shape of ['normal','maximum','near-envelope-limit']){
 const g=createTutorial('closed'),meta={runId:'timing',camera:{x:800,y:440,zoom:1.2},selected:[1]},archive=new LocalArchive(store());
 if(shape!=='normal'){
  g.funds=100000;for(let i=0;i<4;i++)assert.ok(deploy(g,'malware').ok);while(g.units.length<64)spawn(g,'researcher');for(const u of g.units)u.path=Array.from({length:100},()=>u.node);g.raids=Array.from({length:64},(_,id)=>({id:id+1,source:'closed',target:'broke',player:true,ids:[3],state:'staging',remaining:4}));g.nextRaid=65;g.events=Array.from({length:8},()=>({time:0,text:'x'.repeat(2000)}));compute(g);
 }
 assert.ok(archive.prepareCheckpoint(g,meta,'Defend preparation'),archive.error);assert.ok(archive.save(g,meta),archive.error);
 if(shape==='near-envelope-limit'){const used=archive.storage.getItem(TUTORIAL_SAVE_KEY).length;archive.legacyOriginal=JSON.stringify({syntheticBoundaryPadding:'x'.repeat(Math.max(0,590000-used-100))});assert.ok(archive.save(g,meta),archive.error);assert.ok(archive.storage.getItem(TUTORIAL_SAVE_KEY).length>589000);const oldBytes=archive.storage.getItem(TUTORIAL_SAVE_KEY);const original=archive.legacyOriginal;archive.legacyOriginal+='x'.repeat(20000);assert.equal(archive.save(g,meta),false);assert.equal(archive.errorCode,'HI_SAVE_TOO_LARGE');assert.equal(archive.storage.getItem(TUTORIAL_SAVE_KEY),oldBytes);archive.legacyOriginal=original;}
 const save=await measure(()=>assert.ok(archive.save(g,meta),archive.error)),prepare=await measure(()=>assert.ok(archive.prepareCheckpoint(g,meta,'Defend preparation'),archive.error)),restore=await measure(()=>assert.ok(archive.restoreCheckpoint(g,meta.runId),archive.error));
 report.shapes[shape]={characters:archive.storage.getItem(TUTORIAL_SAVE_KEY).length,save,prepare,restore};
}
const fixtures=JSON.parse(await fs.readFile(new URL('./fixtures/first-light/historical-saves.json',import.meta.url))),legacy=fixtures.fixtures.find(x=>x.name.includes('paid'))||fixtures.fixtures[0],s=store();s.setItem(SAVE_KEY,legacy.raw);const archive=new LocalArchive(s);
report.migration=await measure(()=>assert.ok(archive.load()));
// Compare the unchanged ordinary-operation save path, interleaved on the same CPU.
const operation=createOperation('closed'),old=new OldArchive(store()),current=new LocalArchive(store()),samples={base:[],candidate:[]};
for(let i=0;i<35;i++)for(const [name,owner]of [['base',old],['candidate',current]]){const start=performance.now();assert.ok(owner.save(operation));if(i>=5)samples[name].push(performance.now()-start);}
for(const a of Object.values(samples))a.sort((a,b)=>a-b);report.operationSave={baseP95:samples.base[28],candidateP95:samples.candidate[28]};report.operationSave.allowedP95=report.operationSave.baseP95+Math.max(2,report.operationSave.baseP95*.1);
report.operationSave.withinBudget=report.operationSave.candidateP95<=report.operationSave.allowedP95;
report.checkpointWithinBudget=Object.values(report.shapes).every(x=>x.prepare.p95<=16.67&&x.restore.p95<=16.67);
await fs.mkdir('output/playwright',{recursive:true});await fs.writeFile('output/playwright/first-light-profile.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
assert.ok(report.operationSave.withinBudget);assert.ok(report.checkpointWithinBudget);
