const output=process.env.HI_RANKED_OUTPUT||'output/playwright/ranked-current';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {RankedService,rankedHandler} from '../api/ranked-service.mjs';
import {createRankedGame,applyAction,validateAction,replay,stateDigest,FACTION_IDS} from '../design-preview/demo/ranked-protocol.js';
import {tickOperation} from '../design-preview/demo/operation.js';
import {drive} from './ranked-policy.mjs';

const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hi-ranked-check-'));let now=Date.now(),service=await new RankedService({directory,now:()=>now}).init(),server;
const checks=[],runs=[];const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const config={faction:'misanthropic',rival:'closed',difficulty:'standard'};
const ticket=async(c=config)=>{const t=await service.issue(c);return {...await service.activate(t.id,t.token),token:t.token};};
const wait=async t=>{for(let i=0;i<300;i++){const m=service.get(t.id,t.token);if(['verified','rejected','verification_failed'].includes(m.status))return m;await new Promise(r=>setTimeout(r,50));}throw Error('Verifier did not settle');};
try{
 await test('Strict command schema rejects state injection, nonfinite values, rival control and unknown actions',async()=>{
  for(const a of [{type:'deploy',role:'model',funds:9999},{type:'pause'},{type:'upgrade',kind:'grid'},{type:'order',ids:[1],kind:'move',target:{x:NaN,y:0}},{type:'order',ids:[1],kind:'move',target:{x:-2,y:0}},{type:'hold',ids:[1,1]}])assert.throws(()=>validateAction(a));
  const g=createRankedGame(config);assert.throws(()=>applyAction(g,{type:'hold',ids:[g.units.find(u=>u.team!=='player').id]}));
  assert.throws(()=>applyAction(g,{type:'project',id:'network-effects'}));
  await assert.rejects(()=>service.issue({...config,funds:9999}));await assert.rejects(()=>service.issue({...config,difficulty:'relaxed'}));
 });
 await test('Tickets are private, activate once, expire before use and never extend their deadline',async()=>{
  const t=await ticket();assert.throws(()=>service.get(t.id,'0'.repeat(64)));now+=500;assert.equal((await service.activate(t.id,t.token)).deadline,t.deadline);await service.abort(t.id,t.token);
  const e=await service.issue(config);now+=61000;await service.expire();await assert.rejects(()=>service.activate(e.id,e.token));
 });
 await test('Sealed command batches reject conflict, gaps, clock cheating and stale orders; identical retry is safe',async()=>{
  const t=await ticket();now+=1000;const b={seq:0,throughTick:20,actions:[{tick:0,action:{type:'economy'}}]};const a=await service.batch(t.id,t.token,b);assert.equal(a.seq,1);assert.equal((await service.batch(t.id,t.token,b)).duplicate,true);
  await assert.rejects(()=>service.batch(t.id,t.token,{...b,actions:[]}));await assert.rejects(()=>service.batch(t.id,t.token,{seq:2,throughTick:21,actions:[]}));await assert.rejects(()=>service.batch(t.id,t.token,{seq:1,throughTick:100,actions:[]}));
  now+=5000;await assert.rejects(()=>service.batch(t.id,t.token,{seq:1,throughTick:120,actions:[{tick:20,action:{type:'economy'}}]}));
  await assert.rejects(()=>service.finish(t.id,t.token,{tick:20,digest:'0'.repeat(64),score:10000}));await service.abort(t.id,t.token);
 });
 await test('HTTP boundary rejects cross-origin writes, missing access tokens and unsupported content',async()=>{
  let handler;server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')).catch(e=>{res.writeHead(500);res.end(e.message);}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;handler=rankedHandler(service,port);const base='http://127.0.0.1:'+port,headers={'X-HI-Client':'local-ranked-v1','Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/ranked/tickets',{method:'POST',headers:{...headers,Origin:'https://example.invalid'},body:JSON.stringify(config)})).status,403);
  assert.equal((await fetch(base+'/api/ranked/rules')).status,403);
  assert.equal((await fetch(base+'/api/ranked/tickets',{method:'POST',headers:{'X-HI-Client':'local-ranked-v1'},body:JSON.stringify(config)})).status,415);
  const t=await ticket();assert.equal((await fetch(base+'/api/ranked/matches/'+t.id,{headers})).status,404);const ok=await (await fetch(base+'/api/ranked/matches/'+t.id,{headers:{...headers,Authorization:'Bearer '+t.token}})).json();assert.equal(ok.tokenHash,undefined);assert.equal(ok.token,undefined);assert.equal(ok.actions,undefined);await service.abort(t.id,t.token);
 });
 for(const faction of FACTION_IDS)for(const rival of FACTION_IDS.filter(f=>f!==faction))await test('Complete verified operation '+faction+' vs '+rival,async()=>{
  const t=await ticket({faction,rival,difficulty:'standard'}),g=createRankedGame(t.config),policy={},all=[],batch=[];let tick=0,seq=0;
  while(!g.result){
   drive(g,policy,action=>{const r=applyAction(g,action),item={tick,action};all.push(item);batch.push(item);return r;});tickOperation(g,.05);tick++;now=t.startedAt+tick*50;
   if(tick%40===0||g.result){await service.batch(t.id,t.token,{seq:seq++,throughTick:tick,actions:batch.splice(0)});}
   if(tick===6000){const ack=service.get(t.id,t.token),restored=replay(t.config,ack.actions,tick);assert.equal(await stateDigest(g),await stateDigest(restored.game),'Acknowledged log restores exact canonical state');}
  }
  const digest=await stateDigest(g),checkpoint={tick,digest};await service.finish(t.id,t.token,checkpoint);const result=await wait(t);assert.equal(result.status,'verified',result.error);assert.equal(result.result.outcome,'victory');assert.equal(result.result.digest,digest);assert.equal(result.result.tick,tick);assert.equal(result.result.commands,all.length);
  const duplicate=await service.finish(t.id,t.token,checkpoint);assert.deepEqual(duplicate.result,result.result);await assert.rejects(()=>service.finish(t.id,t.token,{tick,digest:'0'.repeat(64)}));
  runs.push({id:t.id,token:t.token,faction,rival,tick,commands:all.length,...result.result});
 });
 await test('Forged terminal checkpoint cannot mint a result',async()=>{
  const t=await ticket();now+=1000;await service.batch(t.id,t.token,{seq:0,throughTick:20,actions:[]});await service.finish(t.id,t.token,{tick:20,digest:'0'.repeat(64)});const result=await wait(t);assert.equal(result.status,'rejected');assert.equal(result.result,null);
 });
 await test('Deadline resolves without browser finalization or a pause extension',async()=>{
  const t=await ticket();now=t.deadline+4001;await service.expire();const r=await wait(t);assert.equal(r.status,'verified');assert.notEqual(r.result.outcome,'victory');assert.equal(r.result.score,0);assert.ok(r.result.tick<=18000);
 });
 await test('A server restart retains immutable commands and verified results; rejects stale rules',async()=>{
  const t=await ticket();now+=1000;await service.batch(t.id,t.token,{seq:0,throughTick:20,actions:[{tick:0,action:{type:'economy'}}]});await service.close();service=await new RankedService({directory,now:()=>now}).init();const r=service.get(t.id,t.token);assert.equal(r.seq,1);assert.equal(r.actions.length,1);assert.equal(r.deadline,t.deadline);assert.equal(service.matches.size,1);assert.equal(runs.filter(m=>service.get(m.id,m.token).result?.outcome==='victory').length,6);
  const file=path.join(directory,t.id,'events.ndjson');await fs.appendFile(file,'{"partial":');await service.close();service=await new RankedService({directory,now:()=>now}).init();assert.equal(service.get(t.id,t.token).seq,1);assert.ok((await fs.readFile(file,'utf8')).endsWith('\n'));
  service.matches.get(t.id).rulesId='0'.repeat(64);await service.finish(t.id,t.token,{tick:20,digest:'0'.repeat(64)});const reject=await wait(t);assert.equal(reject.status,'verification_failed');assert.equal(service.record(t.id).job.lastFailure,'rules_unavailable');assert.equal(reject.result,null);
 });
 const report={status:'passed',checkedAt:new Date().toISOString(),scope:'Local service/worker and adversarial checks. Test clock is injected only in this test; no gameplay resource grants. Browser proofs are separate.',rulesId:service.rules.id,checks,runs:runs.map(({token,...run})=>run)};await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/service-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,runs:runs.length}));
}finally{if(server)await new Promise(r=>server.close(r));await service.close();await fs.rm(directory,{recursive:true,force:true});}
