import {initMailSchema} from './mail-delivery.mjs';
import {randomBytes,randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';

const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message,code)=>{const e=Error(message);e.status=status;if(code)e.code=code;throw e;};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const email=value=>{if(typeof value!=='string'||value.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail(400,'Enter a valid recovery email address.');return value.trim().toLowerCase();};
const fields=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(body,k)))fail(400,'Invalid request fields.');};
export const GENERIC_RECOVERY='If that account has a verified recovery address, a reset link has been requested. Check your inbox and spam folder. It may take a few minutes.';

export class AccountSafety {
 initSafety(){
  this.db.exec(`
   CREATE TABLE IF NOT EXISTS user_safety(user_id TEXT PRIMARY KEY REFERENCES users(id),status TEXT NOT NULL DEFAULT 'active',email TEXT,email_verified_at INTEGER,deleted_at INTEGER,public_id TEXT UNIQUE);
   INSERT OR IGNORE INTO user_safety(user_id,public_id) SELECT id,lower(hex(randomblob(16))) FROM users;
   CREATE TRIGGER IF NOT EXISTS safety_new_user AFTER INSERT ON users BEGIN INSERT OR IGNORE INTO user_safety(user_id,public_id) VALUES(NEW.id,lower(hex(randomblob(16)))); END;
   CREATE UNIQUE INDEX IF NOT EXISTS unique_verified_email ON user_safety(email) WHERE email_verified_at IS NOT NULL AND status!='deleted';
   CREATE TABLE IF NOT EXISTS mail_tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,email TEXT NOT NULL,expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS mail_outbox(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,address TEXT NOT NULL,url TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS player_reports(id TEXT PRIMARY KEY,reporter_id TEXT REFERENCES users(id),target_id TEXT REFERENCES users(id),reason TEXT NOT NULL,detail TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS moderation_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS leaderboard_eligible ON account_matches(season,status,user_id);
   INSERT OR IGNORE INTO schema_version VALUES(3);
   INSERT OR IGNORE INTO operations_state VALUES('standingsRevision','0');
   CREATE TRIGGER IF NOT EXISTS standings_matches_insert AFTER INSERT ON account_matches BEGIN UPDATE operations_state SET value=json_quote(lower(hex(randomblob(16)))) WHERE key='standingsRevision'; END;
   CREATE TRIGGER IF NOT EXISTS standings_matches_update AFTER UPDATE OF status,result ON account_matches WHEN NEW.status='verified' OR OLD.status='verified' BEGIN UPDATE operations_state SET value=json_quote(lower(hex(randomblob(16)))) WHERE key='standingsRevision'; END;
   CREATE TRIGGER IF NOT EXISTS standings_matches_delete AFTER DELETE ON account_matches BEGIN UPDATE operations_state SET value=json_quote(lower(hex(randomblob(16)))) WHERE key='standingsRevision'; END;
   CREATE TRIGGER IF NOT EXISTS standings_profiles AFTER UPDATE OF callsign ON users BEGIN UPDATE operations_state SET value=json_quote(lower(hex(randomblob(16)))) WHERE key='standingsRevision'; END;
   CREATE TRIGGER IF NOT EXISTS standings_safety AFTER UPDATE OF status ON user_safety BEGIN UPDATE operations_state SET value=json_quote(lower(hex(randomblob(16)))) WHERE key='standingsRevision'; END;
   CREATE TRIGGER IF NOT EXISTS standings_members AFTER UPDATE ON memberships BEGIN UPDATE operations_state SET value=json_quote(lower(hex(randomblob(16)))) WHERE key='standingsRevision'; END;

  `);
  initMailSchema(this.db);
  let state=this.operationState();if(!state.abuseKey){this.setOperationState({abuseKey:randomBytes(32).toString('hex')});state=this.operationState();}this.abuseKey=state.abuseKey;
  this.pruneSafety();
 }
 pruneSafety(){
  const at=this.now();if(this.lastSafetySweep&&at-this.lastSafetySweep<60000)return;this.lastSafetySweep=at;
  this.db.prepare('DELETE FROM mail_tokens WHERE expires_at<=?').run(at);this.db.prepare('DELETE FROM mail_delivery WHERE created_at<?').run(at-7*86400000);this.db.prepare('DELETE FROM mail_outbox WHERE expires_at<=?').run(at);
  this.db.prepare('DELETE FROM player_reports WHERE created_at<?').run(at-90*86400000);
  this.db.prepare('DELETE FROM moderation_events WHERE created_at<?').run(at-90*86400000);
 }
 sourceKey(source){return createHmac('sha256',this.abuseKey).update(source||'direct-local').digest('hex');}
 authLimit(route,name,source='direct-local'){
  this.pruneSafety();const key=this.sourceKey(source);
  this.limit('source:'+route+':'+key,route==='signup'?5:route==='recover'?16:60,route==='signup'?3600000:900000);
  this.limit('identity:'+route+':'+key+':'+name,route==='signup'?5:route==='recover'?8:12);
  // Account-wide guessing budget bounds distributed attacks; it does not spend
  // the unrelated-player budget used by the old global-auth limiter.
  if(route!=='signup')this.limit('account:'+route+':'+name,100,900000);
 }
 safety(id){return this.db.prepare('SELECT * FROM user_safety WHERE user_id=?').get(id);}
 assertActive(id){if(this.safety(id)?.status!=='active')fail(403,'This account cannot play ranked operations. Contact support from your account.');}
 assertRanked(id){this.assertActive(id);if(this.requireVerifiedEmail&&!this.safety(id).email_verified_at)fail(403,'Verify your recovery email from Account access before playing for your faction. Practice remains available.');}
 async confirmPassword(id,value){
  if(typeof value!=='string'||value.length<12||value.length>128)fail(401,'Password is incorrect.','reauthentication');
  const u=this.db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!u||!same(await this.hash(value,u.salt),u.password_hash))fail(401,'Password is incorrect.','reauthentication');
  const current=this.db.prepare('SELECT password_hash FROM users WHERE id=?').get(id);if(current.password_hash!==u.password_hash||this.safety(id)?.status==='deleted')fail(401,'Account credentials changed. Sign in again.');
 }
 mailToken(id,kind,address){
  if(!['outbox','resend'].includes(this.mailMode))fail(503,'Recovery email is not configured. Keep your recovery code safe.');
  const token=randomBytes(32).toString('hex'),expires=this.now()+30*60000;
  this.db.prepare('DELETE FROM mail_tokens WHERE user_id=? AND kind=?').run(id,kind);this.db.prepare('DELETE FROM mail_outbox WHERE user_id=? AND kind=?').run(id,kind);
  this.db.prepare('INSERT INTO mail_tokens VALUES(?,?,?,?,?)').run(sha(token),id,kind,address,expires);
  const url=this.origin+'/account/index.html#'+kind+'='+token;
  if(this.mailMode==='resend'){this.limit('mail-recipient:'+this.sourceKey(address),5,3600000);this.limit('mail-total',100,3600000);this.mail.enqueue({userId:id,hash:sha(token),kind,address,url,expires});}
  else this.db.prepare('INSERT INTO mail_outbox VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,kind,address,url,this.now(),expires);
 }
 async setEmail(id,body){fields(body,['email','password']);const address=email(body.email);this.limit('email:'+id,5,3600000);await this.confirmPassword(id,body.password);this.assertActive(id);
  this.transaction(()=>{if(!this.safety(id).email_verified_at)this.db.prepare('UPDATE user_safety SET email=?,email_verified_at=NULL WHERE user_id=?').run(address,id);this.db.prepare('DELETE FROM mail_tokens WHERE user_id=?').run(id);this.db.prepare('DELETE FROM mail_outbox WHERE user_id=?').run(id);this.mailToken(id,'verify',address);});return {ok:true,message:this.mailMode==='outbox'?'Verification link prepared. Local rehearsal keeps it in the private operator outbox; no email has been sent.':'Verification email queued. Check your inbox and spam folder. The link expires in 30 minutes.'};
 }
 verifyEmail(body){fields(body,['token']);if(typeof body.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token))fail(400,'This link is invalid or expired.');return this.transaction(()=>{
  const t=this.db.prepare("SELECT * FROM mail_tokens WHERE hash=? AND kind='verify' AND expires_at>?").get(sha(body.token),this.now());
  if(!t||this.safety(t.user_id)?.status!=='active')fail(400,'This link is invalid or expired.');
  if(this.db.prepare('SELECT 1 FROM user_safety WHERE email=? AND email_verified_at IS NOT NULL AND user_id!=?').get(t.email,t.user_id))fail(409,'That address is already attached to an account.');
  this.db.prepare('UPDATE user_safety SET email=?,email_verified_at=? WHERE user_id=?').run(t.email,this.now(),t.user_id);this.db.prepare('DELETE FROM mail_tokens WHERE hash=?').run(t.hash);this.db.prepare("DELETE FROM mail_outbox WHERE user_id=? AND kind='verify'").run(t.user_id);return {ok:true};
 });}
 requestReset(body,source){fields(body,['username','email']);this.authLimit('recover',String(body.username).toLowerCase(),source);const address=email(body.email);if(typeof body.username!=='string'||body.username.length>24)fail(400,'Invalid username.');
  // Same public response for missing, suspended, unverified or mismatched users.
  const u=this.db.prepare("SELECT u.id,s.email FROM users u JOIN user_safety s ON s.user_id=u.id WHERE u.username=? AND s.email=? AND s.email_verified_at IS NOT NULL AND s.status='active'").get(body.username.toLowerCase(),address);
  if(u&&['outbox','resend'].includes(this.mailMode)){try{this.transaction(()=>this.mailToken(u.id,'reset',u.email));}catch(e){if(![429,503].includes(e.status))throw e;}}return {ok:true,message:GENERIC_RECOVERY+(this.mailMode==='outbox'?' Local rehearsal uses the private operator outbox; no email is sent.':this.mailMode==='disabled'?' Email delivery is not configured on this server; use your saved recovery code.':'')};
 }
 async resetEmail(body){fields(body,['token','password']);if(typeof body.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token))fail(400,'This link is invalid or expired.');if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)fail(400,'Use a password with 12–128 characters.');
  const t=this.db.prepare("SELECT * FROM mail_tokens WHERE hash=? AND kind='reset' AND expires_at>?").get(sha(body.token),this.now());if(!t||this.safety(t.user_id)?.status!=='active')fail(400,'This link is invalid or expired.');
  const salt=randomBytes(16).toString('hex'),encoded=await this.hash(body.password,salt),recoveryCode=randomBytes(20).toString('hex');
  return this.transaction(()=>{if(!this.db.prepare('SELECT 1 FROM mail_tokens WHERE hash=? AND expires_at>?').get(t.hash,this.now())||this.safety(t.user_id)?.status!=='active')fail(400,'This link is invalid or expired.');
   this.db.prepare('UPDATE users SET password_hash=?,salt=?,recovery_hash=? WHERE id=?').run(encoded,salt,sha(recoveryCode),t.user_id);this.logoutAll(t.user_id);this.db.prepare('DELETE FROM mail_tokens WHERE user_id=?').run(t.user_id);this.db.prepare('DELETE FROM mail_outbox WHERE user_id=?').run(t.user_id);
   return {user:this.profile(t.user_id),token:this.createSession(t.user_id),recoveryCode};});
 }
 async deleteAccount(id,body){fields(body,['password','confirmation']);if(body.confirmation!=='DELETE')fail(400,'Type DELETE to confirm.');this.limit('delete:'+id,5);await this.confirmPassword(id,body.password);
  return this.transaction(()=>{
   if(this.db.prepare("SELECT 1 FROM account_matches WHERE user_id=? AND status IN ('issued','active','verifying','verification_failed')").get(id))fail(409,'Finish or abandon your operation before deleting your account. Pending verification must settle first.');
   this.logoutAll(id);this.db.prepare('UPDATE users SET username=?,callsign=?,password_hash=?,salt=?,recovery_hash=? WHERE id=?').run('deleted_'+id,'Deleted player','',randomBytes(16).toString('hex'),'',id);
   this.db.prepare("UPDATE user_safety SET status='deleted',email=NULL,email_verified_at=NULL,deleted_at=? WHERE user_id=?").run(this.now(),id);
   this.db.prepare('DELETE FROM mail_tokens WHERE user_id=?').run(id);this.db.prepare('DELETE FROM mail_outbox WHERE user_id=?').run(id);this.db.prepare('DELETE FROM player_reports WHERE reporter_id=? OR target_id=?').run(id,id);this.db.prepare('DELETE FROM moderation_events WHERE user_id=?').run(id);return {ok:true};
  });
 }
 report(id,body){fields(body,['target','reason','detail']);this.assertActive(id);if(!['callsign','suspected-abuse','help'].includes(body.reason)||typeof body.detail!=='string'||body.detail.length<5||body.detail.length>1000)fail(400,'Choose a reason and write 5–1,000 characters.');
  const target=body.reason==='help'?null:this.db.prepare('SELECT user_id FROM user_safety WHERE public_id=?').get(body.target)?.user_id;if(target===id||target&&!this.db.prepare("SELECT 1 FROM user_safety WHERE user_id=? AND status!='deleted'").get(target)||body.reason!=='help'&&!target)fail(400,'Choose an available player.');
  this.limit('reports:'+id,5,86400000);const reportId=randomUUID();this.db.prepare('INSERT INTO player_reports VALUES(?,?,?,?,?,?,?)').run(reportId,id,target,body.reason,body.detail,'open',this.now());return {ok:true,id:reportId};
 }
 moderate({id,action,reason,callsign}){
  if(!['suspend','restore','rename'].includes(action)||typeof reason!=='string'||reason.length<5||reason.length>500)fail(400,'Choose suspend, restore or rename and supply a reason (5–500 characters).');
  if(!this.safety(id)||this.safety(id).status==='deleted')fail(404,'Account unavailable.');
  if(action==='rename'&&(typeof callsign!=='string'||callsign.length<2||callsign.length>24||! /^[\p{L}\p{N} ._'-]+$/u.test(callsign)))fail(400,'Invalid callsign.');
  return this.transaction(()=>{
   if(action==='rename')this.db.prepare('UPDATE users SET callsign=? WHERE id=?').run(callsign,id);else this.db.prepare('UPDATE user_safety SET status=? WHERE user_id=?').run(action==='suspend'?'suspended':'active',id);
   if(action==='suspend'){this.logoutAll(id);this.db.prepare('DELETE FROM mail_tokens WHERE user_id=?').run(id);this.db.prepare('DELETE FROM mail_outbox WHERE user_id=?').run(id);}
   this.db.prepare('INSERT INTO moderation_events VALUES(?,?,?,?,?)').run(randomUUID(),id,action,reason,this.now());return {id,action,status:this.safety(id).status};
  });
 }
 safetyStatus(){this.pruneSafety();return {mailMode:this.mailMode,requireVerifiedEmail:this.requireVerifiedEmail,signups:this.operationState().signups||'open',publication:this.operationState().publication||'open',openReports:this.db.prepare("SELECT COUNT(*) AS n FROM player_reports WHERE state='open'").get().n,hashing:this.hashing,hashLimit:2,delivery:this.mail?.status()};}
}
