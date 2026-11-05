import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const ADDRESS=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const address=value=>typeof value==='string'&&value.length<=254&&ADDRESS.test(value);
const html=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const error=(message,status=503)=>Object.assign(Error(message),{status});

async function privateFile(file){
 if(!path.isAbsolute(file))throw Error('Mail configuration and key paths must be absolute');
 const s=await fs.lstat(file);
 if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)||s.size>16384)throw Error('Mail configuration and keys must be private regular files (chmod 600)');
 return fs.readFile(file,'utf8');
}

// No endpoint override or client-supplied origin. Test transports are injected
// only through the class constructor, never environment or public HTTP input.
export async function loadMailConfig({origin,local=false,env=process.env}){
 if(!env.HI_MAIL_CONFIG)return {mode:local?'outbox':'disabled'};
 const c=JSON.parse(await privateFile(env.HI_MAIL_CONFIG));
 if(c.provider==='disabled')return {mode:'disabled'};
 if(c.provider!=='resend'||!address(c.from)||!address(c.replyTo))throw Error('Choose Resend and valid from/replyTo addresses');
 const u=new URL(origin);if(u.origin!==origin||u.username||u.password||!(u.protocol==='https:'||local&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('Mail links require the exact server origin (HTTPS, or explicit loopback rehearsal)');
 const recipients=c.testRecipients||[];
 if(!Array.isArray(recipients)||recipients.length>10||recipients.some(v=>!address(v))||local&&!recipients.length)throw Error('Local real-mail tests require 1–10 explicit testRecipients');
 const apiKey=(await privateFile(c.apiKeyFile)).trim();
 if(!/^re_[A-Za-z0-9_-]{8,200}$/.test(apiKey))throw Error('Invalid Resend key file');
 return {mode:'resend',from:c.from.toLowerCase(),replyTo:c.replyTo.toLowerCase(),apiKey,testRecipients:recipients.map(x=>x.toLowerCase()),origin};
}

export function mailPayload(config,{kind,address,url}){
 const verify=kind==='verify',title=verify?'Confirm your email':'Reset your password';
 const copy=verify?'Confirm this recovery address to protect your commander account and play for your faction.':'Use this link to choose a new password. This will sign out your other sessions.';
 const footer='This link expires in 30 minutes and works once. If you did not request it, ignore this email. Your account stays unchanged.';
 return {from:`Hostile Inference <${config.from}>`,to:[address],reply_to:config.replyTo,subject:`${title} · Hostile Inference`,text:`HOSTILE INFERENCE\n\n${title}\n\n${copy}\n\n${url}\n\n${footer}`,html:`<!doctype html><html lang="en"><body style="margin:0;background:#eeece2;color:#20372d;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fffdf4;border-top:5px solid #d8795f"><p style="font-size:13px;letter-spacing:2px">HOSTILE INFERENCE</p><h1 style="font-size:30px;line-height:1.15">${title}</h1><p style="font-size:17px;line-height:1.6">${copy}</p><p style="margin:32px 0"><a href="${html(url)}" style="display:inline-block;background:#20372d;color:#fffdf4;padding:16px 24px;font-size:17px;text-decoration:none">${title} →</a></p><p style="font-size:15px;line-height:1.6">${footer}</p><p style="font-size:13px;overflow-wrap:anywhere">Or open this link:<br><a href="${html(url)}">${html(url)}</a></p></main></body></html>`};
}

export function initMailSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS mail_delivery(
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),token_hash TEXT NOT NULL,
  payload TEXT,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,provider_id TEXT,last_error TEXT);
  CREATE INDEX IF NOT EXISTS mail_due ON mail_delivery(state,next_at);
  CREATE TRIGGER IF NOT EXISTS revoke_mail_delivery AFTER DELETE ON mail_tokens BEGIN
   UPDATE mail_delivery SET payload=NULL,state='cancelled',last_error=NULL WHERE token_hash=OLD.hash AND state IN ('queued','sending','retry','failed');
  END;
  INSERT OR IGNORE INTO schema_version VALUES(4);`);
}

export class MailDelivery {
 constructor(accounts,config,{fetchImpl=fetch,timeoutMs=10000}={}){this.accounts=accounts;this.config=config;this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.stopped=false;this.task=null;this.timer=null;this.lastError=null;
  // A crash may leave an ambiguous provider acknowledgement. Reuse the exact
  // persisted payload and idempotency key, within the token's 30-minute life.
  accounts.db.prepare("UPDATE mail_delivery SET state='retry' WHERE state='sending'").run();
 }
 allowed(address){return !this.config.testRecipients?.length||this.config.testRecipients.includes(address);}
 enqueue({userId,hash,kind,address,url,expires}){
  if(!this.allowed(address))throw error('Local email testing is restricted to the configured test inbox.');
  if(this.accounts.db.prepare("SELECT COUNT(*) n FROM mail_delivery WHERE state IN ('queued','sending','retry')").get().n>=100)throw error('Email service is busy. Try again shortly.');
  this.accounts.db.prepare('INSERT INTO mail_delivery(id,user_id,token_hash,payload,state,next_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),userId,hash,JSON.stringify(mailPayload(this.config,{kind,address,url})),'queued',this.accounts.now(),expires,this.accounts.now());
 }
 start(){if(this.config.mode!=='resend'||this.timer)return;this.timer=setInterval(()=>{this.pump().catch(()=>{this.lastError='local_storage_failure';});},1000);this.timer.unref();}
 pump(){if(this.task)return this.task;if(this.stopped||this.config.mode!=='resend')return Promise.resolve();this.task=this.deliverOne().finally(()=>{this.task=null;});return this.task;}
 async deliverOne(){
  const a=this.accounts,db=a.db,now=a.now();a.pruneSafety();
  if(a.operationState().mailAdmission==='paused')return;
  const job=db.prepare("SELECT * FROM mail_delivery WHERE state IN ('queued','retry') AND next_at<=? AND expires_at>? ORDER BY created_at,id LIMIT 1").get(now,now);if(!job)return;
  const token=db.prepare('SELECT 1 FROM mail_tokens WHERE hash=? AND expires_at>?').get(job.token_hash,now);
  if(!token||a.safety(job.user_id)?.status!=='active'){db.prepare("UPDATE mail_delivery SET state='cancelled',payload=NULL WHERE id=?").run(job.id);return;}
  const payload=JSON.parse(job.payload);
  // Changing local test recipients must never release old queued mail to an
  // unintended inbox. Operator configuration changes require fresh requests.
  if(!this.allowed(payload.to[0])||!payload.text.includes(this.config.origin+'/account/index.html#')){db.prepare("UPDATE mail_delivery SET state='cancelled',payload=NULL,last_error='configuration_changed' WHERE id=?").run(job.id);return;}
  db.prepare("UPDATE mail_delivery SET state='sending',attempts=attempts+1 WHERE id=?").run(job.id);
  this.controller=new AbortController();const timeout=setTimeout(()=>this.controller.abort(),this.timeoutMs);timeout.unref();
  let retry=true,code='network_error',delay=0,providerId=null;
  try{
   const response=await this.fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+this.config.apiKey,'Content-Type':'application/json','Idempotency-Key':'hi-auth/'+job.id},body:job.payload,signal:this.controller.signal});
   const body=await response.json().catch(()=>null);
   if(response.ok&&typeof body?.id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(body.id))providerId=body.id;
   else{code='provider_'+response.status;retry=response.status===408||response.status===429||response.status>=500||response.ok||response.status===409&&body?.name==='concurrent_idempotent_requests';
    const after=response.headers.get('retry-after');const seconds=Number(after);delay=after?(Number.isFinite(seconds)?seconds*1000:Date.parse(after)-Date.now()):0;
   }
  }catch{code=this.controller.signal.aborted?'request_timeout':'network_error';}
  finally{clearTimeout(timeout);this.controller=null;}
  // Consuming/replacing a token while delivery is in flight cancels this job.
  if(db.prepare('SELECT state FROM mail_delivery WHERE id=?').get(job.id)?.state!=='sending')return;
  if(providerId){db.prepare("UPDATE mail_delivery SET state='accepted',payload=NULL,provider_id=?,last_error=NULL WHERE id=?").run(providerId,job.id);this.lastError=null;return;}
  const attempts=job.attempts+1,next=a.now()+Math.max(1000,Math.min(30*60000,Number.isFinite(delay)?delay:0),Math.min(60000,2000*2**(attempts-1)));
  const pending=retry&&attempts<6&&next<job.expires_at;
  db.prepare('UPDATE mail_delivery SET state=?,next_at=?,last_error=?,payload=CASE WHEN ? THEN payload ELSE NULL END WHERE id=?').run(pending?'retry':'failed',next,code,pending?1:0,job.id);this.lastError=code;
 }
 status(){return {mode:this.config.mode,admission:this.accounts.operationState().mailAdmission||'open',states:Object.fromEntries(this.accounts.db.prepare('SELECT state,COUNT(*) n FROM mail_delivery GROUP BY state').all().map(x=>[x.state,x.n])),lastError:this.lastError};}
 async close(){this.stopped=true;clearInterval(this.timer);this.controller?.abort();await this.task;}
}
