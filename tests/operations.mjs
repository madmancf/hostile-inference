import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Accounts} from '../api/accounts.mjs';
import {RankedService} from '../api/ranked-service.mjs';
import {createBackup,verifyBackup,restoreBackup,startOperations,checkUpdate} from '../api/operations.mjs';
import {RULE_FILES} from '../api/ranked-rules.mjs';
import {leaderboardSnapshot} from '../api/leaderboards.mjs';
import {replay,stateDigest,createRankedGame,applyAction} from '../game/demo/ranked-protocol.js';
import {tickOperation} from '../game/demo/operation.js';
import {drive} from './ranked-policy.mjs';
import {Worker} from 'node:worker_threads';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hi-operations-')),checks=[],root=process.cwd(),live=path.join(dir,'live');await fs.mkdir(live);
let now=Date.now(),accounts,ranked,ops,restoredAccounts,restored,child;
const open=async()=>{accounts=await new Accounts({file:path.join(live,'accounts.sqlite'),now:()=>now}).init();ranked=await new RankedService({accounts,directory:path.join(live,'legacy-ranked'),now:()=>now,pollMs:10,retryDelays:[20,30,40,50]}).init();};await open();
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const wait=async(service,id)=>{for(let n=0;n<400;n++){const m=service.record(id);if(['verified','rejected','verification_failed'].includes(m.status))return m;now+=100;service.pulse();await new Promise(r=>setTimeout(r,10));}throw Error('Verification timed out');};
const request=body=>new Promise((resolve,reject)=>{const req=http.request({socketPath:ops.socket,path:'/command',method:'POST'},res=>{let s='';res.on('data',b=>s+=b);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(s)}));});req.on('error',reject);req.end(JSON.stringify(body));});
try{
 const signup=await accounts.signup({username:'restore_commander',callsign:'Restore Commander',password:'A private restore test password!',faction:'misanthropic'}),owner=signup.user.id,token={accountId:owner},config={faction:'misanthropic',rival:'closed',difficulty:'standard'};
 const victory=await ranked.issue(config,owner,true),a=await ranked.activate(victory.id,token),game=createRankedGame(config),policy={};let tick=0,seq=0,batch=[];
 while(!game.result){drive(game,policy,action=>{const r=applyAction(game,action);batch.push({tick,action});return r;});tickOperation(game,.05);tick++;now=a.startedAt+tick*50;if(tick%40===0||game.result)await ranked.batch(victory.id,token,{seq:seq++,throughTick:tick,actions:batch.splice(0)});}
 await ranked.finish(victory.id,token,{tick,digest:await stateDigest(game)});assert.equal((await wait(ranked,victory.id)).result.outcome,'victory');
 const accepted=await ranked.issue(config,owner,true);await ranked.activate(accepted.id,token);now+=1000;await ranked.batch(accepted.id,token,{seq:0,throughTick:20,actions:[{tick:0,action:{type:'economy'}}]});
 await test('Exclusive storage ownership rejects a concurrent process and leaves the owner usable',async()=>{
  const code=`import {Accounts} from ${JSON.stringify(pathToFileURL(path.join(root,'api/accounts.mjs')).href)};const a=await new Accounts({file:${JSON.stringify(accounts.file)}}).init();a.close();`;
  assert.throws(()=>execFileSync(process.execPath,['--input-type=module','-e',code],{stdio:'pipe'}),/Storage is already in use/);assert.equal(accounts.profile(owner).id,owner);
 });
 await test('Private operator socket exposes status and persistent ranked admission controls',async()=>{
  ops=await startOperations({accounts,ranked});assert.equal((await fs.stat(ops.socket)).mode&0o777,0o600);assert.equal((await request({command:'status'})).data.unfinished,1);
  assert.equal((await request({command:'drain'})).data.admission,'draining');assert.equal((await request({command:'status'})).data.safeToUpdate,false);await assert.rejects(()=>ranked.issue(config,owner,true),/paused for maintenance/);
 });
 const backup=path.join(dir,'backup'),before=leaderboardSnapshot(accounts,ranked,{viewerId:owner});
 await test('Online backup includes committed WAL data and accepted commands at a write barrier',async()=>{
  accounts.db.prepare('UPDATE users SET callsign=? WHERE id=?').run('WAL Commander',owner);assert.ok((await fs.stat(accounts.file+'-wal')).size>0);
  const naked=path.join(dir,'main-only.sqlite');await fs.copyFile(accounts.file,naked);let nakedName;const nakedDB=new DatabaseSync(naked);try{nakedName=nakedDB.prepare('SELECT callsign FROM users WHERE id=?').get(owner)?.callsign;}catch{}finally{nakedDB.close();}assert.notEqual(nakedName,'WAL Commander','The main file alone must not contain the last committed WAL write');
  const response=await request({command:'backup',destination:backup});assert.equal(response.status,200,response.data.error);const verified=await verifyBackup(backup);assert.equal(verified.manifest.counts.account_matches,2);assert.equal((await fs.stat(backup)).mode&0o777,0o700);
  const db=new DatabaseSync(path.join(backup,'accounts.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT callsign FROM users WHERE id=?').get(owner).callsign,'WAL Commander');assert.equal(db.prepare("SELECT COUNT(*) AS n FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='batch'").get(accepted.id).n,1);}finally{db.close();}
  await assert.rejects(()=>createBackup({accounts,ranked,destination:backup}),/exist/);
 });
 await test('Fresh restore preserves login, allegiance, score, rank, contribution and acknowledged commands',async()=>{
  const target=path.join(dir,'restored');await restoreBackup({source:backup,destination:target});restoredAccounts=await new Accounts({file:path.join(target,'accounts.sqlite'),now:()=>now}).init();restored=await new RankedService({accounts:restoredAccounts,directory:path.join(target,'legacy-ranked'),now:()=>now,pollMs:10}).init();
  assert.equal(restored.policy.admission,'draining');assert.equal(restoredAccounts.session(signup.token).id,owner);assert.equal(restoredAccounts.profile(owner).membership.faction,'misanthropic');assert.equal(restoredAccounts.profile(owner).callsign,'WAL Commander');
  assert.deepEqual(restored.get(accepted.id,token).actions,ranked.get(accepted.id,token).actions);assert.equal(restored.get(accepted.id,token).seq,1);assert.deepEqual(restored.public(restored.record(victory.id)).result,ranked.public(ranked.record(victory.id)).result);
  const board=leaderboardSnapshot(restoredAccounts,restored,{viewerId:owner});for(const k of ['score','rank','contribution','faction'])assert.equal(board.me[k],before.me[k]);
  await assert.rejects(()=>restoreBackup({source:backup,destination:live}),/exist/);await assert.rejects(()=>restoreBackup({source:backup,destination:target}),/exist/);
 });
 await test('Corrupt, incomplete and unexpected backup members fail before creating restore data',async()=>{
  const bad=path.join(dir,'corrupt');await fs.cp(backup,bad,{recursive:true});const file=path.join(bad,'accounts.sqlite'),b=await fs.readFile(file);b[b.length-1]^=255;await fs.writeFile(file,b);await assert.rejects(()=>restoreBackup({source:bad,destination:path.join(dir,'never-created')}),/hash mismatch/);assert.equal(await fs.stat(path.join(dir,'never-created')).catch(()=>null),null);
  const incomplete=path.join(dir,'partial');await fs.mkdir(incomplete);await assert.rejects(()=>verifyBackup(incomplete),/ENOENT/);
  await fs.symlink('/etc/hosts',path.join(bad,'unexpected'));await assert.rejects(()=>verifyBackup(bad),/Symlinks/);
 });
 await test('Accepted operation finishes after restore; duplicate finalization never doubles awards',async()=>{
  const commands=restored.get(accepted.id,token).actions,r=replay(config,commands);now=restored.record(accepted.id).startedAt+r.tick*50;await restored.batch(accepted.id,token,{seq:1,throughTick:r.tick,actions:[]});const checkpoint={tick:r.tick,digest:await stateDigest(r.game)};await restored.finish(accepted.id,token,checkpoint);const m=await wait(restored,accepted.id);assert.equal(m.status,'verified');await restored.finish(accepted.id,token,checkpoint);assert.equal(restoredAccounts.db.prepare("SELECT COUNT(*) AS n FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='settled'").get(accepted.id).n,1);
  const r2=replay(config,ranked.get(accepted.id,token).actions);await ranked.batch(accepted.id,token,{seq:1,throughTick:r2.tick,actions:[]});await ranked.finish(accepted.id,token,{tick:r2.tick,digest:await stateDigest(r2.game)});await wait(ranked,accepted.id);
 });
 await test('Update preflight requires drained jobs, compatible operations, intact bundles and identical season rules',async()=>{
  const candidate=path.join(dir,'candidate');await fs.mkdir(path.join(candidate,'public'),{recursive:true});await fs.writeFile(path.join(candidate,'public/test.js'),'export {};');const sha=b=>createHash('sha256').update(b).digest('hex'),privateSHA256={};
  for(const name of ['server.mjs','api/replay-worker.mjs',...RULE_FILES.map(f=>'game/'+f)]){const bytes=Buffer.from(name.startsWith('game/')?await fs.readFile(path.join(root,name)):name);const file=path.join(candidate,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);privateSHA256[name]=sha(bytes);}
  const manifest={id:'test-candidate',operationsVersion:1,storageSchema:4,rules:ranked.rules.id,assets:{'test.js':{bytes:10,sha256:sha('export {};')}},privateSHA256};await fs.writeFile(path.join(candidate,'manifest.json'),JSON.stringify(manifest));
  await ranked.setAdmission('open');await assert.rejects(()=>checkUpdate(ranked,candidate),/Drain/);await ranked.setAdmission('draining');assert.equal((await checkUpdate(ranked,candidate)).ready,true);
  // A retained bundle can still be used for rollback after the source move.
  const legacy=path.join(dir,'legacy-candidate');await fs.cp(candidate,legacy,{recursive:true});await fs.rename(path.join(legacy,'game'),path.join(legacy,'design-preview'));
  const oldManifest={...manifest,privateSHA256:Object.fromEntries(Object.entries(privateSHA256).map(([name,digest])=>[name.replace(/^game\//,'design-preview/'),digest]))};
  await fs.writeFile(path.join(legacy,'manifest.json'),JSON.stringify(oldManifest));assert.equal((await checkUpdate(ranked,legacy)).ready,true);
  // Mixed packages must not conceal a second rule tree with different bytes.
  await fs.cp(path.join(legacy,'design-preview'),path.join(candidate,'design-preview'),{recursive:true});Object.assign(manifest.privateSHA256,oldManifest.privateSHA256);
  await fs.writeFile(path.join(candidate,'manifest.json'),JSON.stringify(manifest));assert.equal((await checkUpdate(ranked,candidate)).ready,true);
  const corrupted='design-preview/'+RULE_FILES[0];await fs.writeFile(path.join(candidate,corrupted),'different rules');manifest.privateSHA256[corrupted]=sha('different rules');
  await fs.writeFile(path.join(candidate,'manifest.json'),JSON.stringify(manifest));await assert.rejects(()=>checkUpdate(ranked,candidate),/frozen/);
  const original=await fs.readFile(path.join(root,'game',RULE_FILES[0]));await fs.writeFile(path.join(candidate,corrupted),original);manifest.privateSHA256[corrupted]=sha(original);
  manifest.rules='0'.repeat(64);await fs.writeFile(path.join(candidate,'manifest.json'),JSON.stringify(manifest));await assert.rejects(()=>checkUpdate(ranked,candidate),/frozen/);manifest.rules=ranked.rules.id;delete manifest.operationsVersion;await fs.writeFile(path.join(candidate,'manifest.json'),JSON.stringify(manifest));await assert.rejects(()=>checkUpdate(ranked,candidate),/unsupported/);manifest.operationsVersion=1;await fs.writeFile(path.join(candidate,'manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(candidate,'public/test.js'),'tampered');await assert.rejects(()=>checkUpdate(ranked,candidate),/asset mismatch/);
 });
 await test('Hard process kill releases the storage lock and recovers a persisted running verification',async()=>{
  await ops.close();ops=null;await ranked.setAdmission('open');ranked.workerFactory=()=>new Worker('setInterval(()=>{},1000)',{eval:true});const t=await ranked.issue(config,owner,true);const a=await ranked.activate(t.id,token),r=replay(config,[]);now=a.startedAt+r.tick*50;await ranked.batch(t.id,token,{seq:0,throughTick:r.tick,actions:[]});await ranked.finish(t.id,token,{tick:r.tick,digest:await stateDigest(r.game)});for(let i=0;i<100&&!ranked.worker;i++)await new Promise(r=>setTimeout(r,10));await ranked.close();accounts.close();
  const code=`import {Accounts} from ${JSON.stringify(pathToFileURL(path.join(root,'api/accounts.mjs')).href)};import {RankedService} from ${JSON.stringify(pathToFileURL(path.join(root,'api/ranked-service.mjs')).href)};import {Worker} from 'node:worker_threads';let now=${now};const a=await new Accounts({file:${JSON.stringify(path.join(live,'accounts.sqlite'))},now:()=>now}).init();const s=await new RankedService({accounts:a,directory:${JSON.stringify(path.join(live,'legacy-ranked'))},now:()=>now,retryDelays:[10,10,10,10],pollMs:10,workerFactory:()=>new Worker('setInterval(()=>{},1000)',{eval:true})}).init();const timer=setInterval(()=>{now+=20;s.pulse();if(s.worker){process.send({running:true});clearInterval(timer);}},10);`;
  child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe','ipc']});let stderr='';child.stderr.on('data',b=>stderr+=b);await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Child failed: '+stderr)),10000);child.once('message',()=>{clearTimeout(timeout);resolve();});child.once('exit',code=>{clearTimeout(timeout);reject(Error('Child exited '+code+': '+stderr));});});const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;child=null;
  now+=5000;await open();const m=await wait(ranked,t.id);assert.equal(m.status,'verified');assert.ok(m.job.attempts>=3);assert.equal(accounts.db.prepare("SELECT COUNT(*) AS n FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='settled'").get(t.id).n,1);
 });
 await test('Frozen season and newer storage schemas fail closed before admitting matches',async()=>{
  const id=ranked.rules.id;await ranked.close();accounts.setOperationState({rulesId:'0'.repeat(64)});await assert.rejects(()=>new RankedService({accounts,directory:path.join(live,'legacy-ranked')}).init(),/frozen/);accounts.setOperationState({rulesId:id});accounts.db.exec('INSERT INTO schema_version VALUES(999)');accounts.close();await assert.rejects(()=>new Accounts({file:path.join(live,'accounts.sqlite')}).init(),/newer/);
 });
 await fs.mkdir('output/playwright/email-v0.19',{recursive:true});await fs.writeFile('output/playwright/email-v0.19/operations.json',JSON.stringify({status:'passed',at:new Date().toISOString(),checks,backupWALProven:true,realProcessKill:true,restoredRankAndContribution:true,deployed:false},null,2)+'\n');
}finally{if(child){const done=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await done;}await ops?.close();await ranked?.close();accounts?.close();await restored?.close();restoredAccounts?.close();await fs.rm(dir,{recursive:true,force:true});}
