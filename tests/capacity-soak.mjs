import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {seedHistory} from './history-fixture.mjs';
import {createRankedGame,applyAction,stateDigest} from '../game/demo/ranked-protocol.js';
import {tickOperation} from '../game/demo/operation.js';
import {drive} from './ranked-policy.mjs';
import {Accounts} from '../api/accounts.mjs';
import {RankedService} from '../api/ranked-service.mjs';
import {createBackup,restoreBackup} from '../api/operations.mjs';
import {leaderboardSnapshot,eligibleRows} from '../api/leaderboards.mjs';
const seconds=Number(process.env.HI_SOAK_SECONDS||1800),historyCount=Number(process.env.HI_SOAK_HISTORY||10000),smoke=seconds<1800;
const output=process.env.HI_SOAK_OUTPUT||'output/server-capacity-v0.20/'+(smoke?'smoke':'soak');await fs.mkdir(output,{recursive:true});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'hi-capacity-soak-')),live=path.join(root,'live');await fs.mkdir(live);
const sourceFiles=['api/accounts.mjs','api/ranked-service.mjs','api/leaderboards.mjs','api/operations.mjs','tests/capacity-server.mjs','tests/capacity-soak.mjs','tests/history-fixture.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));
const sourceSHA256=await hashes(),latencies={commands:[],history:[],boards:[],login:[],status:[]},samples=[],restarts=[],runs=[],receipts=[],startTimes=[];
let child,base,port,restarting,watching=false,verificationCrash=false,activeCrash=false,closing=false,log='',requestCount=0,duplicates=0,retries=0,nextLogin=0,nextRead=0,lastSample=0,lastProgress=0,sequence=0,terminalFailure;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{terminalFailure=Error('Test interrupted: '+signal);});
const pending=new Map(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),percentile=(a,p)=>a.length?[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]:0;
async function spawnServer(){
 const ready=performance.now();child=fork(new URL('./capacity-server.mjs',import.meta.url),[],{execArgv:['--expose-gc'],env:{...process.env,HI_CAPACITY_DATA:live,HI_CAPACITY_PORT:String(port||0)},stdio:['ignore','pipe','pipe','ipc']});
 child.stdout.on('data',b=>{log=(log+b).slice(-32768);});child.stderr.on('data',b=>{log=(log+b).slice(-32768);});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out: '+log)),30000);
  child.on('message',m=>{
   if(m.event==='ready'){clearTimeout(timer);base=m.base;port=new URL(base).port;startTimes.push({...m,memory:m.memory,wallMs:performance.now()-ready});resolve();}
   if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
   if(m.event==='worker-start'&&watching&&!verificationCrash){watching=false;verificationCrash=true;restarting=restartServer('running-verification').catch(e=>{terminalFailure=e;throw e;});restarting.catch(()=>{});}
   if(m.event==='error')terminalFailure=Error(m.message);
  });child.once('exit',code=>{clearTimeout(timer);if(!base)reject(Error('Server exited '+code+': '+log));});
 });
}
async function ipc(command){if(restarting)await restarting;const id=++sequence;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('IPC timed out: '+command));},10000);pending.set(id,m=>{clearTimeout(timeout);resolve(m);});child.send({id,command});});}
async function stopServer(hard=false){if(!child||child.exitCode!==null||child.signalCode)return;const target=child,done=new Promise(resolve=>target.once('exit',resolve));hard?target.kill('SIGKILL'):target.send({command:'close'});await done;}
async function restartServer(reason){
 const at=performance.now();await stopServer(true);
 const db=new DatabaseSync(path.join(live,'accounts.sqlite'),{readOnly:true});let running;
 try{running=db.prepare("SELECT COUNT(*) AS n FROM account_matches m WHERE status='verifying' AND json_extract((SELECT event FROM account_events e WHERE e.match_id=m.id AND json_extract(e.event,'$.type')='job' ORDER BY position DESC LIMIT 1),'$.job.state')='running'").get().n;}
 finally{db.close();}
 if(reason==='running-verification')assert.ok(running>0,'SIGKILL must interrupt a durably running verifier');
 await spawnServer();restarts.push({reason,runningJobsAtKill:running,downtimeMs:performance.now()-at});console.log(JSON.stringify({stage:'restart',...restarts.at(-1)}));
}
async function request(route,body,p,kind='status',expected=200){
 const started=performance.now();for(let attempt=0;attempt<25;attempt++){
  if(restarting)await restarting;if(terminalFailure)throw terminalFailure;
  try{const res=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-HI-Client':route.startsWith('/api/ranked')?'local-ranked-v1':route.startsWith('/api/account')?'local-accounts-v1':'local-leaderboards-v1','Content-Type':'application/json','X-Real-IP':p?.ip||'192.0.2.240',...(p?{Cookie:'hi_session='+p.token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
   const data=await res.json();if(res.status>=500){retries++;await sleep(100);continue;}assert.equal(res.status,expected,route+' '+JSON.stringify(data));if(p&&route==='/api/account/login'){const cookie=res.headers.get('set-cookie');assert.ok(cookie?.includes('hi_session='));p.token=cookie.match(/hi_session=([a-f0-9]+)/)[1];}requestCount++;latencies[kind]?.push(performance.now()-started);return data;
  }catch(e){if(e.name==='AssertionError')throw e;retries++;if(attempt===24)throw e;await sleep(100);}
 }
 throw Error('Request retry budget exhausted: '+route);
}
function historyFingerprint(db){const h=createHash('sha256');let rows=0;for(const row of db.prepare("SELECT id,ticket,status,result FROM account_matches WHERE issued_at<? ORDER BY id").iterate(agedCutoff)){h.update(JSON.stringify(row));rows++;}return {rows,sha256:h.digest('hex')};}
let players=[],fixture,agedCutoff=Date.now()-86400000,initialFingerprint;
async function openRun(p){const ticket=await request('/api/ranked/tickets',{config:p.config,confirmFaction:true},p,'status',201),active=await request('/api/ranked/matches/'+ticket.id+'/activate',{},p);const run={id:ticket.id,player:p,startedAt:active.startedAt,config:p.config,game:createRankedGame(p.config),policy:{},tick:0,seq:0,batch:[],actions:[],lastAckTick:0,lastAckSeq:0,started:Date.now(),nextPoll:0};runs.push(run);p.run=run;}
async function flush(run){if(run.tick===run.lastAckTick)return;const body={seq:run.seq,throughTick:run.tick,actions:run.batch.splice(0)},ack=await request('/api/ranked/matches/'+run.id+'/commands',body,run.player,'commands');assert.equal(ack.seq,run.seq+1);assert.equal(ack.throughTick,run.tick);run.actions.push(...body.actions);run.lastAckTick=run.tick;run.lastAckSeq=ack.seq;run.seq++;
 if(run.seq%31===0){const duplicate=await request('/api/ranked/matches/'+run.id+'/commands',body,run.player,'commands');assert.equal(duplicate.duplicate,true);duplicates++;}}
