import {MailDelivery} from './mail-delivery.mjs';
import {AccountSafety} from './account-safety.mjs';
import {clientSource} from './client-source.mjs';
import {allowedRequest, requestPolicy} from './http-policy.mjs';
import {lockStorage} from './storage-lock.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {exact,FACTION_IDS} from '../game/demo/ranked-protocol.js';

export const ACCOUNT_VERSION=1,SEASON='local-season-zero',COOKIE='hi_session';
const DAY=86400000,scrypt=promisify(derive),sha=value=>createHash('sha256').update(value).digest('hex');
export const accountError=(status,message)=>{const e=Error(message);e.status=status;throw e;};
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const username=value=>{if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{3,24}$/.test(value))accountError(400,'Use 3–24 letters, numbers, underscores or hyphens for your username.');return value.toLowerCase();};
const password=value=>{if(typeof value!=='string'||value.length<12||value.length>128)accountError(400,'Use a password with 12–128 characters.');return value;};
const callsign=value=>{if(typeof value!=='string'||value.trim().length<2||value.trim().length>24||! /^[\p{L}\p{N} ._'-]+$/u.test(value.trim()))accountError(400,'Use a callsign with 2–24 letters, numbers, spaces or . _ - apostrophes.');return value.trim();};
const faction=value=>{if(!FACTION_IDS.includes(value))accountError(400,'Choose one of the three laboratories.');return value;};
export class Accounts extends AccountSafety {
 constructor({file=fileURLToPath(new URL('../.runtime/accounts/accounts.sqlite',import.meta.url)),now=()=>Date.now(),mailMode='outbox',mailConfig=null,mailOptions={},origin='http://127.0.0.1:4178',requireVerifiedEmail=false}={}){super();Object.assign(this,{file,now,mailMode,origin,requireVerifiedEmail});this.hashing=0;this.mailConfig=mailConfig||{mode:mailMode};this.mailMode=this.mailConfig.mode;this.mailOptions=mailOptions;}
 async init(){
  await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});this.file=await fs.realpath(this.file).catch(e=>{if(e.code!=='ENOENT')throw e;return fs.realpath(path.dirname(this.file)).then(parent=>path.join(parent,path.basename(this.file)));});this.unlock=lockStorage(this.file);try{this.db=new DatabaseSync(this.file);await fs.chmod(this.file,0o600);
  const existing=this.db.prepare("SELECT name FROM sqlite_master WHERE name='schema_version'").get();
  if(existing&&this.db.prepare('SELECT MAX(version) AS n FROM schema_version').get().n>4)throw Error('Storage schema is newer than this server; use a compatible release');
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
   INSERT OR IGNORE INTO schema_version VALUES(1);
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,callsign TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,recovery_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS session_owner ON sessions(user_id);
   CREATE TABLE IF NOT EXISTS memberships(user_id TEXT NOT NULL REFERENCES users(id),season TEXT NOT NULL,faction TEXT NOT NULL CHECK(faction IN ('misanthropic','closed','broke')),locked_at INTEGER,PRIMARY KEY(user_id,season));
   CREATE TABLE IF NOT EXISTS account_matches(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),season TEXT NOT NULL,ticket TEXT NOT NULL,status TEXT NOT NULL,issued_at INTEGER NOT NULL,result TEXT,settled_at INTEGER);
   CREATE UNIQUE INDEX IF NOT EXISTS one_active_match ON account_matches(user_id) WHERE status IN ('issued','active','verifying');
   CREATE UNIQUE INDEX IF NOT EXISTS one_pending_match ON account_matches(user_id) WHERE status IN ('issued','active','verifying','verification_failed');
   CREATE INDEX IF NOT EXISTS match_history ON account_matches(user_id,issued_at DESC);
   CREATE INDEX IF NOT EXISTS match_start_time ON account_matches(issued_at);
   CREATE INDEX IF NOT EXISTS match_history_page ON account_matches(user_id,issued_at DESC,id DESC);
   CREATE INDEX IF NOT EXISTS match_state ON account_matches(status,issued_at,id);
   CREATE TABLE IF NOT EXISTS account_events(match_id TEXT NOT NULL REFERENCES account_matches(id),position INTEGER NOT NULL,event TEXT NOT NULL,PRIMARY KEY(match_id,position));
   CREATE INDEX IF NOT EXISTS match_event_type ON account_events(match_id,json_extract(event,'$.type'),position DESC);
   CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS match_event_keys(match_id TEXT NOT NULL REFERENCES account_matches(id),event_id TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(match_id,event_id));
   CREATE TABLE IF NOT EXISTS operations_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   INSERT OR IGNORE INTO schema_version VALUES(2);
  `);this.initSafety();this.mail=new MailDelivery(this,this.mailConfig,this.mailOptions);return this;}catch(e){this.db?.close();this.unlock();throw e;}
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 limit(key,max,window=900000){const at=this.now(),id=sha(key);if(!this.lastLimitSweep||at-this.lastLimitSweep>60000){this.db.prepare('DELETE FROM auth_limits WHERE window < ?').run(at-86400000);this.lastLimitSweep=at;}const r=this.db.prepare('SELECT * FROM auth_limits WHERE key=?').get(id);if(r&&r.window>at-window&&r.count>=max){const e=Error('Too many attempts. Try again later.');e.status=429;e.retryAfter=Math.max(1,Math.ceil((r.window+window-at)/1000));throw e;}if(!r&&this.db.prepare('SELECT COUNT(*) AS n FROM auth_limits').get().n>=50000){const e=Error('Account service is busy. Try again shortly.');e.status=503;e.retryAfter=5;throw e;}this.db.prepare('INSERT INTO auth_limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=excluded.count').run(id,r&&r.window>at-window?r.window:at,r&&r.window>at-window?r.count+1:1);}

 async hash(value,salt){if(this.hashing>=2)accountError(429,'Account service is busy. Try again shortly.');this.hashing++;try{return (await scrypt(value,salt,64,{N:131072,r:8,p:1,maxmem:192*1024*1024})).toString('hex');}finally{this.hashing--;}}
 profile(id){const u=this.db.prepare('SELECT id,username,callsign,created_at FROM users WHERE id=?').get(id);if(!u)accountError(401,'Sign in to your account.');const m=this.db.prepare('SELECT season,faction,locked_at FROM memberships WHERE user_id=? AND season=?').get(id,SEASON);return {id:u.id,username:u.username,callsign:u.callsign,createdAt:u.created_at,safety:{status:this.safety(id)?.status||'active',email:this.safety(id)?.email||null,emailVerified:!!this.safety(id)?.email_verified_at,pendingEmail:this.db.prepare("SELECT email FROM mail_tokens WHERE user_id=? AND kind='verify' AND expires_at>?").get(id,this.now())?.email||null,required:this.requireVerifiedEmail,mailMode:this.mailMode,delivery:this.db.prepare("SELECT d.state FROM mail_delivery d JOIN mail_tokens t ON t.hash=d.token_hash WHERE d.user_id=? AND t.kind='verify' ORDER BY d.created_at DESC LIMIT 1").get(id)?.state||null},membership:m?{season:m.season,faction:m.faction,lockedAt:m.locked_at}:null};}
 session(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;const hash=sha(token),s=this.db.prepare('SELECT * FROM sessions WHERE hash=?').get(hash),now=this.now();if(!s||this.safety(s.user_id)?.status!=='active')return null;if(s.expires_at<=now||s.last_seen<=now-7*DAY){this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash);return null;}if(now-s.last_seen>60000)this.db.prepare('UPDATE sessions SET last_seen=? WHERE hash=?').run(now,hash);return {id:s.user_id,hash};}
 createSession(id){const token=randomBytes(32).toString('hex'),now=this.now();this.db.prepare('DELETE FROM sessions WHERE expires_at<=? OR last_seen<=?').run(now,now-7*DAY);this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(sha(token),id,now,now+30*DAY,now);this.db.prepare('DELETE FROM sessions WHERE user_id=? AND hash NOT IN (SELECT hash FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 10)').run(id,id);return token;}
 async signup(body,oldToken,source){exact(body,['username','password','callsign','faction']);const name=username(body.username),pass=password(body.password),display=callsign(body.callsign),team=faction(body.faction);if(this.operationState().signups==='paused')accountError(503,'New sign-ups are temporarily paused. Existing players can still sign in.');this.authLimit('signup',name,source);const salt=randomBytes(16).toString('hex'),encoded=await this.hash(pass,salt),recovery=randomBytes(20).toString('hex'),id=randomUUID();
  return this.transaction(()=>{if(this.db.prepare('SELECT 1 FROM users WHERE username=?').get(name))accountError(409,'That username is unavailable. Choose another.');this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,name,display,encoded,salt,sha(recovery),this.now());this.db.prepare('INSERT OR IGNORE INTO user_safety(user_id) VALUES(?)').run(id);this.db.prepare('INSERT INTO memberships VALUES(?,?,?,NULL)').run(id,SEASON,team);if(oldToken)this.logout(oldToken);return {user:this.profile(id),token:this.createSession(id),recoveryCode:recovery};});
 }
 async login(body,oldToken,source){exact(body,['username','password']);const name=username(body.username);password(body.password);this.authLimit('login',name,source);const user=this.db.prepare('SELECT * FROM users WHERE username=?').get(name),hash=await this.hash(body.password,user?.salt||'00000000000000000000000000000000');if(!user||!equal(hash,user.password_hash)||this.safety(user.id)?.status!=='active')accountError(401,'Username or password is incorrect.');return this.transaction(()=>{const current=this.db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);if(current.password_hash!==user.password_hash||this.safety(user.id)?.status!=='active')accountError(401,'Credentials changed. Sign in again.');if(oldToken)this.logout(oldToken);return {user:this.profile(user.id),token:this.createSession(user.id)};});}
 logout(token){if(typeof token==='string')this.db.prepare('DELETE FROM sessions WHERE hash=?').run(sha(token));}
 logoutAll(id){this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);}
 chooseFaction(id,body){exact(body,['faction']);const choice=faction(body.faction);return this.transaction(()=>{const p=this.profile(id);if(p.membership.lockedAt!==null&&p.membership.faction!==choice)accountError(409,'Your faction is locked for Local Season Zero. Practice can use any faction.');if(this.db.prepare("SELECT 1 FROM account_matches WHERE user_id=? AND status IN ('issued','active','verifying','verification_failed')").get(id)&&p.membership.faction!==choice)accountError(409,'Finish or abandon your current verified run before changing faction.');this.db.prepare('UPDATE memberships SET faction=? WHERE user_id=? AND season=?').run(choice,id,SEASON);return this.profile(id);});}
 async recover(body,_oldToken,source){exact(body,['username','recoveryCode','password']);const name=username(body.username);password(body.password);this.authLimit('recover',name,source);const u=this.db.prepare('SELECT * FROM users WHERE username=?').get(name);if(typeof body.recoveryCode!=='string'||body.recoveryCode.length>100||!u||this.safety(u.id)?.status!=='active'||!equal(sha(body.recoveryCode.trim().toLowerCase()),u.recovery_hash))accountError(401,'Username or recovery code is incorrect.');const salt=randomBytes(16).toString('hex'),encoded=await this.hash(body.password,salt),recoveryCode=randomBytes(20).toString('hex');return this.transaction(()=>{if(this.db.prepare('SELECT recovery_hash FROM users WHERE id=?').get(u.id).recovery_hash!==u.recovery_hash||this.safety(u.id)?.status!=='active')accountError(401,'Recovery code was already used.');this.db.prepare('UPDATE users SET password_hash=?,salt=?,recovery_hash=? WHERE id=?').run(encoded,salt,sha(recoveryCode),u.id);this.logoutAll(u.id);this.db.prepare('DELETE FROM mail_tokens WHERE user_id=?').run(u.id);this.db.prepare('DELETE FROM mail_outbox WHERE user_id=?').run(u.id);return {user:this.profile(u.id),token:this.createSession(u.id),recoveryCode};});}
 issueMatch(m,confirmFaction){this.assertRanked(m.ownerId);return this.transaction(()=>{const p=this.profile(m.ownerId);if(p.membership.faction!==m.config.faction)accountError(409,'Your verified faction is '+p.membership.faction+'. Change your allegiance before starting.');if(p.membership.lockedAt===null&&confirmFaction!==true)accountError(409,'Confirm your faction commitment before your first verified run.');if(this.db.prepare("SELECT 1 FROM account_matches WHERE user_id=? AND status IN ('issued','active','verifying','verification_failed')").get(m.ownerId))accountError(409,'You already have a verified run. Reconnect from your account.');if(this.db.prepare('SELECT COUNT(*) AS n FROM account_matches WHERE user_id=? AND issued_at>?').get(m.ownerId,this.now()-3600000).n>=20)accountError(429,'Match start limit reached. Try again later.');this.db.prepare('INSERT INTO account_matches(id,user_id,season,ticket,status,issued_at) VALUES(?,?,?,?,?,?)').run(m.id,m.ownerId,SEASON,JSON.stringify(m),'issued',m.issuedAt);});}
 appendMatch(m,event){return this.transaction(()=>{
  if(event.eventId){const prior=this.db.prepare('SELECT event FROM account_events JOIN match_event_keys USING(match_id,position) WHERE match_id=? AND event_id=?').get(m.id,event.eventId);if(prior)return JSON.parse(prior.event);}
  const row=this.db.prepare('SELECT status FROM account_matches WHERE id=?').get(m.id);
  if(['verified','rejected','aborted'].includes(row?.status)){const committed=this.db.prepare("SELECT event FROM account_events WHERE match_id=? AND json_extract(event,'$.type') IN ('settled','abort') ORDER BY position DESC LIMIT 1").get(m.id);if(committed)return JSON.parse(committed.event);accountError(409,'A committed result is immutable');}
  if(event.type==='active'){const member=this.profile(m.ownerId).membership;if(member.faction!==m.config.faction)accountError(409,'Match faction no longer matches your membership.');this.db.prepare('UPDATE memberships SET locked_at=COALESCE(locked_at,?) WHERE user_id=? AND season=?').run(event.at,m.ownerId,SEASON);}
  const position=this.db.prepare('SELECT COALESCE(MAX(position)+1,0) AS n FROM account_events WHERE match_id=?').get(m.id).n;this.db.prepare('INSERT INTO account_events VALUES(?,?,?)').run(m.id,position,JSON.stringify(event));
  if(event.eventId)this.db.prepare('INSERT INTO match_event_keys VALUES(?,?,?)').run(m.id,event.eventId,position);
  const status={active:'active',submit:'verifying',abort:'aborted',settled:event.ok?'verified':'rejected',job:event.job?.state==='failed'?'verification_failed':'verifying'}[event.type];if(status)this.db.prepare('UPDATE account_matches SET status=?,result=?,settled_at=? WHERE id=?').run(status,event.type==='settled'&&event.ok?JSON.stringify(event.result):null,event.type==='settled'?event.at:null,m.id);
  return event;
 });}
 operationState(){return Object.fromEntries(this.db.prepare('SELECT key,value FROM operations_state').all().map(r=>[r.key,JSON.parse(r.value)]));}
 setOperationState(values){this.transaction(()=>{for(const [key,value]of Object.entries(values))this.db.prepare('INSERT INTO operations_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));});}
 // Completed journals remain immutable on disk. Only admitted live runs need
 // their action arrays restored; stream one journal at a time during recovery.
 *matchEvents(id){for(const row of this.db.prepare('SELECT event FROM account_events WHERE match_id=? ORDER BY position').iterate(id))yield JSON.parse(row.event);}
 *loadMatches(){for(const row of this.db.prepare("SELECT ticket FROM account_matches WHERE status IN ('issued','active','verifying') ORDER BY issued_at,id").iterate()){const ticket=JSON.parse(row.ticket);yield {ticket,events:this.matchEvents(ticket.id)};}}
 matchRecord(id){
  const row=this.db.prepare('SELECT ticket,status,result,settled_at FROM account_matches WHERE id=?').get(id);if(!row)return null;
  const latest=type=>{const e=this.db.prepare("SELECT event FROM account_events WHERE match_id=? AND json_extract(event,'$.type')=? ORDER BY position DESC LIMIT 1").get(id,type);return e?JSON.parse(e.event):null;};
  // Do not fetch/parse the last batch's actions just to show a history row.
  const batch=this.db.prepare("SELECT json_extract(event,'$.body.seq') AS seq,json_extract(event,'$.body.throughTick') AS tick FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='batch' ORDER BY position DESC LIMIT 1").get(id);
  const active=latest('active'),submit=latest('submit'),job=latest('job'),end=latest(row.status==='aborted'?'abort':'settled');
  return {...JSON.parse(row.ticket),status:row.status,seq:batch?batch.seq+1:0,throughTick:batch?.tick||0,startedAt:active?.at,deadline:active?active.at+900000:undefined,submittedAt:submit?.at,checkpoint:submit?.checkpoint,
   job:['verified','rejected'].includes(row.status)?{...job?.job,state:'complete'}:job?.job||(submit?{state:'queued',attempts:0,nextAttemptAt:submit.at}:undefined),result:row.result?JSON.parse(row.result):null,error:end?.error||end?.reason||null,settledAt:row.settled_at};
 }
 matchCommands(id){const actions=[];for(const row of this.db.prepare("SELECT event FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='batch' ORDER BY position").iterate(id))actions.push(...JSON.parse(row.event).body.actions);return actions;}
 matchBatch(id,seq){const row=this.db.prepare("SELECT event FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='batch' AND json_extract(event,'$.body.seq')=? ORDER BY position LIMIT 1").get(id,seq);return row?JSON.parse(row.event):null;}
 matchHistory(ownerId,ranked,offset){
  const rows=this.db.prepare('SELECT id FROM account_matches WHERE user_id=? ORDER BY issued_at DESC,id DESC LIMIT 25 OFFSET ?').all(ownerId,offset);
  const summary=this.db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status='verified'),0) AS verified,COALESCE(SUM(status='verified' AND json_extract(result,'$.outcome')='victory'),0) AS victories,MAX(CASE WHEN status='verified' AND json_extract(result,'$.outcome')='victory' THEN json_extract(result,'$.score') END) AS bestScore FROM account_matches WHERE user_id=?").get(ownerId);
  const active=this.db.prepare("SELECT id FROM account_matches WHERE user_id=? AND status IN ('issued','active','verifying','verification_failed') LIMIT 1").get(ownerId);
  return {matches:rows.map(r=>ranked.public(this.matchRecord(r.id))),total:summary.total,activeMatch:active?ranked.public(this.matchRecord(active.id)):null,summary:{verified:summary.verified,victories:summary.victories,bestScore:summary.bestScore}};
 }
 failedMatches(){const {count}=this.db.prepare("SELECT COUNT(*) AS count FROM account_matches WHERE status='verification_failed'").get();const rows=this.db.prepare("SELECT id FROM account_matches WHERE status='verification_failed' ORDER BY issued_at,id LIMIT 100").all();return {count,rows:rows.map(r=>this.matchRecord(r.id))};}
 recentMatchStarts(since){return this.db.prepare('SELECT COUNT(*) AS n FROM account_matches WHERE issued_at>?').get(since).n;}

 close(){if(this.db){this.db.close();this.db=null;this.unlock?.();this.unlock=null;}}
}

export function cookieToken(req){const cookie=req.headers.cookie||'';return cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||null;}
export const sessionCookie=(token,{secureCookies=false}={})=>`${COOKIE}=${token||''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?2592000:0}${secureCookies?'; Secure':''}`;
export function localRequest(req,port,header){if(!allowedRequest(req,port,header))accountError(403,'Same-origin local requests only.');}
export async function jsonBody(req,limit=4096){if(!req.headers['content-type']?.startsWith('application/json'))accountError(415,'JSON required.');let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>limit)accountError(413,'Request too large.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{accountError(400,'Invalid JSON.');}}
export function accountHandler(accounts,ranked,port){return async(req,res,url)=>{
 if(!url.pathname.startsWith('/api/account/'))return false;
 const send=(status,data,token)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(token!==undefined?{'Set-Cookie':sessionCookie(token,requestPolicy(port))}:{})});res.end(JSON.stringify(data));};
 try{localRequest(req,port,'local-accounts-v1');const route=url.pathname.slice('/api/account/'.length),source=clientSource(req,port),token=cookieToken(req),session=accounts.session(token);
  if(req.method==='GET'&&route==='me'){send(200,{version:ACCOUNT_VERSION,season:SEASON,mailMode:accounts.mailMode,requireVerifiedEmail:accounts.requireVerifiedEmail,user:session?accounts.profile(session.id):null});return true;}
  if(req.method==='POST'&&['signup','login','recover'].includes(route)){const result=await accounts[route](await jsonBody(req),token,source);send(200,{user:result.user,...(result.recoveryCode?{recoveryCode:result.recoveryCode}:{})},result.token);return true;}
  if(req.method==='POST'&&['verify-email','request-reset','reset-email'].includes(route)){accounts.limit('mail-route:'+accounts.sourceKey(source),30);const body=await jsonBody(req),result=route==='verify-email'?accounts.verifyEmail(body):route==='request-reset'?accounts.requestReset(body,source):await accounts.resetEmail(body);send(200,{...result,token:undefined},result.token);return true;}
  if(!session)accountError(401,'Sign in to your account.');
  if(req.method==='POST'&&['email','delete','report'].includes(route)){accounts.limit('account-action:'+session.id,30);const body=await jsonBody(req),result=route==='email'?await accounts.setEmail(session.id,body):route==='delete'?await accounts.deleteAccount(session.id,body):accounts.report(session.id,body);send(200,result,route==='delete'?null:undefined);return true;}

  if(req.method==='GET'&&route==='matches'){const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)accountError(400,'Invalid history page.');send(200,accounts.matchHistory(session.id,ranked,offset));return true;}
  if(req.method==='POST'&&route==='faction'){send(200,{user:accounts.chooseFaction(session.id,await jsonBody(req))});return true;}
  if(req.method==='POST'&&['logout','logout-all'].includes(route)){exact(await jsonBody(req),[]);route==='logout'?accounts.logout(token):accounts.logoutAll(session.id);send(200,{ok:true},null);return true;}
  accountError(404,'Account route unavailable.');
 }catch(e){if(e.status===429||e.status===503)res.setHeader('Retry-After',String(e.retryAfter||5));send(e.status||(/SQLITE|database|disk|I\/O/i.test(e.message)?503:400),{error:e.status?e.message:/SQLITE|database|disk|I\/O/i.test(e.message)?'Account service is temporarily unavailable. Try again shortly.':'Invalid account request.',...(e.code==='reauthentication'?{code:e.code}:{})});}return true;
};}
