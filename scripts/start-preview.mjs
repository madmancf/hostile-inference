import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {rulesManifest} from '../api/ranked-rules.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const label='com.hostile-inference.preview';
const server=path.join(root,'design-preview/server.mjs');
const runtime=path.join(root,'.runtime');
const url='http://127.0.0.1:4178/demo/index.html';
if(process.platform!=='darwin')throw new Error('The managed preview starter uses macOS launchd. Use npm run dev on other platforms.');
const job=()=>{try{return execFileSync('/bin/launchctl',['list',label],{encoding:'utf8',stdio:['ignore','pipe','pipe']})}catch{return null}};
async function stopJob(info){
 const pid=Number(info?.match(/"PID"\s*=\s*(\d+)/)?.[1]);
 execFileSync('/bin/launchctl',['remove',label]);
 // launchd removal is asynchronous. Reusing its label before the old process
 // exits can remove the replacement job as well, leaving the preview offline.
 for(let attempt=0;attempt<100;attempt++){
  let alive=false;if(pid)try{process.kill(pid,0);alive=true;}catch{}
  if(!job()&&!alive)return;await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Previous preview has not stopped yet. Retry npm start shortly.');
}
let existing=job();
if(existing&&!existing.includes(server))throw new Error('The preview service label is owned by a different checkout.');
if(process.argv.includes('--stop')){
 if(existing)await stopJob(existing);
 console.log('Managed preview stopped.');
}else{
 const expectedRules=(await rulesManifest()).id;
 const healthy=async()=>{try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});if(!response.ok||!(await response.text()).includes('Server Siege'))return false;const ranked=await fetch('http://127.0.0.1:4178/api/ranked/rules',{headers:{'X-HI-Client':'local-ranked-v1'},signal:AbortSignal.timeout(1500)});if(!ranked.ok)return false;const state=await ranked.json();if(state.id!==expectedRules||state.accountsRequired!==true||state.accountVersion!==1||state.release!=='preview')return false;const boards=await fetch('http://127.0.0.1:4178/api/leaderboards',{headers:{'X-HI-Client':'local-leaderboards-v1'},signal:AbortSignal.timeout(1500)});if(!boards.ok||(await boards.json()).version!==1)return false;const account=await fetch('http://127.0.0.1:4178/api/account/me',{headers:{'X-HI-Client':'local-accounts-v1'},signal:AbortSignal.timeout(1500)});return account.ok&&Object.hasOwn(await account.json(),'requireVerifiedEmail')}catch{return false}};
 if(existing&&await healthy())console.log('PREVIEW_READY: '+url);
 else{
  if(existing)await stopJob(existing);
  await fs.mkdir(runtime,{recursive:true});
  execFileSync('/bin/launchctl',['submit','-l',label,'-o',path.join(runtime,'preview.stdout.log'),'-e',path.join(runtime,'preview.stderr.log'),'--',process.execPath,server]);
  let ready=false;
  for(let attempt=0;attempt<20;attempt++){if(await healthy()){ready=true;break}await new Promise(resolve=>setTimeout(resolve,200))}
  if(!ready)throw new Error('Managed preview did not become ready. Read .runtime/preview.stderr.log.');
  console.log('PREVIEW_READY: '+url);
 }
 console.log('Managed by launchd independently of the chat command. Stop with npm run preview:stop.');
}
