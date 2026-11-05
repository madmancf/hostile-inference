import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {RULE_FILES} from './ranked-rules.mjs';
import {DatabaseSync} from 'node:sqlite';

export const OPERATIONS_VERSION=1,STORAGE_SCHEMA=4;
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(a,b)=>a===b||a.startsWith(b+path.sep);
const sync=async file=>{const f=await fs.open(file,'r');try{await f.sync();}finally{await f.close();}};
export async function socketPath(file){
 if(typeof process.getuid!=='function')throw Error('Operator controls require a Unix host');
 // Service managers and login shells may have different TMPDIR values.
 const directory='/tmp/hi-ops-'+process.getuid();await fs.mkdir(directory,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)throw Error('Unsafe operator socket directory');
 const parent=await fs.realpath(path.dirname(file));return path.join(directory,sha(path.join(parent,path.basename(file))).slice(0,24)+'.sock');
}
async function syncDirectories(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true}))if(entry.isDirectory())await syncDirectories(path.join(directory,entry.name));await sync(directory);}
async function inventory(directory,prefix=''){
 const result={};for(const entry of await fs.readdir(path.join(directory,prefix),{withFileTypes:true})){
  const name=path.posix.join(prefix,entry.name);if(entry.isSymbolicLink())throw Error('Symlinks are not accepted in operational archives');
  if(entry.isDirectory())Object.assign(result,await inventory(directory,name));
  else if(entry.isFile()){const hash=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path.join(directory,name))){hash.update(chunk);bytes+=chunk.length;}result[name]={bytes,sha256:hash.digest('hex')};}else throw Error('Unsupported archive file');
 }return result;
}
function dbSummary(file){const db=new DatabaseSync(file,{readOnly:true});try{
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup database integrity check failed');
 const schema=db.prepare('SELECT MAX(version) AS n FROM schema_version').get().n;if(![2,3,STORAGE_SCHEMA].includes(schema))throw Error('Unsupported backup schema');
 const tables=['users','sessions','memberships','account_matches','account_events','match_event_keys','operations_state','auth_limits','user_safety','mail_tokens','mail_outbox','player_reports','moderation_events','mail_delivery'].filter(t=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t));
 // Stream the exact previous JSON encoding so existing schema-2/3/4 backup
 // fingerprints remain valid without materializing the entire journal in RAM.
 const hash=createHash('sha256'),counts={};hash.update('{');
 for(const [index,t] of tables.entries()){
  if(index)hash.update(',');hash.update(JSON.stringify(t)+':[');let count=0;
  const order=['operations_state','auth_limits'].includes(t)?'key':t==='account_events'||t==='match_event_keys'?'match_id,position':t==='memberships'?'user_id,season':t==='sessions'||t==='mail_tokens'?'hash':t==='user_safety'?'user_id':'id';
  for(const row of db.prepare('SELECT * FROM '+t+' ORDER BY '+order).iterate()){if(count++)hash.update(',');hash.update(JSON.stringify(row));}
  counts[t]=count;hash.update(']');
 }
 hash.update('}');return {schema,counts,logicalSHA256:hash.digest('hex'),rulesId:JSON.parse(db.prepare("SELECT value FROM operations_state WHERE key='rulesId'").get()?.value||'null')};
 }finally{db.close();}}

