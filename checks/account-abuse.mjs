import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Accounts,accountHandler} from '../api/accounts.mjs';
import {RankedService,rankedHandler} from '../api/ranked-service.mjs';
import {leaderboardHandler,leaderboardSnapshot} from '../api/leaderboards.mjs';
import {clientSource,trustedProxies} from '../api/client-source.mjs';
import {createBackup,restoreBackup,verifyBackup} from '../api/operations.mjs';
import {createRankedGame,applyAction,stateDigest} from '../design-preview/demo/ranked-protocol.js';
import {tickOperation} from '../design-preview/demo/operation.js';
import {drive} from './ranked-policy.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hi-abuse-')),out='output/playwright/safety-v0.18';await fs.mkdir(out,{recursive:true});
let now=Date.now(),a=await new Accounts({file:path.join(dir,'data/accounts.sqlite'),now:()=>now,requireVerifiedEmail:true}).init(),r=await new RankedService({accounts:a,directory:path.join(dir,'legacy'),now:()=>now,pollMs:10}).init();
let base,handlers;const server=http.createServer(async(req,res)=>{for(const h of handlers)if(await h(req,res,new URL(req.url,base)))return;res.writeHead(404);res.end('{}');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;a.origin=base;
const policy={origins:[base],trustedProxies:['127.0.0.1']};const wire=()=>handlers=[accountHandler(a,r,policy),rankedHandler(r,policy),leaderboardHandler(a,r,policy)];wire();
const req=async(route,body,cookie,ip='192.0.2.1',extra={})=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-HI-Client':route.startsWith('/api/account/')?'local-accounts-v1':route.startsWith('/api/ranked/')?'local-ranked-v1':'local-leaderboards-v1','X-Real-IP':ip,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],retry:response.headers.get('retry-after')};};
const ok=async(...args)=>{const x=await req(...args);assert.equal(x.status,200,JSON.stringify(x));return x;};
const post=(route,body,cookie,ip)=>ok('/api/account/'+route,body,cookie,ip),pass='Private local testing password!',users={},checks=[];
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const mail=(id,kind)=>{const row=a.db.prepare('SELECT * FROM mail_outbox WHERE user_id=? AND kind=?').get(id,kind);assert.ok(row);return {row,token:new URLSearchParams(new URL(row.url).hash.slice(1)).get(kind)};};
try{
 await test('Only configured immediate proxies can identify clients; IPv6 /64 and spoofed chains',async()=>{
  const request=(ip,headers)=>({socket:{remoteAddress:ip},headers});assert.equal(clientSource(request('192.0.2.8',{'x-real-ip':'198.51.100.2','x-forwarded-for':'198.51.100.3'}),policy),'192.0.2.8');assert.equal(clientSource(request('127.0.0.1',{'x-real-ip':'198.51.100.2'}),policy),'198.51.100.2');assert.equal(clientSource(request('127.0.0.1',{'x-real-ip':'198.51.100.2, 1.1.1.1'}),policy),'invalid-proxy-client');assert.equal(clientSource(request('2001:db8:1:2::1',{}),policy),clientSource(request('2001:db8:1:2::2',{}),policy));assert.throws(()=>trustedProxies('*'));
 });
 await test('Three factions sign up, require email verification, and keep recovery tokens private',async()=>{
  for(const [i,faction]of ['misanthropic','closed','broke'].entries()){
   const u=await post('signup',{username:'abuse_'+faction,password:pass,callsign:'Safety '+faction,faction},null,'192.0.2.'+(i+2));users[faction]=u;
   assert.equal((await req('/api/ranked/tickets',{config:{faction,rival:faction==='closed'?'broke':'closed',difficulty:'standard'},confirmFaction:true},u.cookie)).status,403);
   const set=await post('email',{email:faction+'@example.invalid',password:pass},u.cookie);assert.equal(set.data.token,undefined);assert.match(set.data.message,/no email has been sent/);
   const {row,token}=mail(u.data.user.id,'verify');assert.equal(a.db.prepare('SELECT hash FROM mail_tokens WHERE user_id=?').get(u.data.user.id).hash===token,false);assert.ok(row.url.startsWith(base+'/account/index.html#verify='));
   await post('verify-email',{token});assert.equal((await req('/api/account/verify-email',{token})).status,400);assert.equal((await ok('/api/account/me',undefined,u.cookie)).data.user.safety.emailVerified,true);
  }
  assert.equal((await req('/api/account/mail-outbox',undefined,users.closed.cookie)).status,404);
 });
 await test('Source isolation and persisted throttles do not consume another player’s budget',async()=>{
  for(let i=0;i<12;i++)assert.equal((await req('/api/account/login',{username:'absent',password:pass},null,'198.51.100.8')).status,401);
  const blocked=await req('/api/account/login',{username:'absent',password:pass},null,'198.51.100.8');assert.equal(blocked.status,429);assert.ok(Number(blocked.retry)>0);
  assert.equal((await req('/api/account/login',{username:'abuse_closed',password:pass},null,'198.51.100.9')).status,200);
  await r.close();a.close();a=await new Accounts({file:path.join(dir,'data/accounts.sqlite'),now:()=>now,origin:base,requireVerifiedEmail:true}).init();r=await new RankedService({accounts:a,directory:path.join(dir,'legacy'),now:()=>now,pollMs:10}).init();wire();assert.equal((await req('/api/account/login',{username:'absent',password:pass},null,'198.51.100.8')).status,429);
  for(let i=0;i<5;i++)a.authLimit('signup','new'+i,'attacking-client');assert.throws(()=>a.authLimit('signup','sixth','attacking-client'),e=>e.status===429);a.authLimit('signup','legitimate','other-client');
 });
 await test('Hash burst remains bounded; unrelated login succeeds after backpressure clears',async()=>{
  const attempts=await Promise.allSettled(Array.from({length:8},()=>a.hash(pass,'test-salt')));assert.equal(attempts.filter(x=>x.status==='fulfilled').length,2);assert.ok(attempts.filter(x=>x.status==='rejected').every(x=>x.reason.status===429));assert.equal(a.hashing,0);await post('login',{username:'abuse_broke',password:pass},null,'198.51.100.10');
 });
 await test('Email recovery is generic, single-use, expiring and revokes sessions and recovery codes',async()=>{
  const u=users.closed,id=u.data.user.id,known=await post('request-reset',{username:'abuse_closed',email:'closed@example.invalid'},null,'203.0.113.1'),unknown=await post('request-reset',{username:'not_there',email:'nobody@example.invalid'},null,'203.0.113.2');assert.deepEqual(known.data,unknown.data);
  const {token}=mail(id,'reset'),before=u.cookie;assert.equal((await req('/api/account/reset-email',{token:'0'.repeat(64),password:pass})).status,400);
  const fresh=await post('reset-email',{token,password:pass+' changed'});u.cookie=fresh.cookie;u.password=pass+' changed';assert.equal((await ok('/api/account/me',undefined,before)).data.user,null);assert.equal((await req('/api/account/reset-email',{token,password:pass})).status,400);assert.equal((await req('/api/account/recover',{username:'abuse_closed',recoveryCode:u.data.recoveryCode,password:pass})).status,401);
  await post('request-reset',{username:'abuse_broke',email:'broke@example.invalid'},null,'203.0.113.3');const expired=mail(users.broke.data.user.id,'reset').token;now+=1800001;assert.equal((await req('/api/account/reset-email',{token:expired,password:pass})).status,400);
  // Unknown addresses can never be attached without the current password.
  assert.equal((await req('/api/account/email',{email:'attacker@example.invalid',password:'wrong long password'},users.broke.cookie)).status,401);
 });
 await test('Unique verified email and changed-address token invalidation prevent ambiguous recovery',async()=>{
  const u=users.broke;await post('email',{email:'closed@example.invalid',password:pass},u.cookie);const token=mail(u.data.user.id,'verify').token;assert.equal((await req('/api/account/verify-email',{token})).status,409);assert.equal(a.safety(u.data.user.id).email,'broke@example.invalid');assert.ok(a.safety(u.data.user.id).email_verified_at);
  await post('email',{email:'broke@example.invalid',password:pass},u.cookie);assert.equal((await req('/api/account/verify-email',{token})).status,400);await post('verify-email',{token:mail(u.data.user.id,'verify').token});
 });
 const victories=[];
 for(const faction of Object.keys(users))await test('Real verified '+faction+' victory enters only its own faction standings',async()=>{
  const u=users[faction],config={faction,rival:faction==='closed'?'broke':'closed',difficulty:'standard'};const ticket=await r.issue(config,u.data.user.id,true),active=await r.activate(ticket.id,{accountId:u.data.user.id}),g=createRankedGame(config),policy={},batch=[];let tick=0,seq=0;
  while(!g.result){drive(g,policy,action=>{const answer=applyAction(g,action);batch.push({tick,action});return answer;});tickOperation(g,.05);tick++;now=active.startedAt+tick*50;if(tick%40===0||g.result)await r.batch(ticket.id,{accountId:u.data.user.id},{seq:seq++,throughTick:tick,actions:batch.splice(0)});}
  const checkpoint={tick,digest:await stateDigest(g)};await r.finish(ticket.id,{accountId:u.data.user.id},checkpoint);for(let n=0;n<300&&r.record(ticket.id).status==='verifying';n++)await new Promise(resolve=>setTimeout(resolve,30));const final=r.record(ticket.id);assert.equal(final.status,'verified');assert.equal(final.result.outcome,'victory');await r.finish(ticket.id,{accountId:u.data.user.id},checkpoint);
  const board=leaderboardSnapshot(a,r,{viewerId:u.data.user.id});assert.equal(board.me.score,final.result.score/2);assert.equal(board.me.contribution,final.result.score/40);victories.push({faction,id:ticket.id,score:final.result.score});u.matchId=ticket.id;
 });
 await test('Ranked request floods are isolated by account and source before command parsing',async()=>{
  const key='ranked-account:'+users.misanthropic.data.user.id;a.limit(key,240,60000);a.db.prepare('UPDATE auth_limits SET count=240 WHERE key=?').run(createHash('sha256').update(key).digest('hex'));
  assert.equal((await req('/api/ranked/matches/'+users.misanthropic.matchId,undefined,users.misanthropic.cookie)).status,429);
  assert.equal((await req('/api/ranked/matches/'+users.broke.matchId,undefined,users.broke.cookie)).status,200);
  const source='203.0.113.77',sourceKey='ranked-source:'+a.sourceKey(source);a.limit(sourceKey,2400,60000);a.db.prepare('UPDATE auth_limits SET count=2400 WHERE key=?').run(createHash('sha256').update(sourceKey).digest('hex'));
  const blocked=await req('/api/ranked/matches/'+users.broke.matchId,undefined,users.broke.cookie,source);assert.equal(blocked.status,429);assert.ok(Number(blocked.retry)>0);assert.equal((await req('/api/ranked/matches/'+users.broke.matchId,undefined,users.broke.cookie,'203.0.113.78')).status,200);now+=60001;
 });
 await test('Reports are private, bounded, and cannot automatically suspend; rename/suspend/restore invalidates cached points',async()=>{
  const u=users.broke,id=u.data.user.id,board=leaderboardSnapshot(a,r,{faction:'broke'}),ref=board.players.rows[0].reportRef;assert.ok(!JSON.stringify(board).includes(id));
  await post('report',{target:ref,reason:'callsign',detail:'Review this test callsign.'},users.misanthropic.cookie);assert.equal(a.safety(id).status,'active');assert.equal((await req('/api/account/moderate',{id,action:'suspend'},users.misanthropic.cookie)).status,404);
  a.moderate({id,action:'rename',reason:'Local test moderation',callsign:'Renamed Commander'});assert.equal(leaderboardSnapshot(a,r,{faction:'broke'}).players.rows[0].callsign,'Renamed Commander');
  a.moderate({id,action:'suspend',reason:'Local test suspension'});assert.equal(leaderboardSnapshot(a,r,{faction:'broke'}).players.total,0);assert.equal((await req('/api/account/login',{username:'abuse_broke',password:pass})).status,401);assert.equal((await ok('/api/account/me',undefined,u.cookie)).data.user,null);await assert.rejects(()=>r.issue({faction:'broke',rival:'closed',difficulty:'standard'},id,true),e=>e.status===403);
  a.moderate({id,action:'restore',reason:'Local test restoration'});assert.equal(leaderboardSnapshot(a,r,{faction:'broke'}).players.rows[0].score,board.players.rows[0].score);u.cookie=(await post('login',{username:'abuse_broke',password:pass})).cookie;
 });
 await test('Publication and signup pauses are independent and survive ranked admission changes',async()=>{
  a.setOperationState({publication:'paused',signups:'paused'});assert.equal((await req('/api/leaderboards')).status,503);assert.equal((await req('/api/account/signup',{username:'blocked_signup',password:pass,callsign:'Blocked',faction:'closed'})).status,503);await post('login',{username:'abuse_broke',password:pass});await r.setAdmission('draining');assert.equal(a.operationState().publication,'paused');assert.equal(a.operationState().signups,'paused');await r.setAdmission('open');a.setOperationState({publication:'open',signups:'open'});assert.equal((await req('/api/leaderboards')).status,200);
 });
 await test('Deletion requires credentials, refuses unfinished work, removes identity and points, and survives restore',async()=>{
  const u=users.closed,id=u.data.user.id;assert.equal((await req('/api/account/delete',{password:'incorrect password',confirmation:'DELETE'},u.cookie)).status,401);
  const t=await r.issue({faction:'closed',rival:'broke',difficulty:'standard'},id,true);assert.equal((await req('/api/account/delete',{password:u.password,confirmation:'DELETE'},u.cookie)).status,409);await r.abort(t.id,{accountId:id});await post('delete',{password:u.password,confirmation:'DELETE'},u.cookie);
  assert.equal(leaderboardSnapshot(a,r,{faction:'closed'}).players.total,0);assert.equal((await ok('/api/account/me',undefined,u.cookie)).data.user,null);const row=a.db.prepare('SELECT * FROM users WHERE id=?').get(id);assert.equal(row.callsign,'Deleted player');assert.equal(row.password_hash,'');assert.equal(a.safety(id).email,null);assert.equal(a.db.prepare('SELECT COUNT(*) AS n FROM mail_tokens WHERE user_id=?').get(id).n,0);
  const backup=path.join(dir,'backup');await createBackup({accounts:a,ranked:r,destination:backup});await verifyBackup(backup);const dest=path.join(dir,'restore');await restoreBackup({source:backup,destination:dest});const restored=await new Accounts({file:path.join(dest,'accounts.sqlite')}).init();try{assert.equal(restored.safety(id).status,'deleted');assert.equal(restored.db.prepare("SELECT COUNT(*) AS n FROM account_matches WHERE user_id=? AND status='verified'").get(id).n,1);}finally{restored.close();}
 });
 await fs.writeFile(out+'/abuse.json',JSON.stringify({status:'passed',at:new Date().toISOString(),checks,victories,rules:r.rules.id,scope:'Actual HTTP, scrypt, SQLite, worker and backup; isolated storage, injected match clock; private local mail outbox only. No email delivery or human-identity claim.'},null,2));
}finally{await new Promise(resolve=>server.close(resolve));await r.close();a.close();await fs.rm(dir,{recursive:true,force:true});}
