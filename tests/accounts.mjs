const output=process.env.HI_ACCOUNT_OUTPUT||'output/playwright/accounts-current';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {Accounts,accountHandler} from '../api/accounts.mjs';
import {RankedService,rankedHandler} from '../api/ranked-service.mjs';
import {createRankedGame,applyAction,stateDigest,replay,FACTION_IDS} from '../game/demo/ranked-protocol.js';
import {tickOperation} from '../game/demo/operation.js';
import {drive} from './ranked-policy.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hi-accounts-'));let now=Date.now(),accounts,ranked,handleAccount,handleRanked;
const open=async()=>{accounts=await new Accounts({file:path.join(dir,'accounts.sqlite'),now:()=>now}).init();ranked=await new RankedService({directory:path.join(dir,'legacy'),accounts,now:()=>now}).init();};await open();
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,base);if(await handleAccount(req,res,u)||await handleRanked(req,res,u))return;res.writeHead(404);res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,base='http://127.0.0.1:'+port;
const handlers=()=>{handleAccount=accountHandler(accounts,ranked,port);handleRanked=rankedHandler(ranked,port);};handlers();
const checks=[],runs=[],users={};
const req=async(route,body,cookie,extra={})=>{const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-HI-Client':route.startsWith('/api/account/')?'local-accounts-v1':'local-ranked-v1',...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')};};
const ok=async(...args)=>{const r=await req(...args);assert.ok(r.status>=200&&r.status<300,JSON.stringify(r.data));return r;};
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const wait=async(id,cookie)=>{for(let n=0;n<300;n++){const r=(await ok('/api/ranked/matches/'+id,undefined,cookie)).data;if(['verified','rejected'].includes(r.status))return r;await new Promise(r=>setTimeout(r,50));}throw Error('Worker did not settle');};
try{
 await test('Three faction sign-ups; hashed credentials and HttpOnly persistent sessions',async()=>{
  for(const faction of FACTION_IDS){const name='qa_'+faction,pass='Local test password 2026!';const r=await ok('/api/account/signup',{username:name,password:pass,callsign:'Test '+faction,faction});users[faction]={...r.data,cookie:r.cookie,password:pass};assert.equal(r.data.user.membership.faction,faction);assert.equal(r.data.user.membership.lockedAt,null);assert.match(r.setCookie,/HttpOnly/);assert.match(r.setCookie,/SameSite=Strict/);assert.match(r.setCookie,/Max-Age=2592000/);assert.equal(r.data.token,undefined);const row=accounts.db.prepare('SELECT * FROM users WHERE id=?').get(r.data.user.id);assert.notEqual(row.password_hash,pass);assert.notEqual(row.recovery_hash,r.data.recoveryCode);assert.equal((await ok('/api/account/me',undefined,r.cookie)).data.user.id,r.data.user.id);}
 });
 await test('Unauthenticated writes, cross-origin requests and account-field injection reject',async()=>{
  assert.equal((await req('/api/ranked/tickets',{config:{faction:'closed',rival:'broke',difficulty:'standard'},confirmFaction:true})).status,401);
  assert.equal((await req('/api/account/faction',{faction:'broke'},users.closed.cookie,{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await req('/api/account/faction',{faction:'broke',userId:users.broke.user.id},users.closed.cookie)).status,400);
  assert.equal((await req('/api/account/login',{username:'qa_closed',password:'incorrect password'})).status,401);
  assert.equal((await req('/api/account/login',{username:'nobody',password:'incorrect password'})).data.error,(await req('/api/account/login',{username:'qa_closed',password:'incorrect password'})).data.error);
 });
 await test('Concurrent duplicate usernames cannot create two identities',async()=>{
  const payload={username:'duplicate',password:'A long test password!',callsign:'Duplicate',faction:'closed'};const r=await Promise.all([req('/api/account/signup',payload),req('/api/account/signup',payload)]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal(accounts.db.prepare("SELECT COUNT(*) AS n FROM users WHERE username='duplicate'").get().n,1);
 });
 await test('Faction changes before commitment; confirmation and matching faction required',async()=>{
  await ok('/api/account/faction',{faction:'broke'},users.closed.cookie);await ok('/api/account/faction',{faction:'closed'},users.closed.cookie);
  assert.equal((await req('/api/ranked/tickets',{config:{faction:'closed',rival:'broke',difficulty:'standard'},confirmFaction:false},users.closed.cookie)).status,409);
  assert.equal((await req('/api/ranked/tickets',{config:{faction:'broke',rival:'closed',difficulty:'standard'},confirmFaction:true},users.closed.cookie)).status,409);
 });
 for(const faction of FACTION_IDS)for(const rival of FACTION_IDS.filter(f=>f!==faction))await test('Account-owned verified victory '+faction+' vs '+rival,async()=>{
  const user=users[faction],config={faction,rival,difficulty:'standard'};const ticket=(await ok('/api/ranked/tickets',{config,confirmFaction:true},user.cookie)).data;
  assert.equal(ticket.accountOwned,true);assert.equal(ticket.token,undefined);
  assert.equal((await req('/api/ranked/tickets',{config,confirmFaction:true},user.cookie)).status,409);
  const other=users[rival];for(const [suffix,body] of [['',undefined],['?log=1',undefined],['/activate',{}],['/abort',{}],['/commands',{seq:0,throughTick:1,actions:[]}],['/finish',{tick:1,digest:'0'.repeat(64)}]])assert.equal((await req('/api/ranked/matches/'+ticket.id+suffix,body,other.cookie)).status,404);
  const active=(await ok('/api/ranked/matches/'+ticket.id+'/activate',{},user.cookie)).data;assert.ok((await ok('/api/account/me',undefined,user.cookie)).data.user.membership.lockedAt);
  assert.equal((await req('/api/account/faction',{faction:rival},user.cookie)).status,409);
  const g=createRankedGame(config),policy={},batch=[];let tick=0,seq=0;
  while(!g.result){drive(g,policy,action=>{const r=applyAction(g,action);batch.push({tick,action});return r;});tickOperation(g,.05);tick++;now=active.startedAt+tick*50;if(tick%40===0||g.result)await ok('/api/ranked/matches/'+ticket.id+'/commands',{seq:seq++,throughTick:tick,actions:batch.splice(0)},user.cookie);}
  const checkpoint={tick,digest:await stateDigest(g)};await ok('/api/ranked/matches/'+ticket.id+'/finish',checkpoint,user.cookie);const final=await wait(ticket.id,user.cookie);assert.equal(final.status,'verified',final.error);assert.equal(final.result.outcome,'victory');assert.equal(final.result.digest,checkpoint.digest);await ok('/api/ranked/matches/'+ticket.id+'/finish',checkpoint,user.cookie);
  const history=(await ok('/api/account/matches',undefined,user.cookie)).data.matches;assert.equal(history.filter(m=>m.id===ticket.id).length,1);assert.equal(history.find(m=>m.id===ticket.id).result.score,final.result.score);assert.ok(history.every(m=>m.config.faction===faction));runs.push({id:ticket.id,faction,rival,...final.result});
 });
 await test('Database restart retains identities, sessions, allegiance and results',async()=>{
  await ranked.close();accounts.close();await open();handlers();for(const faction of FACTION_IDS){const u=users[faction];assert.equal((await ok('/api/account/me',undefined,u.cookie)).data.user.id,u.user.id);const history=(await ok('/api/account/matches',undefined,u.cookie)).data;assert.equal(history.matches.length,2);assert.ok(history.matches.every(m=>m.status==='verified'));assert.equal(accounts.profile(u.user.id).membership.faction,faction);assert.ok(accounts.profile(u.user.id).membership.lockedAt);}
 });
 await test('Fresh login restores verified history; logout revokes the old cookie',async()=>{
  const u=users.closed;await ok('/api/account/logout',{},u.cookie);assert.equal((await req('/api/account/matches',undefined,u.cookie)).status,401);const login=await ok('/api/account/login',{username:u.user.username.toUpperCase(),password:u.password});u.cookie=login.cookie;assert.equal(login.data.user.id,u.user.id);assert.equal((await ok('/api/account/matches',undefined,u.cookie)).data.matches.length,2);
 });
 await test('One-use recovery rotates credentials and revokes every prior session',async()=>{
  const u=users.broke,old=u.cookie;const second=await ok('/api/account/login',{username:u.user.username,password:u.password});const next='A changed test password 2026!';const reset=await ok('/api/account/recover',{username:u.user.username,recoveryCode:u.recoveryCode,password:next});assert.equal((await req('/api/account/matches',undefined,old)).status,401);assert.equal((await req('/api/account/matches',undefined,second.cookie)).status,401);assert.equal((await req('/api/account/recover',{username:u.user.username,recoveryCode:u.recoveryCode,password:next})).status,401);assert.equal((await req('/api/account/login',{username:u.user.username,password:u.password})).status,401);u.cookie=reset.cookie;u.password=next;assert.equal((await ok('/api/account/matches',undefined,u.cookie)).data.matches.length,2);
 });
 await test('Account commands and pending verification survive process reconstruction',async()=>{
  const u=users.closed,config={faction:'closed',rival:'broke',difficulty:'standard'},t=(await ok('/api/ranked/tickets',{config,confirmFaction:false},u.cookie)).data;
  const active=(await ok('/api/ranked/matches/'+t.id+'/activate',{},u.cookie)).data;now+=1000;const batch={seq:0,throughTick:20,actions:[{tick:0,action:{type:'economy'}}]};await ok('/api/ranked/matches/'+t.id+'/commands',batch,u.cookie);
  await ranked.close();accounts.close();await open();handlers();const restored=(await ok('/api/ranked/matches/'+t.id+'?log=1',undefined,u.cookie)).data;assert.equal(restored.status,'active');assert.equal(restored.throughTick,20);assert.deepEqual(restored.actions,batch.actions);assert.equal((await ok('/api/ranked/matches/'+t.id+'/commands',batch,u.cookie)).data.duplicate,true);
  const terminal=replay(config,restored.actions),digest=await stateDigest(terminal.game);now=active.startedAt+terminal.tick*50;await ok('/api/ranked/matches/'+t.id+'/commands',{seq:1,throughTick:terminal.tick,actions:[]},u.cookie);
  // Hold worker dispatch in this isolated test to model a shutdown after submit.
  ranked.drain=()=>{};await ok('/api/ranked/matches/'+t.id+'/finish',{tick:terminal.tick,digest},u.cookie);assert.equal(accounts.db.prepare('SELECT status FROM account_matches WHERE id=?').get(t.id).status,'verifying');await ranked.close();accounts.close();await open();handlers();const final=await wait(t.id,u.cookie);assert.equal(final.status,'verified');assert.equal(final.result.digest,digest);assert.equal(accounts.db.prepare("SELECT COUNT(*) AS n FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='settled'").get(t.id).n,1);
 });
 await test('Legacy anonymous records cannot be claimed by account cookies',async()=>{
  const u=users.closed,before=(await ok('/api/account/matches',undefined,u.cookie)).data.total,t=await ranked.issue({faction:'closed',rival:'broke',difficulty:'standard'});assert.equal((await req('/api/ranked/matches/'+t.id,undefined,u.cookie)).status,404);await ranked.abort(t.id,t.token);assert.equal((await ok('/api/account/matches',undefined,u.cookie)).data.total,before);assert.equal(accounts.db.prepare('SELECT COUNT(*) AS n FROM account_matches WHERE id=?').get(t.id).n,0);
 });
 await test('Paged history keeps aggregate scores and private ownership intact',async()=>{
  const u=users.closed,before=(await ok('/api/account/matches',undefined,u.cookie)).data;for(let n=0;n<26;n++){if(n%13===0)now+=3600001;const t=(await ok('/api/ranked/tickets',{config:{faction:'closed',rival:'broke',difficulty:'standard'},confirmFaction:false},u.cookie)).data;await ok('/api/ranked/matches/'+t.id+'/abort',{},u.cookie);}
  const first=(await ok('/api/account/matches',undefined,u.cookie)).data,second=(await ok('/api/account/matches?offset=25',undefined,u.cookie)).data;assert.equal(first.total,before.total+26);assert.equal(first.matches.length,25);assert.equal(second.matches.length,first.total-25);assert.deepEqual(first.summary,before.summary);assert.deepEqual(second.summary,before.summary);assert.equal(new Set([...first.matches,...second.matches].map(m=>m.id)).size,first.total);assert.equal((await req('/api/account/matches?offset=-1',undefined,u.cookie)).status,400);
 });
 await test('Session expiry and persistent throttling fail closed',async()=>{
  const u=users.misanthropic;now+=8*86400000;assert.equal((await req('/api/account/matches',undefined,u.cookie)).status,401);for(let n=0;n<12;n++)assert.equal((await req('/api/account/login',{username:'missing_user',password:'Not a real password!'})).status,401);await ranked.close();accounts.close();await open();handlers();assert.equal((await req('/api/account/login',{username:'missing_user',password:'Not a real password!'})).status,429);
 });
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/server.json',JSON.stringify({status:'passed',at:new Date().toISOString(),rulesId:ranked.rules.id,checks,runs,scope:'Actual HTTP account routes and replay worker; isolated SQLite and test-only injected server clock. No production state grants.'},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,verifiedMatchups:runs.length}));
}finally{await new Promise(r=>server.close(r));await ranked.close();accounts.close();await fs.rm(dir,{recursive:true,force:true});}