export async function createBackup({accounts,ranked,destination,release=null}){
 if(!path.isAbsolute(destination))throw Error('Use an absolute backup destination');
 const target=path.join(await fs.realpath(path.dirname(destination)),path.basename(destination));
 const data=await fs.realpath(path.dirname(accounts.file)),legacy=await fs.realpath(ranked.directory);
 if(inside(target,data)||inside(target,legacy)||release?.root&&inside(target,release.root))throw Error('Keep backups outside live storage and release directories');
 return ranked.withSnapshot(async()=>{
  await fs.mkdir(target,{mode:0o700}); // Exclusive creation; never overwrite.
  try{
   const snapshot=path.join(target,'accounts.sqlite');
   accounts.db.prepare('VACUUM INTO ?').run(snapshot);await fs.chmod(snapshot,0o600);
   await fs.cp(legacy,path.join(target,'legacy-ranked'),{recursive:true,errorOnExist:true,force:false});
   const summary=dbSummary(snapshot),files=await inventory(target);
   for(const name of Object.keys(files)){await fs.chmod(path.join(target,name),0o600);await sync(path.join(target,name));}
   const manifest={format:'hostile-inference-backup',version:OPERATIONS_VERSION,createdAt:new Date().toISOString(),release:release?.id||'preview',...summary,files};
   await fs.writeFile(path.join(target,'backup.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});await sync(path.join(target,'backup.json'));await syncDirectories(target);await sync(path.dirname(target));
   return {path:target,...manifest};
  }catch(e){throw Error('Backup incomplete; it is not restorable without a complete verified manifest: '+e.message,{cause:e});}
 });
}

export async function verifyBackup(directory){
 const root=await fs.realpath(directory),manifest=JSON.parse(await fs.readFile(path.join(root,'backup.json')));
 if(manifest.format!=='hostile-inference-backup'||manifest.version!==OPERATIONS_VERSION)throw Error('Unknown backup format');
 const actual=await inventory(root);delete actual['backup.json'];
 if(JSON.stringify(Object.keys(actual).sort())!==JSON.stringify(Object.keys(manifest.files||{}).sort()))throw Error('Backup inventory mismatch');
 for(const [name,item]of Object.entries(actual)){if(name!=='accounts.sqlite'&&!/^legacy-ranked\/[a-f0-9-]{36}\/(ticket.json|events.ndjson)$/.test(name))throw Error('Unexpected backup member: '+name);if(item.sha256!==manifest.files[name].sha256||item.bytes!==manifest.files[name].bytes)throw Error('Backup hash mismatch: '+name);}
 const summary=dbSummary(path.join(root,'accounts.sqlite'));if(summary.logicalSHA256!==manifest.logicalSHA256||summary.rulesId!==manifest.rulesId)throw Error('Backup logical state mismatch');
 return {root,manifest};
}

export async function restoreBackup({source,destination}){
 if(!path.isAbsolute(destination))throw Error('Use an absolute restore destination');
 const {root,manifest}=await verifyBackup(source),target=path.join(await fs.realpath(path.dirname(destination)),path.basename(destination));
 if(inside(target,root))throw Error('Restore into a separate fresh directory');
 await fs.mkdir(target,{mode:0o700}); // Existing/live data can never be overwritten.
 await fs.writeFile(path.join(target,'.restoring'),'Restore in progress\n',{flag:'wx',mode:0o600});await sync(target);
 for(const name of Object.keys(manifest.files)){
  const file=path.join(target,name);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.copyFile(path.join(root,name),file,fs.constants.COPYFILE_EXCL);await fs.chmod(file,0o600);await sync(file);
  if(sha(await fs.readFile(file))!==manifest.files[name].sha256)throw Error('Restored file hash mismatch: '+name);
 }
 // Admission starts drained on the recovered instance. Preserve all identities,
 // commands, results and job attempts; never start a new competition implicitly.
 const db=new DatabaseSync(path.join(target,'accounts.sqlite'));try{db.exec('PRAGMA synchronous=FULL;');db.prepare("UPDATE operations_state SET value=? WHERE key='admission'").run(JSON.stringify('draining'));db.prepare("INSERT INTO operations_state VALUES('mailAdmission',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify('paused'));}finally{db.close();}
 await fs.writeFile(path.join(target,'restore-receipt.json'),JSON.stringify({restoredAt:new Date().toISOString(),sourceSHA256:sha(await fs.readFile(path.join(root,'backup.json'))),rulesId:manifest.rulesId,sourceLogicalSHA256:manifest.logicalSHA256,admission:'draining'},null,2)+'\n',{flag:'wx',mode:0o600});
 await sync(path.join(target,'accounts.sqlite'));await sync(path.join(target,'restore-receipt.json'));await syncDirectories(target);await fs.rm(path.join(target,'.restoring'));await sync(target);await sync(path.dirname(target));
 return {path:target,rulesId:manifest.rulesId,counts:manifest.counts,admission:'draining'};
}

export async function checkUpdate(ranked,directory){
 const status=ranked.operationStatus();if(!status.safeToUpdate)throw Error('Drain ranked admission and finish or recover every accepted run before updating');
 const root=await fs.realpath(directory),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json')));
 if(manifest.operationsVersion!==OPERATIONS_VERSION||manifest.storageSchema!==STORAGE_SCHEMA)throw Error('Candidate lacks compatible operational/storage controls; rollback across storage-schema versions is unsupported');
 if(manifest.rules!==ranked.rules.id)throw Error('Season Zero rules are frozen; a different rules release requires a separately planned season transition');
 for(const [name,item]of Object.entries(manifest.assets)){if(path.isAbsolute(name)||name.split('/').includes('..'))throw Error('Unsafe release asset');const bytes=await fs.readFile(path.join(root,'public',name));if(sha(bytes)!==item.sha256||bytes.length!==item.bytes)throw Error('Candidate asset mismatch: '+name);}
 for(const [name,digest]of Object.entries(manifest.privateSHA256||{})){if(path.isAbsolute(name)||name.split('/').includes('..'))throw Error('Unsafe private release file');if(sha(await fs.readFile(path.join(root,name)))!==digest)throw Error('Candidate runtime mismatch: '+name);}
 if(!manifest.privateSHA256?.['server.mjs']||!manifest.privateSHA256?.['api/replay-worker.mjs'])throw Error('Candidate has no private runtime integrity manifest');
 const actualRules={};for(const name of RULE_FILES)actualRules[name]=sha(await fs.readFile(path.join(root,'design-preview',name)));if(sha(JSON.stringify(actualRules))!==manifest.rules)throw Error('Candidate rules files disagree with the frozen season');
 return {ready:true,release:manifest.id,rulesId:manifest.rules,admission:status.admission,policy:'Stop old process; start candidate with same data; verify health and saved results; explicitly resume admission. Retain the previous compatible bundle for rollback.'};
}

// Local operator surface is a private Unix socket, never a public HTTP route.
export async function startOperations({accounts,ranked,release=null}){
 const socket=await socketPath(accounts.file);await fs.rm(socket,{force:true});let busy=false;
 const server=http.createServer(async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(req.method!=='POST'||req.url!=='/command')return send(404,{error:'Unknown operator request'});
  if(busy)return send(409,{error:'An operator command is already running'});busy=true;
  try{let input='';for await(const b of req){input+=b;if(input.length>8192)throw Error('Operator request too large');}const args=JSON.parse(input);let result;
   switch(args.command){
    case 'status':result={...ranked.operationStatus(),accounts:accounts.safetyStatus()};break;
    case 'mail-status':result=accounts.mail.status();break;
    case 'mail-admission':if(!['open','paused'].includes(args.state))throw Error('Choose open or paused');accounts.setOperationState({mailAdmission:args.state});result=accounts.mail.status();break;
    case 'mail-outbox':accounts.pruneSafety();result=accounts.db.prepare('SELECT * FROM mail_outbox ORDER BY created_at DESC LIMIT 100').all();break;
    case 'reports':result=accounts.db.prepare("SELECT * FROM player_reports WHERE state='open' ORDER BY created_at LIMIT 100").all();break;
    case 'resolve-report':if(!['resolved','dismissed'].includes(args.state))throw Error('Choose resolved or dismissed');result=accounts.db.prepare('UPDATE player_reports SET state=? WHERE id=?').run(args.state,args.id);break;
    case 'moderate':result=accounts.moderate(args);break;
    case 'signups':if(!['open','paused'].includes(args.state))throw Error('Choose open or paused');accounts.setOperationState({signups:args.state});result=accounts.safetyStatus();break;
    case 'publication':if(!['open','paused'].includes(args.state))throw Error('Choose open or paused');accounts.setOperationState({publication:args.state});result=accounts.safetyStatus();break;
    case 'drain':result=await ranked.setAdmission('draining');break;
    case 'disable':result=await ranked.setAdmission('disabled');break;
    case 'resume':result=await ranked.setAdmission('open');break;
    case 'retry':result=await ranked.retryJob(args.id);break;
    case 'backup':result=await createBackup({accounts,ranked,destination:args.destination,release});break;
    case 'update-check':result=await checkUpdate(ranked,args.release);break;
    default:throw Error('Unknown operator command');
   }send(200,result);
  }catch(e){send(409,{error:e.message});}finally{busy=false;}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve);});await fs.chmod(socket,0o600);
 return {socket,close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();})};
}
