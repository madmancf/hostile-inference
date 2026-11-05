import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Accounts} from '../api/accounts.mjs';
import {RankedService} from '../api/ranked-service.mjs';
import {loadMailConfig,mailPayload} from '../api/mail-delivery.mjs';
import {createBackup,verifyBackup,restoreBackup} from '../api/operations.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hi-email-')),checks=[],calls=[],password='Local mail proof password!',origin='http://127.0.0.1:4181';
let at=Date.now(),a,r,restored,transport=async()=>new Response(JSON.stringify({id:'provider-accepted'}),{status:200}),file=path.join(dir,'live/accounts.sqlite');
const config={mode:'resend',from:'account@mail.example.invalid',replyTo:'help@example.invalid',apiKey:'re_fake_test_key',origin,testRecipients:['owner@example.invalid','second@example.invalid']};
const fetchImpl=async(url,options)=>{calls.push({url,...options});return transport(url,options);};
const open=async()=>a=await new Accounts({file,origin,now:()=>at,mailConfig:config,mailOptions:{fetchImpl,timeoutMs:30},requireVerifiedEmail:true}).init();
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const latest=()=>a.db.prepare('SELECT * FROM mail_delivery ORDER BY rowid DESC LIMIT 1').get();
const token=job=>JSON.parse(job.payload).text.match(/#(?:verify|reset)=([a-f0-9]{64})/)[1];
const tick=()=>{at+=3600001;};
try{
 await test('Private configuration requires explicit recipients, protects secrets and refuses unsafe origins/files',async()=>{
  const key=path.join(dir,'key'),conf=path.join(dir,'mail.json');await fs.writeFile(key,'re_fake_config_key',{mode:0o600});
  const raw={provider:'resend',from:config.from,replyTo:config.replyTo,apiKeyFile:key,testRecipients:config.testRecipients};await fs.writeFile(conf,JSON.stringify(raw),{mode:0o600});
  const loaded=await loadMailConfig({origin,local:true,env:{HI_MAIL_CONFIG:conf}});assert.equal(loaded.mode,'resend');assert.deepEqual(loaded.testRecipients,config.testRecipients);
  await assert.rejects(()=>loadMailConfig({origin:'http://public.example.invalid',env:{HI_MAIL_CONFIG:conf}}),/HTTPS/);
  await fs.writeFile(conf,JSON.stringify({...raw,testRecipients:[]}));await assert.rejects(()=>loadMailConfig({origin,local:true,env:{HI_MAIL_CONFIG:conf}}),/testRecipients/);
  await fs.chmod(conf,0o644);await assert.rejects(()=>loadMailConfig({origin,local:true,env:{HI_MAIL_CONFIG:conf}}),/private/);
  assert.deepEqual(await loadMailConfig({origin,env:{}}),{mode:'disabled'});
 });
 await open();const user=await a.signup({username:'mail_commander',callsign:'Mail Commander',password,faction:'closed'});
 await test('Queue is durable before response; provider contract includes fixed origin, text/HTML and idempotency',async()=>{
  await a.setEmail(user.user.id,{email:config.testRecipients[0],password});const job=latest();assert.equal(job.state,'queued');assert.equal(calls.length,0);assert.equal(a.db.prepare('SELECT COUNT(*) n FROM mail_outbox').get().n,0);assert.throws(()=>a.assertRanked(user.user.id),/Verify/);
  const code=token(job);await a.mail.close();a.close();await open();await a.mail.pump();const sent=calls.at(-1),body=JSON.parse(sent.body);assert.equal(sent.url,'https://api.resend.com/emails');assert.equal(sent.redirect,'error');assert.equal(sent.headers['Idempotency-Key'],'hi-auth/'+job.id);assert.equal(sent.headers.Authorization,'Bearer '+config.apiKey);assert.equal(body.reply_to,config.replyTo);assert.match(body.text,/#verify=/);assert.match(body.html,/Confirm your email/);assert.equal(latest().state,'accepted');assert.equal(latest().payload,null);
  a.verifyEmail({token:code});a.assertRanked(user.user.id);assert.throws(()=>a.verifyEmail({token:code}),/invalid or expired/);
 });
 await test('Recovery stays generic and resets password, sessions and recovery code without losing faction',async()=>{
  const count=a.db.prepare('SELECT COUNT(*) n FROM mail_delivery').get().n;
  const missing=a.requestReset({username:'not_a_player',email:config.testRecipients[0]},'missing');assert.equal(a.db.prepare('SELECT COUNT(*) n FROM mail_delivery').get().n,count);
  const real=a.requestReset({username:'mail_commander',email:config.testRecipients[0]},'real');assert.deepEqual(real,missing);const job=latest(),code=token(job);await a.mail.pump();const reset=await a.resetEmail({token:code,password:password+' new'});assert.equal(a.session(user.token),null);assert.notEqual(reset.recoveryCode,user.recoveryCode);assert.equal(reset.user.membership.faction,'closed');assert.equal(reset.user.safety.emailVerified,true);assert.equal((await a.login({username:'mail_commander',password:password+' new'},null,'fresh')).user.id,user.user.id);await assert.rejects(()=>a.resetEmail({token:code,password}),/invalid or expired/);
 });
 const currentPassword=password+' new';
 await test('Lost acknowledgement, rate-limit and server failure retries preserve exact key and bytes across restart',async()=>{
  tick();await a.setEmail(user.user.id,{email:config.testRecipients[1],password:currentPassword});const job=latest();let tries=0;transport=async()=>{if(++tries===1)throw Error('accepted but acknowledgement lost');if(tries===2)return new Response('{}',{status:429,headers:{'Retry-After':'4'}});if(tries===3)return new Response('{}',{status:503});return new Response('{"id":"once-only"}',{status:200});};
  await a.mail.pump();assert.equal(latest().state,'retry');await a.mail.close();a.close();await open();
  for(let n=0;n<3;n++){at=latest().next_at;await a.mail.pump();}
  const group=calls.filter(x=>x.headers['Idempotency-Key']==='hi-auth/'+job.id);assert.equal(group.length,4);assert.equal(new Set(group.map(x=>x.body)).size,1);assert.equal(latest().state,'accepted');assert.equal(latest().attempts,4);assert.equal(a.safety(user.user.id).email,config.testRecipients[0]);
 });
 await test('Permanent rejection stops, timeout retries, retry exhaustion is bounded and errors redact provider content',async()=>{
  tick();transport=async()=>new Response('{"error":"secret and address must not be logged"}',{status:403});await a.setEmail(user.user.id,{email:config.testRecipients[1],password:currentPassword});await a.mail.pump();assert.equal(latest().state,'failed');assert.equal(latest().last_error,'provider_403');assert.equal(latest().payload,null);
  tick();transport=(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true});});await a.setEmail(user.user.id,{email:config.testRecipients[1],password:currentPassword});const keepAlive=setInterval(()=>{},100);try{await a.mail.pump();}finally{clearInterval(keepAlive);}assert.equal(latest().last_error,'request_timeout');
  transport=async()=>new Response('{}',{status:500});for(let i=0;i<5;i++){at=latest().next_at;await a.mail.pump();}assert.equal(latest().attempts,6);assert.equal(latest().state,'failed');assert.equal(latest().payload,null);
 });
 await test('Replacement, expiry and suspension cancel queued secrets; local recipients cannot be bypassed',async()=>{
  tick();await assert.rejects(()=>a.setEmail(user.user.id,{email:'stranger@example.invalid',password:currentPassword}),/restricted/);
  await a.setEmail(user.user.id,{email:config.testRecipients[1],password:currentPassword});const first=latest();at++;await a.setEmail(user.user.id,{email:config.testRecipients[1],password:currentPassword});assert.equal(a.db.prepare('SELECT payload FROM mail_delivery WHERE id=?').get(first.id).payload,null);
  a.moderate({id:user.user.id,action:'suspend',reason:'Local cancellation test'});assert.equal(latest().state,'cancelled');a.moderate({id:user.user.id,action:'restore',reason:'Local restoration test'});
  tick();await a.setEmail(user.user.id,{email:config.testRecipients[1],password:currentPassword});at+=31*60000;const before=calls.length;await a.mail.pump();assert.equal(calls.length,before);assert.equal(latest().payload,null);
 });
 await test('Ambiguous in-flight jobs recover after process restart; backups retain queue and restore pauses sending',async()=>{
  tick();await a.setEmail(user.user.id,{email:config.testRecipients[1],password:currentPassword});const job=latest();a.db.prepare("UPDATE mail_delivery SET state='sending',attempts=1 WHERE id=?").run(job.id);await a.mail.close();a.close();await open();assert.equal(latest().state,'retry');
  r=await new RankedService({accounts:a,directory:path.join(dir,'live/legacy-ranked')}).init();const backup=await createBackup({accounts:a,ranked:r,destination:path.join(dir,'backup')});assert.equal(backup.schema,4);assert.ok(backup.counts.mail_delivery);await verifyBackup(backup.path);const target=path.join(dir,'restore');await restoreBackup({source:backup.path,destination:target});restored=await new Accounts({file:path.join(target,'accounts.sqlite'),origin,now:()=>at,mailConfig:config,mailOptions:{fetchImpl}}).init();const before=calls.length;await restored.mail.pump();assert.equal(calls.length,before);assert.equal(restored.mail.status().admission,'paused');assert.equal(restored.db.prepare('SELECT payload FROM mail_delivery WHERE id=?').get(job.id).payload,job.payload);
  transport=async()=>new Response('{"id":"restored-once"}',{status:200});restored.setOperationState({mailAdmission:'open'});await restored.mail.pump();assert.equal(calls.at(-1).headers['Idempotency-Key'],'hi-auth/'+job.id);assert.equal(restored.db.prepare('SELECT state FROM mail_delivery WHERE id=?').get(job.id).state,'accepted');
 });
 await test('Email markup escapes URLs and status never exposes tokens, addresses or credentials',async()=>{
  const p=mailPayload(config,{kind:'verify',address:config.testRecipients[0],url:origin+'/account/index.html#verify=ab&"<'});assert.match(p.html,/&amp;&quot;&lt;/);const status=JSON.stringify(a.mail.status());for(const value of [config.apiKey,config.from,config.testRecipients[0],'#verify='])assert.ok(!status.includes(value));
 });
 await fs.mkdir('output/playwright/email-v0.19',{recursive:true});await fs.writeFile('output/playwright/email-v0.19/delivery.json',JSON.stringify({status:'passed',at:new Date().toISOString(),checks,provider:'Resend',transport:'injected provider responses; no external mail sent',actualInboxDelivery:false},null,2)+'\n');
}finally{await restored?.mail.close();restored?.close();await a?.mail.close();await r?.close();a?.close();await fs.rm(dir,{recursive:true,force:true});}
