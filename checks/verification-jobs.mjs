import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {Accounts} from '../api/accounts.mjs';
import {RankedService} from '../api/ranked-service.mjs';
import {createRankedGame,applyAction,stateDigest,replay} from '../design-preview/demo/ranked-protocol.js';
import {tickOperation} from '../design-preview/demo/operation.js';
import {drive} from './ranked-policy.mjs';
import {leaderboardSnapshot} from '../api/leaderboards.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hi-durable-jobs-')),checks=[],victories=[];
let now=Date.now(),accounts,service;
const real=options=>new Worker(new URL('../api/replay-worker.mjs',import.meta.url),options);
const crash=()=>new Worker('process.exit(7)',{eval:true});
const hang=()=>new Worker('setInterval(()=>{},1000)',{eval:true});
const open=async()=>{accounts=await new Accounts({file:path.join(dir,'accounts.sqlite'),now:()=>now}).init();service=await new RankedService({accounts,directory:path.join(dir,'legacy'),now:()=>now,retryDelays:[30,60],pollMs:10,workerTimeout:3000}).init();};
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const wait=async(id,predicate=m=>['verified','rejected','verification_failed'].includes(m.status))=>{for(let n=0;n<600;n++){const m=service.record(id);if(predicate(m))return service.public(m);now+=50;service.pulse();await new Promise(r=>setTimeout(r,10));}throw Error('Job did not reach expected state: '+JSON.stringify(service.operationStatus()));};
const user=async faction=>(await accounts.signup({username:'jobs_'+faction,callsign:'Jobs '+faction,password:'Durable verifier test password!',faction})).user;
const key=t=>({accountId:service.record(t.id).ownerId});
const run=async(owner,{victory=false,digestOverride=null}={})=>{
 const config={faction:owner.membership.faction,rival:owner.membership.faction==='closed'?'broke':'closed',difficulty:'standard'},t=await service.issue(config,owner.id,true),active=await service.activate(t.id,key(t));
 let tick=0,seq=0,batch=[],game=createRankedGame(config),policy={};
 if(victory){while(!game.result){drive(game,policy,action=>{const value=applyAction(game,action);batch.push({tick,action});return value;});tickOperation(game,.05);tick++;now=active.startedAt+tick*50;if(tick%40===0||game.result)await service.batch(t.id,key(t),{seq:seq++,throughTick:tick,actions:batch.splice(0)});}}
 else{const r=replay(config,[]);tick=r.tick;game=r.game;now=active.startedAt+tick*50;await service.batch(t.id,key(t),{seq:0,throughTick:tick,actions:[]});}
 const checkpoint={tick,digest:digestOverride||await stateDigest(game)};await service.finish(t.id,key(t),checkpoint);return {t,checkpoint};
};
const settled=id=>accounts.db.prepare("SELECT COUNT(*) AS n FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='settled'").get(id).n;
await open();
try{
 const users={};for(const f of ['misanthropic','closed','broke'])users[f]=await user(f);
 await test('Worker crash retries a real Misanthropic victory and commits exactly once',async()=>{
  let attempts=0;service.workerFactory=o=>attempts++===0?crash():real(o);const {t,checkpoint}=await run(users.misanthropic,{victory:true}),m=await wait(t.id);assert.equal(m.status,'verified');assert.equal(m.result.outcome,'victory');assert.equal(m.verification.attempts,2);assert.equal(settled(t.id),1);assert.deepEqual((await service.finish(t.id,key(t),checkpoint)).result,m.result);victories.push({faction:'misanthropic',...m.result,attempts:2});
 });
 await test('Temporary settlement failure automatically recovers a Closed AI victory without restart',async()=>{
  service.workerFactory=real;const original=accounts.appendMatch.bind(accounts);let failures=0;accounts.appendMatch=(m,e)=>{if(e.type==='settled'&&!failures++)throw Error('Injected disk write failure');return original(m,e);};
  try{const {t}=await run(users.closed,{victory:true}),m=await wait(t.id);assert.equal(m.status,'verified');assert.equal(m.result.outcome,'victory');assert.equal(settled(t.id),1);assert.ok(m.verification.attempts>=2);victories.push({faction:'closed',...m.result,attempts:m.verification.attempts});}finally{accounts.appendMatch=original;}
 });
 await test('Commit then lost acknowledgement cannot duplicate or replace a Broke Labs victory',async()=>{
  const original=accounts.appendMatch.bind(accounts);let failures=0;accounts.appendMatch=(m,e)=>{const result=original(m,e);if(e.type==='settled'&&!failures++)throw Error('Injected failure after commit');return result;};
  try{const {t,checkpoint}=await run(users.broke,{victory:true}),m=await wait(t.id);assert.equal(m.status,'verified');assert.equal(m.result.outcome,'victory');assert.equal(settled(t.id),1);const board=leaderboardSnapshot(accounts,service,{viewerId:users.broke.id});await service.finish(t.id,key(t),checkpoint);assert.equal(leaderboardSnapshot(accounts,service,{viewerId:users.broke.id}).me.contribution,board.me.contribution);victories.push({faction:'broke',...m.result,attempts:m.verification.attempts});}finally{accounts.appendMatch=original;}
 });
 await test('Running job and accepted command log survive server termination',async()=>{
  service.workerFactory=hang;const {t}=await run(users.closed);await wait(t.id,m=>m.job?.state==='running');const before=service.get(t.id,key(t)).actions;await service.close();accounts.close();await open();const m=await wait(t.id);assert.equal(m.status,'verified');assert.equal(settled(t.id),1);assert.deepEqual(service.get(t.id,key(t)).actions,before);assert.equal(m.verification.attempts,2);
 });
 await test('Repeated crashes reach durable operator-attention state, then targeted retry works',async()=>{
  service.workerFactory=crash;const {t}=await run(users.closed),m=await wait(t.id);assert.equal(m.status,'verification_failed');assert.equal(m.error,null);assert.equal(m.result,null);assert.equal(m.verification.attempts,3);assert.equal(settled(t.id),0);assert.equal(service.operationStatus().failedJobs,1);assert.match(m.verification.message,/orders are safe/);
  await service.close();accounts.close();await open();assert.equal(service.record(t.id).status,'verification_failed');await service.retryJob(t.id);const fixed=await wait(t.id);assert.equal(fixed.status,'verified');assert.equal(settled(t.id),1);await assert.rejects(()=>service.retryJob(t.id),/Only failed/);
 });
 await test('Verifier timeout is a retryable server failure, never an invalid replay',async()=>{
  service.workerTimeout=50;let attempts=0;service.workerFactory=o=>attempts++===0?hang():real(o);const {t}=await run(users.closed);await wait(t.id,m=>m.job?.lastFailure==='worker_timeout');service.workerTimeout=3000;const m=await wait(t.id);assert.equal(m.status,'verified');assert.equal(settled(t.id),1);
 });
 await test('Forged replay is rejected once and never gains leaderboard points',async()=>{
  service.workerFactory=real;const before=leaderboardSnapshot(accounts,service,{viewerId:users.closed.id}).me.contribution,{t}=await run(users.closed,{digestOverride:'0'.repeat(64)}),m=await wait(t.id);assert.equal(m.status,'rejected');assert.match(m.error,/disagree/);assert.equal(m.result,null);assert.equal(m.verification.attempts,1);assert.equal(settled(t.id),1);assert.equal(leaderboardSnapshot(accounts,service,{viewerId:users.closed.id}).me.contribution,before);
 });
 await test('Drain persists, refuses new starts, and lets an admitted run activate and finish',async()=>{
  const c={faction:'closed',rival:'broke',difficulty:'standard'},t=await service.issue(c,users.closed.id,true);await service.setAdmission('draining');await assert.rejects(()=>service.issue(c,users.misanthropic.id,true),/paused for maintenance/);assert.equal(service.operationStatus().safeToUpdate,false);
  const active=await service.activate(t.id,key(t)),r=replay(c,[]);now=active.startedAt+r.tick*50;await service.batch(t.id,key(t),{seq:0,throughTick:r.tick,actions:[]});await service.finish(t.id,key(t),{tick:r.tick,digest:await stateDigest(r.game)});await wait(t.id);assert.equal(service.operationStatus().safeToUpdate,true);
  await service.close();accounts.close();await open();assert.equal(service.policy.admission,'draining');assert.equal(service.operationStatus().safeToUpdate,true);await service.setAdmission('open');
 });
 await fs.mkdir('output/playwright/operations-v0.17',{recursive:true});await fs.writeFile('output/playwright/operations-v0.17/jobs.json',JSON.stringify({status:'passed',at:new Date().toISOString(),rules:service.rules.id,checks,victories,clock:'Injected test clock; real simulation, SQLite and worker processes. No graphics involved.'},null,2)+'\n');
}finally{await service.close();accounts.close();await fs.rm(dir,{recursive:true,force:true});}