function advance(run){const target=Math.floor((Date.now()-run.startedAt)/50);while(run.tick<target&&!run.game.result){drive(run.game,run.policy,action=>{const value=applyAction(run.game,action);run.batch.push({tick:run.tick,action});return value;});tickOperation(run.game,.05);run.tick++;}}
async function step(p,admit){const r=p.run;if(!r){if(admit)await openRun(p);return;}
 if(!r.submitted){advance(r);if(r.tick-r.lastAckTick>=40||r.game.result)await flush(r);if(r.game.result){r.checkpoint={tick:r.tick,digest:await stateDigest(r.game)};r.finishAt=performance.now();await request('/api/ranked/matches/'+r.id+'/finish',r.checkpoint,p);r.submitted=true;}}
 if(r.submitted&&Date.now()>=r.nextPoll){r.nextPoll=Date.now()+1000;const m=await request('/api/ranked/matches/'+r.id,undefined,p);assert.ok(!['rejected','verification_failed'].includes(m.status),JSON.stringify(m));if(m.status==='verified'){assert.equal(m.result.outcome,'victory');assert.equal(m.result.digest,r.checkpoint.digest);r.result=m.result;r.verificationMs=performance.now()-r.finishAt;r.done=true;p.run=null;receipts.push({id:r.id,faction:p.config.faction,rival:p.config.rival,result:m.result,verificationMs:r.verificationMs});await request('/api/ranked/matches/'+r.id+'/finish',r.checkpoint,p);console.log(JSON.stringify({stage:'verified',faction:p.config.faction,score:m.result.score,completed:receipts.length}));}}
}
try{
 fixture=await seedHistory(live,historyCount);players=fixture.players;const db=new DatabaseSync(path.join(live,'accounts.sqlite'),{readOnly:true});try{initialFingerprint=historyFingerprint(db);}finally{db.close();}
 await spawnServer();const initial=await ipc('stats');assert.equal(initial.status.capacity.hotMatches,0);samples.push({elapsed:0,...initial});
 for(const p of players.slice(0,8))await openRun(p);
 await request('/api/ranked/tickets',{config:players[8].config,confirmFaction:true},players[8],'status',429);
 const started=performance.now(),deadline=started+seconds*1000;lastSample=started;nextRead=started;nextLogin=started+10000;lastProgress=started;
 while(performance.now()<deadline){
  if(terminalFailure)throw terminalFailure;const now=performance.now(),elapsed=(now-started)/1000;
  if(!activeCrash&&elapsed>=Math.min(180,seconds/3)){activeCrash=true;restarting=restartServer('active-commands');await restarting;restarting=null;for(const p of players.slice(0,8)){const r=p.run;if(!r)continue;const recovered=await request('/api/ranked/matches/'+r.id+'?log=1',undefined,p);assert.equal(recovered.seq,r.lastAckSeq);assert.deepEqual(recovered.actions,r.actions);}}
  if(!smoke&&!watching&&!verificationCrash&&elapsed>=240){await ipc('watch-worker');watching=true;}
  await Promise.all(players.slice(0,8).map(p=>step(p,true)));
  if(now>=nextRead){nextRead=now+1000;const p=players[Math.floor(elapsed)%8];await Promise.all([request('/api/leaderboards?faction='+p.config.faction,undefined,p,'boards'),request('/api/account/matches?offset='+((Math.floor(elapsed)%2)*25),undefined,p,'history')]);}
  if(now>=nextLogin){nextLogin=now+30000;const p=players[Math.floor(elapsed/30)%8];await request('/api/account/login',{username:p.username,password:p.password},p,'login');
  }
  if(now-lastSample>=10000){lastSample=now;const sample=await ipc('stats');assert.ok(sample.status.capacity.hotMatches<=8);assert.equal(sample.status.failedJobs,0);assert.equal(sample.status.metrics.persistenceErrors,0);samples.push({elapsed,...sample});}
  if(now-lastProgress>=60000){lastProgress=now;console.log(JSON.stringify({stage:'soak',elapsedSeconds:Math.round(elapsed),requests:requestCount,completed:receipts.length,hotMatches:samples.at(-1).status.capacity.hotMatches}));}
  await sleep(40);
 }
 const actualSeconds=(performance.now()-started)/1000;
 // End the timed workload cleanly; in-flight operations are explicitly abandoned,
 // never fabricated as wins. Every acknowledged batch is checked on disk below.
 for(const p of players.slice(0,8)){if(p.run&&!p.run.submitted){advance(p.run);await flush(p.run);await request('/api/ranked/matches/'+p.run.id+'/abort',{},p);p.run.done=true;p.run.aborted=true;p.run=null;}}
 for(let n=0;n<60&&players.some(p=>p.run);n++){await Promise.all(players.slice(0,8).map(p=>step(p,false)));await sleep(500);}assert.ok(players.every(p=>!p.run));
 const beforeBoards=[];for(const p of players.slice(0,8))beforeBoards.push(await request('/api/leaderboards?faction='+p.config.faction,undefined,p,'boards'));
 await stopServer();
 const accounts=await new Accounts({file:path.join(live,'accounts.sqlite')}).init();let ranked,restoredAccounts,restored;
 let backupReport;
 try{
  ranked=await new RankedService({accounts,directory:path.join(live,'legacy')}).init();assert.equal(ranked.matches.size,0);assert.deepEqual(historyFingerprint(accounts.db),initialFingerprint);
  for(const r of runs){const stored=ranked.get(r.id,{accountId:r.player.id});assert.deepEqual(stored.actions,r.actions);assert.equal(stored.seq,r.lastAckSeq);assert.equal(stored.throughTick,r.lastAckTick);const n=accounts.db.prepare("SELECT COUNT(*) AS n FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='settled'").get(r.id).n;assert.equal(n,r.aborted?0:1);if(r.result)assert.deepEqual(stored.result,r.result);assert.throws(()=>ranked.get(r.id,{accountId:players[8].id}),e=>e.status===404);}
  assert.ok(eligibleRows(accounts).length<=players.length*2,'Leaderboard cache must keep only best-per-rival rows');
  const beforeMemory=process.memoryUsage();const backup=await createBackup({accounts,ranked,destination:path.join(root,'backup')});await restoreBackup({source:path.join(root,'backup'),destination:path.join(root,'restored')});
  restoredAccounts=await new Accounts({file:path.join(root,'restored/accounts.sqlite')}).init();restored=await new RankedService({accounts:restoredAccounts,directory:path.join(root,'restored/legacy-ranked')}).init();assert.deepEqual(historyFingerprint(restoredAccounts.db),initialFingerprint);
  for(let i=0;i<8;i++){const p=players[i],board=leaderboardSnapshot(restoredAccounts,restored,{faction:p.config.faction,viewerId:p.id});assert.deepEqual(board.factions,beforeBoards[i].factions);assert.deepEqual(board.me,beforeBoards[i].me);assert.equal(restoredAccounts.session(p.token).id,p.id);}
  for(const r of runs)assert.deepEqual(restored.get(r.id,{accountId:r.player.id}).actions,r.actions);
  backupReport={restored:true,pausedAdmission:restored.policy.admission,counts:backup.counts,heapDeltaMiB:(process.memoryUsage().heapUsed-beforeMemory.heapUsed)/1048576};
 }finally{await restored?.close();restoredAccounts?.close();await ranked?.close();accounts.close();}
 if(!smoke){assert.equal(verificationCrash,true);assert.ok(actualSeconds>=1800);for(const f of ['misanthropic','closed','broke'])assert.ok(receipts.some(r=>r.faction===f));assert.ok(receipts.length>=16);assert.ok(latencies.commands.length>=6000);assert.ok(latencies.history.length>=1000);assert.ok(latencies.boards.length>=1000);assert.ok(latencies.login.length>=40);}
 const steady=samples.filter(s=>s.elapsed>=60),heap=steady.map(s=>s.memory.heapUsed),early=heap.slice(0,6),late=heap.slice(-6),heapDriftMiB=(percentile(late,.5)-percentile(early,.5))/1048576;
 const report={status:'passed',at:new Date().toISOString(),scope:smoke?'Short harness smoke only':'30-minute local real-time HTTP soak; production handlers, real clock, SQLite, replay workers and legal command streams. Synthetic aged history is not gameplay verification. No browser FPS or hosted capacity certification.',seconds:actualSeconds,admittedStreams:8,history:fixture.history,requests:requestCount,commandsAcknowledged:runs.reduce((n,r)=>n+r.lastAckSeq,0),duplicateRetries:duplicates,transportRetries:retries,completedRuns:receipts,abandonedAtTeardown:runs.filter(r=>r.aborted).length,restarts,startup:startTimes.map(({event,base,pid,...s})=>s),latency:Object.fromEntries(Object.entries(latencies).map(([k,a])=>[k,{count:a.length,p50Ms:percentile(a,.5),p95Ms:percentile(a,.95),p99Ms:percentile(a,.99),maxMs:a.length?Math.max(...a):0}])),memory:{initial:initial.memory,heapDriftMiB,peakRssMiB:Math.max(...samples.map(s=>s.memory.rss))/1048576,peakRetainedHeapMiB:Math.max(...samples.map(s=>s.memory.heapUsed))/1048576,peakSampledRawHeapMiB:Math.max(...samples.map(s=>(s.rawMemory||s.memory).heapUsed))/1048576,sampling:'Retained heap after explicit GC every ten seconds; raw heap and RSS sampled separately'},eventLoop:{p95Ms:percentile(samples.map(s=>s.eventLoopP95Ms),.95),maxMs:Math.max(...samples.map(s=>s.eventLoopMaxMs))},backup:backupReport,preservedHistoricalResults:initialFingerprint,sourceSHA256,fullGraphicsUnchanged:true,fpsCertified:false,deployed:false};
 assert.ok(report.latency.commands.p95Ms<250);assert.ok(report.latency.history.p95Ms<250);assert.ok(report.latency.boards.p95Ms<250);assert.ok(report.memory.peakRetainedHeapMiB<96);assert.ok(smoke||heapDriftMiB<12);assert.deepEqual(await hashes(),sourceSHA256,'Server/test sources changed during soak');
 await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await fs.writeFile(output+'/samples.json',JSON.stringify(samples,null,2)+'\n');console.log(JSON.stringify({stage:'passed',seconds:actualSeconds,requests:requestCount,completed:receipts.length,memory:report.memory,latency:report.latency}));
}catch(e){await fs.writeFile(output+'/failure.json',JSON.stringify({at:new Date().toISOString(),message:e.stack,log,lastSamples:samples.slice(-3),completed:receipts.length,sourceSHA256},null,2));throw e;}
finally{closing=true;await stopServer(true).catch(()=>{});await fs.rm(root,{recursive:true,force:true});await fs.writeFile(output+'/teardown.json',JSON.stringify({temporaryFixtureRemoved:true,ownedServerStopped:true,normalChromeLaunched:false,at:new Date().toISOString()},null,2));}
