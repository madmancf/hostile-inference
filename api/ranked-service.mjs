import {clientSource} from './client-source.mjs';
import {allowedRequest} from './http-policy.mjs';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {PROTOCOL,MAX_TICKS,MAX_ACTIONS,MAX_BATCH_ACTIONS,validateConfig,validateAction,exact,integer} from '../design-preview/demo/ranked-protocol.js';
import {rulesManifest,defaultDataDirectory} from './ranked-rules.mjs';
import {cookieToken,ACCOUNT_VERSION,SEASON} from './accounts.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e;};
const finished=new Set(['verified','rejected','aborted','verification_failed']);
const terminal=new Set(['verified','rejected','aborted']);
const BACKOFF=[1000,3000,10000,30000];
export class RankedService {
 constructor({directory=defaultDataDirectory,now=()=>Date.now(),accounts=null,releaseId='preview',workerFactory=(options)=>new Worker(new URL('./replay-worker.mjs',import.meta.url),options),retryDelays=BACKOFF,workerTimeout=15000,pollMs=1000,maxConcurrent=8,maxStartsPerHour=60}={}){
  if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>64||!Number.isSafeInteger(maxStartsPerHour)||maxStartsPerHour<1||maxStartsPerHour>3600)throw Error('Invalid ranked capacity limits');
  Object.assign(this,{directory,now,accounts,releaseId,workerFactory,retryDelays,workerTimeout,pollMs,maxConcurrent,maxStartsPerHour});this.matches=new Map();this.legacyFailed=new Map();this.locks=new Map();this.queue=[];this.worker=null;this.closed=false;this.recentStarts=[];this.metrics={workerFailures:0,persistenceErrors:0,retries:0};this.blockedUntil=0;
 }
 async init(){
  this.rules=await rulesManifest();await fs.mkdir(this.directory,{recursive:true,mode:0o700});
  const stored=this.accounts?.operationState()||{};this.policy=Object.fromEntries(['admission','season','rulesId','changedAt'].filter(k=>k in stored).map(k=>[k,stored[k]]));
  if(this.policy.season&&this.policy.season!==SEASON)throw Error('Stored season is incompatible; a season transition requires an explicit migration');
  if(this.policy.rulesId&&this.policy.rulesId!==this.rules.id)throw Error('Season rules are frozen. This release is incompatible with the stored season; do not update or reconnect using different rules.');
  this.policy={admission:'open',season:SEASON,rulesId:this.rules.id,...this.policy};
  for(const entry of await fs.readdir(this.directory)){
   if(!/^[a-f0-9-]{36}$/.test(entry))continue;
   const dir=path.join(this.directory,entry);
   try{
    const m=JSON.parse(await fs.readFile(path.join(dir,'ticket.json'),'utf8'));m.actions=[];m.batches=[];m.status='issued';m.throughTick=0;m.seq=0;
    let journal='';try{journal=await fs.readFile(path.join(dir,'events.ndjson'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    // A crash may leave only the final append incomplete. Never acknowledge it.
    const complete=journal.slice(0,journal.lastIndexOf('\n')+1);if(complete!==journal)await fs.truncate(path.join(dir,'events.ndjson'),Buffer.byteLength(complete));
    for(const line of complete.split('\n').filter(Boolean))this.reduce(m,JSON.parse(line));
    if(m.issuedAt>this.now()-3600000)this.recentStarts.push(m.issuedAt);
    this.retain(m);
   }catch(e){throw Error('Ranked journal unavailable: '+entry,{cause:e});}
  }
  if(this.accounts)for(const {ticket,events} of this.accounts.loadMatches()){
   const m={...ticket,actions:[],batches:[],status:'issued',throughTick:0,seq:0};for(const e of events)this.reduce(m,e);this.matches.set(m.id,m);
  }
  for(const m of this.matches.values())if(!terminal.has(m.status)&&m.rulesId!==this.rules.id)throw Error('Accepted runs require their original rules; restore the compatible release before starting this server');
  this.accounts?.setOperationState(this.policy);
  // Recover the durable intent, not the discarded process queue. A running
  // attempt belongs to the dead process and counts toward the bounded budget.
  for(const m of this.matches.values())if(m.status==='verifying'&&m.job?.state==='running')await this.retryFailure(m,'server_restart');
  this.timer=setInterval(()=>this.pulse(),this.pollMs);this.timer.unref();await this.expire();this.drain();return this;
 }
 locked(id,fn){if(this.freeze)return this.freeze.then(()=>this.locked(id,fn));const next=(this.locks.get(id)||Promise.resolve()).catch(()=>{}).then(fn);this.locks.set(id,next);return next.finally(()=>{if(this.locks.get(id)===next)this.locks.delete(id);});}
 reduce(m,e,commands=true){
  if(terminal.has(m.status))return; // A later retry can never replace a committed terminal event.
  if(commands&&e.eventId){m.eventIds??=new Set();if(m.eventIds.has(e.eventId))return;m.eventIds.add(e.eventId);}
  if(e.type==='active'){m.status='active';m.startedAt=e.at;m.deadline=e.at+900000;}
  if(e.type==='batch'){if(commands){m.batches.push(e);m.actions.push(...e.body.actions);}m.seq=e.body.seq+1;m.throughTick=e.body.throughTick;}
  if(e.type==='submit'){m.status='verifying';m.checkpoint=e.checkpoint;m.submittedAt=e.at;m.job={state:'queued',attempts:0,nextAttemptAt:e.at};}
  if(e.type==='job'){m.job=e.job;m.status=e.job.state==='failed'?'verification_failed':'verifying';}
  if(e.type==='settled'){m.status=e.ok?'verified':'rejected';m.result=e.result||null;m.error=e.error||null;m.settledAt=e.at;m.job={...m.job,state:'complete'};}
  if(e.type==='abort'){m.status='aborted';m.error=e.reason;}
 }
 async append(m,e){e={eventId:e.type==='settled'?'settled:'+m.id:randomUUID(),...e};if(m.ownerId)e=this.accounts.appendMatch(m,e);else{const file=await fs.open(path.join(this.directory,m.id,'events.ndjson'),'a',0o600);try{await file.writeFile(JSON.stringify(e)+'\n');await file.sync();}finally{await file.close();}}this.reduce(m,e);this.retain(m);}
 public(m){return {id:m.id,protocol:PROTOCOL,accountOwned:!!m.ownerId,rulesId:m.rulesId,config:m.config,status:m.status,issuedAt:m.issuedAt,activateBy:m.activateBy,startedAt:m.startedAt??null,deadline:m.deadline??null,serverNow:this.now(),seq:m.seq,throughTick:m.throughTick,result:m.result??null,error:m.error??null,settledAt:m.settledAt??null,verification:m.job?{state:m.job.state,attempts:m.job.attempts,nextAttemptAt:m.job.nextAttemptAt??null,message:this.jobMessage(m)}:null};}
 // The live map holds admitted work only. Cold reads do not populate it.
 retain(m){
  if(finished.has(m.status)){this.matches.delete(m.id);if(!m.ownerId&&m.status==='verification_failed')this.legacyFailed.set(m.id,this.summary(m));else this.legacyFailed.delete(m.id);}
  else{this.matches.set(m.id,m);this.legacyFailed.delete(m.id);}
 }
 summary(m){const {actions,batches,eventIds,...summary}=m;return summary;}
 legacyRecord(id,commands=false){
  if(!/^[a-f0-9-]{36}$/.test(id))return null;
  let ticket;try{ticket=JSON.parse(readFileSync(path.join(this.directory,id,'ticket.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
  const m={...ticket,status:'issued',throughTick:0,seq:0,...(commands?{actions:[],batches:[]}: {})};
  let journal='';try{journal=readFileSync(path.join(this.directory,id,'events.ndjson'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const line of journal.slice(0,journal.lastIndexOf('\n')+1).split('\n').filter(Boolean))this.reduce(m,JSON.parse(line),commands);
  return m;
 }
 record(id){return this.matches.get(id)||this.accounts?.matchRecord(id)||this.legacyFailed.get(id)||this.legacyRecord(id);}
 owned(id,token){const m=this.record(id);if(m?.ownerId){if(!token?.accountId||token.accountId!==m.ownerId)fail(404,'Match unavailable');}else if(!m||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(m.tokenHash,'hex'),Buffer.from(hash(token),'hex')))fail(404,'Match unavailable');return m;}
 commands(m){return m.actions||(m.ownerId?this.accounts.matchCommands(m.id):this.legacyRecord(m.id,true).actions);}
 failed(){const stored=this.accounts?.failedMatches()||{count:0,rows:[]};return {count:stored.count+this.legacyFailed.size,rows:[...stored.rows,...this.legacyFailed.values()].slice(0,100)};}

 async issue(config,ownerId=null,confirmFaction=false){
  validateConfig(config);return this.locked('issue',async()=>{
   if(this.closed||this.policy.admission!=='open')fail(503,'Ranked starts are temporarily paused for maintenance. Existing operations can finish; practice remains available.');
   this.recentStarts=this.recentStarts.filter(t=>this.now()-t<3600000);
   const starts=(this.accounts?.recentMatchStarts(this.now()-3600000)||0)+this.recentStarts.length;
   if(starts>=this.maxStartsPerHour||this.matches.size+this.failed().count>=this.maxConcurrent)fail(429,'All '+this.maxConcurrent+' ranked places are in use or the hourly start budget is full. Retry later; practice remains available.');
   const token=ownerId?null:randomBytes(32).toString('hex'),m={id:randomUUID(),...(ownerId?{ownerId}:{tokenHash:hash(token)}),rulesId:this.rules.id,config:structuredClone(config),issuedAt:this.now(),activateBy:this.now()+60000};
   if(ownerId){if(!this.accounts)fail(503,'Account storage unavailable');this.accounts.issueMatch(m,confirmFaction);}else{const dir=path.join(this.directory,m.id);await fs.mkdir(dir,{mode:0o700});await fs.writeFile(path.join(dir,'ticket.json'),JSON.stringify(m),{flag:'wx',mode:0o600});}
   Object.assign(m,{status:'issued',actions:[],batches:[],seq:0,throughTick:0});this.matches.set(m.id,m);if(!ownerId)this.recentStarts.push(this.now());return {...this.public(m),...(token?{token}:{})};
  });
 }
 async activate(id,token){return this.locked(id,async()=>{const m=this.owned(id,token);if(m.status==='active')return this.public(m);if(m.status!=='issued'||this.now()>m.activateBy)fail(409,'Ticket expired or already settled');if(m.rulesId!==this.rules.id)fail(409,'Rules version unavailable');await this.append(m,{type:'active',at:this.now()});return this.public(m);});}
 async batch(id,token,body){return this.locked(id,async()=>{
  const m=this.owned(id,token);exact(body,['seq','throughTick','actions']);integer(body.seq,0,1999);integer(body.throughTick,1,MAX_TICKS);
  if(!Array.isArray(body.actions)||body.actions.length>MAX_BATCH_ACTIONS)fail(400,'Batch command limit');
  const digest=hash(stable(body)),old=m.batches?m.batches[body.seq]:(m.ownerId?this.accounts.matchBatch(m.id,body.seq):this.legacyRecord(m.id,true)?.batches[body.seq]);if(old){if(old.digest!==digest)fail(409,'Conflicting retry');return {...this.public(m),duplicate:true};}
  if(m.status!=='active'||this.now()>m.deadline+4000)fail(409,'Match is not accepting commands');
  if(body.seq!==m.seq||body.throughTick<=m.throughTick)fail(409,'Sequence or sealed-tick conflict');
  const elapsed=Math.floor((this.now()-m.startedAt)/50);if(body.throughTick>Math.min(MAX_TICKS,elapsed+4))fail(409,'Future ticks');
  if(m.actions.length+body.actions.length>MAX_ACTIONS)fail(413,'Match command limit');
  let previous=m.throughTick;
  for(const item of body.actions){exact(item,['tick','action']);integer(item.tick,m.throughTick,body.throughTick-1);if(item.tick<previous||item.tick<elapsed-80||item.tick>elapsed+4)fail(409,'Stale, future or unordered command');previous=item.tick;validateAction(item.action);}
  await this.append(m,{type:'batch',at:this.now(),digest,body:structuredClone(body)});return this.public(m);
 });}
 async finish(id,token,checkpoint){return this.locked(id,async()=>{
  const m=this.owned(id,token);exact(checkpoint,['tick','digest']);integer(checkpoint.tick,1,MAX_TICKS);if(typeof checkpoint.digest!=='string'||!/^[a-f0-9]{64}$/.test(checkpoint.digest))fail(400,'Invalid state digest');
  if(m.checkpoint){if(stable(m.checkpoint)!==stable(checkpoint))fail(409,'Conflicting finalization');return this.public(m);}
  if(m.status!=='active')fail(409,'Match is not active');
  if(checkpoint.tick!==m.throughTick||checkpoint.tick>Math.floor((this.now()-m.startedAt)/50)+4)fail(409,'Finish is not fully acknowledged');
  await this.append(m,{type:'submit',at:this.now(),checkpoint:structuredClone(checkpoint)});this.enqueue(m);return this.public(m);
 });}
 async abort(id,token){return this.locked(id,async()=>{const m=this.owned(id,token);if(!finished.has(m.status)&&m.status!=='verifying')await this.append(m,{type:'abort',at:this.now(),reason:'Run abandoned by its local owner'});return this.public(m);});}
 get(id,token){const m=this.owned(id,token);return {...this.public(m),actions:this.commands(m)};}
 async expire(){for(const m of this.matches.values()){
  if(m.status==='issued'&&this.now()>m.activateBy)await this.locked(m.id,async()=>{if(m.status==='issued')await this.append(m,{type:'abort',at:this.now(),reason:'Unstarted ticket expired'});});
  if(m.status==='active'&&this.now()>m.deadline+4000)await this.locked(m.id,async()=>{if(m.status==='active'){await this.append(m,{type:'submit',at:this.now(),checkpoint:null});this.enqueue(m);}});
 }}
 jobMessage(m){if(m.job?.state==='complete')return null;return m.job?.state==='failed'?'Verification is delayed by a server problem. Your accepted orders are safe; check your account later.':m.job?.state==='retry_wait'?'Your accepted orders are safe. The server will retry verification automatically.':'Your result is queued for server verification. You can leave this page.';}
 enqueue(){this.drain();}
 pulse(){if(this.closed||this.freeze)return;this.expire().catch(e=>this.logFailure('expiry',e));this.drain();}
 logFailure(kind,error){if(kind==='persistence')this.metrics.persistenceErrors++;console.error(JSON.stringify({event:'verification_'+kind,at:this.now(),message:error?.message||String(error)}));}
 async retryFailure(m,code){
  if(terminal.has(m.status))return;
  const attempts=m.job?.attempts||0,failed=code==='rules_unavailable'||attempts>=this.retryDelays.length+1;
  await this.append(m,{type:'job',at:this.now(),job:{state:failed?'failed':'retry_wait',attempts,nextAttemptAt:failed?null:this.now()+(this.retryDelays[Math.max(0,attempts-1)]||1000),lastFailure:code}});
  if(!failed)this.metrics.retries++;
 }
 drain(){
  if(this.worker||this.draining||this.closed||this.freeze||this.now()<this.blockedUntil)return;
  const pending=[...this.matches.values()].filter(m=>m.status==='verifying'&&(m.job?.nextAttemptAt??0)<=this.now()).sort((a,b)=>a.submittedAt-b.submittedAt||a.id.localeCompare(b.id));
  this.queue=pending.map(m=>m.id);const m=pending[0];if(!m)return;
  this.draining=true;
  this.locked(m.id,async()=>{
   if(this.closed||m.status!=='verifying')return;
   if((m.job?.attempts||0)>=this.retryDelays.length+1){await this.retryFailure(m,'attempt_limit');return;}
   const attempt=(m.job?.attempts||0)+1;
   await this.append(m,{type:'job',at:this.now(),job:{state:'running',attempts:attempt,nextAttemptAt:this.now()+this.workerTimeout+1000}});
   if(this.closed||m.status!=='verifying')return; // An ambiguous previous commit was recovered.
   let worker,timer,done=false;
   const settle=async result=>{
    if(done)return;done=true;clearTimeout(timer);try{await worker?.terminate();}catch{}
    try{if(!this.closed)await this.locked(m.id,async()=>{
     if(result.ok===true||result.kind==='invalid')await this.append(m,{type:'settled',at:this.now(),ok:result.ok===true,...(result.ok?{result:result.result}:{error:result.error})});
     else{this.metrics.workerFailures++;await this.retryFailure(m,result.code||'worker_failure');}
    });}catch(e){this.logFailure('persistence',e);this.blockedUntil=this.now()+1000;
     try{if(!this.closed)await this.locked(m.id,()=>this.retryFailure(m,'storage_write'));}catch(error){this.logFailure('persistence',error);}
     // The persisted running lease remains recoverable even when storage cannot
     // record the failure. Retry from that lease on the next scheduler pass.
    }finally{this.worker=null;this.drain();}
   };
   try{worker=this.workerFactory({workerData:{config:m.config,rulesId:m.rulesId,actions:m.actions,checkpoint:m.checkpoint},resourceLimits:{maxOldGenerationSizeMb:128}});this.worker=worker;
    timer=setTimeout(()=>settle({ok:false,kind:'infrastructure',code:'worker_timeout'}),this.workerTimeout);
    worker.once('message',result=>settle(result&&typeof result==='object'?result:{ok:false,kind:'infrastructure',code:'worker_protocol'}));worker.once('error',()=>settle({ok:false,kind:'infrastructure',code:'worker_crash'}));worker.once('exit',()=>{if(!done)settle({ok:false,kind:'infrastructure',code:'worker_exit'});});
   }catch{queueMicrotask(()=>settle({ok:false,kind:'infrastructure',code:'worker_start'}));}
  }).catch(e=>{this.logFailure('persistence',e);this.blockedUntil=this.now()+1000;}).finally(()=>{this.draining=false;});
 }
 async retryJob(id){return this.locked(id,async()=>{let m=this.record(id);if(!m||m.status!=='verification_failed')fail(409,'Only failed verification jobs can be retried');
  // Rehydrate just this failed job; other dormant journals remain on disk.
  if(m.ownerId){const restored={...m,actions:[],batches:[],eventIds:new Set(),status:'issued',seq:0,throughTick:0};for(const e of this.accounts.matchEvents(id))this.reduce(restored,e);m=restored;}else m=this.legacyRecord(id,true);
  await this.append(m,{type:'job',at:this.now(),job:{state:'queued',attempts:0,nextAttemptAt:this.now(),operatorRetry:true}});this.drain();return this.public(m);});}
 async setAdmission(admission){if(!['open','draining','disabled'].includes(admission))fail(400,'Unknown admission mode');return this.locked('issue',async()=>{const policy={...this.policy,admission,changedAt:this.now()};this.accounts?.setOperationState(policy);this.policy=policy;return this.operationStatus();});}
 operationStatus(){
  const all=[...this.matches.values()],failed=this.failed(),jobs=[...all.filter(m=>m.status==='verifying'),...failed.rows],unfinished=all.length+failed.count;
  return {admission:this.policy.admission,rulesId:this.rules.id,season:this.policy.season,safeToUpdate:this.policy.admission!=='open'&&unfinished===0,unfinished,workerActive:!!this.worker,oldestQueueAgeMs:jobs.length?Math.max(...jobs.map(m=>this.now()-(m.submittedAt||m.issuedAt))):0,failedJobs:failed.count,jobs:jobs.slice(0,100).map(m=>({id:m.id,status:m.status,submittedAt:m.submittedAt,...m.job})),jobsTruncated:jobs.length>100||failed.count>failed.rows.length,capacity:{maxConcurrent:this.maxConcurrent,maxStartsPerHour:this.maxStartsPerHour,hotMatches:this.matches.size},metrics:{...this.metrics},alerts:[...(failed.count?['Verification jobs need operator attention']:[]),...(jobs.some(m=>this.now()-(m.submittedAt||m.issuedAt)>60000)?['Verification queue older than 60 seconds']:[]),...(this.metrics.persistenceErrors?['Result storage errors observed']:[])]};
 }
 async withSnapshot(fn){if(this.freeze)fail(409,'A snapshot is already running');let thaw;this.freeze=new Promise(resolve=>thaw=resolve);const writes=[...this.locks.values()];try{await Promise.all(writes);return await fn();}finally{this.freeze=null;thaw();this.drain();}}
 async close(){this.closed=true;clearInterval(this.timer);if(this.worker)await this.worker.terminate();await Promise.allSettled([...this.locks.values()]);}

}

export function rankedHandler(service,port){return async(req,res,url)=>{
 if(!url.pathname.startsWith('/api/ranked/'))return false;
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 try{
  if(!allowedRequest(req,port,'local-ranked-v1'))fail(403,'Same-origin local requests only');
  if(req.headers['x-hi-client']!=='local-ranked-v1')fail(403,'Missing local client header');
  if(req.method==='GET'&&url.pathname==='/api/ranked/rules'){send(200,{protocol:PROTOCOL,...service.rules,accountsRequired:!!service.accounts,accountVersion:ACCOUNT_VERSION,admission:service.policy.admission,release:service.releaseId});return true;}
  const session=service.accounts?.session(cookieToken(req));if(service.accounts){service.accounts.limit('ranked-source:'+service.accounts.sourceKey(clientSource(req,port)),2400,60000);if(session)service.accounts.limit('ranked-account:'+session.id,240,60000);}
  let body;if(req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)fail(413,'Request too large');chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString());
  }
  if(req.method==='POST'&&url.pathname==='/api/ranked/tickets'){
   if(service.releaseId!=='preview'&&req.headers['x-hi-build']!==service.releaseId)fail(409,'A newer game build is ready. Reload the game before starting a verified operation.');
   if(service.accounts){if(!session)fail(401,'Sign in to save verified results to your account.');exact(body,['config','confirmFaction']);if(typeof body.confirmFaction!=='boolean')fail(400,'Faction confirmation required');send(201,await service.issue(body.config,session.id,body.confirmFaction));}
   else send(201,await service.issue(body));return true;
  }
  const match=url.pathname.match(/^\/api\/ranked\/matches\/([a-f0-9-]{36})(?:\/(activate|commands|finish|abort))?$/);if(!match)fail(404,'Unknown ranked route');
  const [,id,action]=match,record=service.record(id);
  if(record?.ownerId&&!session)fail(401,'Your session expired. Sign in and reconnect from your account.');
  const token=record?.ownerId?{accountId:session?.id}:req.headers.authorization?.replace(/^Bearer /,'');let result;
  if(req.method==='GET'&&!action)result=url.searchParams.get('log')==='1'?service.get(id,token):service.public(service.owned(id,token));
  else if(req.method==='POST'&&action==='commands')result=await service.batch(id,token,body);
  else if(req.method==='POST'&&action==='finish')result=await service.finish(id,token,body);
  else if(req.method==='POST'&&['activate','abort'].includes(action)){exact(body,[]);result=await service[action](id,token);}
  else fail(405,'Method not allowed');send(200,result);
 }catch(e){if([429,503].includes(e.status))res.setHeader('Retry-After',String(e.retryAfter||30));send(e.status||(/SQLITE|database|disk|I\/O/i.test(e.message)?503:400),{error:e.status?e.message:/SQLITE|database|disk|I\/O/i.test(e.message)?'Server storage is temporarily unavailable. Your acknowledged orders are safe.':e.message});}return true;
};}
