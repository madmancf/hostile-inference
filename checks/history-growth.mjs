// Isolated reproduction and regression: synthetic archived journals, never player data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Accounts} from '../api/accounts.mjs';
import {RankedService} from '../api/ranked-service.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'hi-history-growth-'));
let accounts,ranked;
const count=Number(process.env.HI_HISTORY_COUNT||500),baseline=process.env.HI_HISTORY_BASELINE==='1';
try{
 accounts=await new Accounts({file:path.join(root,'accounts.sqlite')}).init();
 const owner=(await accounts.signup({username:'history_probe',callsign:'History Probe',password:'History test password only',faction:'closed'},null,'fixture')).user;
 const at=Date.now()-86400000;
 accounts.transaction(()=>{
  const match=accounts.db.prepare('INSERT INTO account_matches VALUES(?,?,?,?,?,?,?,?)'),event=accounts.db.prepare('INSERT INTO account_events VALUES(?,?,?)');
  for(let i=0;i<count;i++){
   const id=randomUUID(),ticket={id,ownerId:owner.id,rulesId:'0'.repeat(64),config:{faction:'closed',rival:'broke',difficulty:'standard'},issuedAt:at+i,activateBy:at+i+60000};
   match.run(id,owner.id,'local-season-zero',JSON.stringify(ticket),'aborted',at+i,null,null);
   event.run(id,0,JSON.stringify({type:'active',at:at+i}));
   for(let seq=0;seq<180;seq++)event.run(id,seq+1,JSON.stringify({type:'batch',at:at+i+seq*2000,digest:'0'.repeat(64),body:{seq,throughTick:(seq+1)*40,actions:[{tick:seq*40,action:{type:'economy'}}]}}));
   event.run(id,181,JSON.stringify({type:'abort',at:at+i+360000,reason:'Isolated historical load fixture'}));
  }
 });
 global.gc?.();const before=process.memoryUsage(),start=performance.now();
 ranked=await new RankedService({accounts,directory:path.join(root,'legacy')}).init();
 global.gc?.();const after=process.memoryUsage();
 const report={at:new Date().toISOString(),baseline,history:count,events:count*182,hotMatches:ranked.matches.size,heapGrowthMiB:(after.heapUsed-before.heapUsed)/1048576,rssGrowthMiB:(after.rss-before.rss)/1048576,startupMs:performance.now()-start,sourceSHA256:Object.fromEntries(await Promise.all(['api/accounts.mjs','api/ranked-service.mjs'].map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])))};
 await fs.mkdir('output/server-capacity-v0.20',{recursive:true});await fs.writeFile('output/server-capacity-v0.20/history-'+(baseline?'before':'after')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 if(!baseline){assert.equal(ranked.matches.size,0,'Settled journals must not stay in the live match map');assert.ok(report.heapGrowthMiB<8,'Archived history must not grow the retained JS heap');}
}finally{await ranked?.close();accounts?.close();await fs.rm(root,{recursive:true,force:true});}
