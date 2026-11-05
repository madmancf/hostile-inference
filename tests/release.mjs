// Exercise a portable release copy, not the source preview server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const current=JSON.parse(await fs.readFile('dist/current.json','utf8'));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hi-portable-')),release=path.join(tmp,'release');
await fs.cp(current.path,release,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(release,'manifest.json'),'utf8'));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const base='http://127.0.0.1:'+port;let origin='https://hi-release.invalid',rehearsal=false;
let child;const checks=[],users={};
const start=()=>new Promise((resolve,reject)=>{
 let output='';child=spawn(process.execPath,['server.mjs'],{cwd:release,env:{PATH:process.env.PATH,PORT:String(port),HI_PUBLIC_ORIGIN:origin,HI_DATA_DIR:path.join(tmp,'data'),...(rehearsal?{HI_LOCAL_REHEARSAL:'1',HI_REQUIRE_VERIFIED_EMAIL:'1'}:{})},stdio:['ignore','pipe','pipe']});
 const timer=setTimeout(()=>reject(Error('Release did not start: '+output)),15000);
 child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);if(!output.includes('RELEASE_READY'))reject(Error('Release exited '+code+': '+output));});
 for(const s of [child.stdout,child.stderr])s.on('data',b=>{output+=b;if(output.includes('RELEASE_READY')){clearTimeout(timer);resolve();}});
});
const stop=async()=>{if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}child=null;};
const req=async(route,body,cookie,headers={})=>{const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'X-HI-Build':manifest.id,'X-HI-Client':route.startsWith('/api/account/')?'local-accounts-v1':route.startsWith('/api/ranked/')?'local-ranked-v1':'local-leaderboards-v1',...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {response:r,status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
try{
 await test('All packaged asset hashes match; full game PNGs and GLBs are unchanged',async()=>{
  for(const [name,entry]of Object.entries(manifest.assets)){const b=await fs.readFile(path.join(release,'public',name));assert.equal(createHash('sha256').update(b).digest('hex'),entry.sha256,name);assert.equal(b.length,entry.bytes);if(/\.(glb|png)$/.test(name))assert.equal(entry.sha256,manifest.sourceSHA256['game/'+name],name);}
  const names=Object.keys(manifest.assets);assert.equal(names.filter(n=>n.endsWith('.glb')).length,9);assert.ok(!names.some(n=>/checks\/|render-profiler|original\//.test(n)));assert.equal(await fs.stat(path.join(release,'node_modules')).catch(()=>null),null);
 });
 await start();
 await test('Independent runtime starts with HTTPS origin, persistent storage and security headers',async()=>{
  const r=await fetch(base+'/healthz');assert.equal(r.status,200);assert.equal((await r.json()).release,manifest.id);assert.match(r.headers.get('strict-transport-security'),/31536000/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  for(const route of Object.keys(manifest.routes)){const page=await fetch(base+route);assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-cache');assert.match(await page.text(),new RegExp('/r/'+manifest.id+'/'));}
 });
 await test('Only manifest assets are public; server, checks, source art and feedback routes are closed',async()=>{
  for(const route of ['/server.mjs','/package.json','/manifest.json','/api/accounts.mjs','/tests/browser-accounts.mjs','/provenance/test.json','/.runtime/accounts/accounts.sqlite','/v2/index.html','/api/feedback','/r/'+manifest.id+'/servers/render-profiler.js','/r/'+manifest.id+'/__proto__','/r/'+manifest.id+'/%2e%2e%2fserver.mjs']){const r=await fetch(base+route);assert.equal(r.status,404,route);}
  const r=await fetch(base+'/api/feedback',{method:'POST',body:'{}'});assert.equal(r.status,405);
 });
 await test('Immutable URLs, gzip, ETags, HEAD and canonical navigation behave correctly',async()=>{
  const name='entry/entry.js',url=base+'/r/'+manifest.id+'/'+name,r=await fetch(url);assert.match(r.headers.get('cache-control'),/immutable/);assert.equal(r.headers.get('content-encoding'),'gzip');assert.equal(await r.text(),await fs.readFile(path.join(release,'public',name),'utf8'));
  assert.equal((await fetch(url,{headers:{'If-None-Match':r.headers.get('etag')}})).status,304);const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const nav=await fetch(base+'/r/'+manifest.id+'/account/index.html?faction=broke',{redirect:'manual'});assert.equal(nav.headers.get('location'),'/account/index.html?faction=broke');
  const diagnostics=await fetch(base+'/demo/index.html?faction=closed&profile=1&assets=original&autoplay=operation',{redirect:'manual'});assert.equal(diagnostics.headers.get('location'),'/demo/index.html?faction=closed');
 });
 await test('Three faction sign-ups, Secure cookies, explicit origin checks and immutable account ownership',async()=>{
  for(const faction of ['misanthropic','closed','broke']){const r=await req('/api/account/signup',{username:'portable_'+faction,callsign:'Portable '+faction,password:'Portable package test password!',faction});assert.equal(r.status,200);assert.equal(r.data.user.membership.faction,faction);assert.match(r.response.headers.get('set-cookie'),/; Secure/);assert.match(r.response.headers.get('set-cookie'),/HttpOnly/);users[faction]=r;
   assert.equal((await req('/api/account/me',undefined,r.cookie)).data.user.id,r.data.user.id);
   assert.equal((await req('/api/account/faction',{faction},r.cookie,{Origin:'https://other.invalid'})).status,403);
   const other=faction==='closed'?'broke':'closed';assert.equal((await req('/api/ranked/tickets',{config:{faction,rival:other,difficulty:'standard'},confirmFaction:true},r.cookie)).status,403);
  }
 });
 await test('Production blocks unverified starts; local outbox verification unlocks faction-owned play',async()=>{
  await stop();rehearsal=true;origin=base;await start();
  for(const [faction,u]of Object.entries(users)){
   assert.equal((await req('/api/account/email',{email:faction+'@example.invalid',password:'Portable package test password!'},u.cookie)).status,200);
   const messages=JSON.parse(execFileSync(process.execPath,[path.join(release,'scripts/operate.mjs'),'mail-outbox','--data',path.join(tmp,'data')],{encoding:'utf8'}));const mail=messages.find(m=>m.user_id===u.data.user.id&&m.kind==='verify');assert.ok(mail);const token=new URLSearchParams(new URL(mail.url).hash.slice(1)).get('verify');assert.equal((await req('/api/account/verify-email',{token})).status,200);
   const other=faction==='closed'?'broke':'closed';assert.equal((await req('/api/ranked/tickets',{config:{faction:other,rival:faction,difficulty:'standard'},confirmFaction:true},u.cookie)).status,409);
   const t=await req('/api/ranked/tickets',{config:{faction,rival:other,difficulty:'standard'},confirmFaction:true},u.cookie);assert.equal(t.status,201);assert.equal((await req('/api/ranked/matches/'+t.data.id+'/activate',{},u.cookie)).status,200);assert.ok((await req('/api/account/me',undefined,u.cookie)).data.user.membership.lockedAt);assert.equal((await req('/api/ranked/matches/'+t.data.id+'/abort',{},u.cookie)).status,200);
  }
 });
 await test('Portable replay workers run all six matchups against the identical rules version',async()=>{
  const {replay,stateDigest}=await import(pathToFileURL(path.join(release,'game/demo/ranked-protocol.js')));
  for(const faction of Object.keys(users))for(const rival of Object.keys(users).filter(f=>f!==faction)){
   const config={faction,rival,difficulty:'standard'},r=replay(config,[]),checkpoint={tick:r.tick,digest:await stateDigest(r.game)};
   const result=await new Promise((resolve,reject)=>{const worker=new Worker(path.join(release,'api/replay-worker.mjs'),{workerData:{config,actions:[],checkpoint,rulesId:manifest.rules}});worker.once('error',reject);worker.once('message',resolve);});assert.equal(result.ok,true,result.error);assert.equal(result.result.digest,checkpoint.digest);assert.equal(result.result.rulesId,manifest.rules);
  }
 });
 await test('Restart keeps accounts, sessions and allegiance; practice/aborted runs add no leaderboard points',async()=>{
  await stop();await start();for(const [f,u]of Object.entries(users)){assert.equal((await req('/api/account/me',undefined,u.cookie)).data.user.membership.faction,f);assert.equal((await req('/api/account/matches',undefined,u.cookie)).data.summary.verified,0);}
  const board=(await req('/api/leaderboards',undefined,users.closed.cookie)).data;assert.equal(board.me.rank,null);assert.equal(board.me.contribution,0);
 });
 await stop();
 await test('Plain HTTP production configuration refuses to start',async()=>{
  const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['server.mjs'],{cwd:release,env:{PATH:process.env.PATH,PORT:String(port),HI_PUBLIC_ORIGIN:base,HI_DATA_DIR:path.join(tmp,'data')},stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',b=>err+=b);p.once('error',reject);p.once('exit',code=>resolve({code,err}));});assert.notEqual(result.code,0);assert.match(result.err,/Production requires an HTTPS public origin/);
 });
 const out=process.env.HI_RELEASE_OUTPUT||'output/playwright/entry-v0.16';await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/package.json',JSON.stringify({status:'passed',at:new Date().toISOString(),release:manifest.id,rules:manifest.rules,checks,portable:true,fullGraphicsAssetHashesUnchanged:true,deploy:false},null,2)+'\n');
}finally{await stop();await fs.rm(tmp,{recursive:true,force:true});}
