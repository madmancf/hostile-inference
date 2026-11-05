// Synthetic aged history, built only inside the caller's disposable directory.
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {Accounts,SEASON} from '../api/accounts.mjs';
import {rulesManifest} from '../api/ranked-rules.mjs';
import {createRankedGame,applyAction,stateDigest} from '../design-preview/demo/ranked-protocol.js';
import {tickOperation} from '../design-preview/demo/operation.js';
import {drive} from './ranked-policy.mjs';
export async function seedHistory(directory,count=10000){
 const accounts=await new Accounts({file:path.join(directory,'accounts.sqlite')}).init();const rules=await rulesManifest(),players=[],samples=new Map(),password='Disposable capacity test password!';
 try{
  for(let i=0;i<9;i++){const faction=['misanthropic','closed','broke'][i%3],rivals=['misanthropic','closed','broke'].filter(f=>f!==faction),config={faction,rival:rivals[Math.floor(i/3)%2],difficulty:'standard'},username='capacity_'+i;
   const u=await accounts.signup({username,password,callsign:'Capacity '+i,faction},null,'192.0.2.'+(i+1));players.push({id:u.user.id,token:u.token,username,password,config,ip:'192.0.2.'+(i+1)});
   if(!samples.has(JSON.stringify(config))){const game=createRankedGame(config),policy={},batches=[];let tick=0,batch=[];
    while(!game.result){drive(game,policy,action=>{const value=applyAction(game,action);batch.push({tick,action});return value;});tickOperation(game,.05);tick++;if(tick%40===0||game.result)batches.push({seq:batches.length,throughTick:tick,actions:batch.splice(0)});}
    const digest=await stateDigest(game);samples.set(JSON.stringify(config),{batches,tick,digest,score:4000,outcome:'victory'});
   }
  }
  const at=Date.now()-2*86400000,hash=createHash('sha256');let eventCount=0,commandCount=0;
  const insert=accounts.db.prepare('INSERT INTO account_matches VALUES(?,?,?,?,?,?,?,?)'),event=accounts.db.prepare('INSERT INTO account_events VALUES(?,?,?)'),key=accounts.db.prepare('INSERT INTO match_event_keys VALUES(?,?,?)');
  for(let base=0;base<count;base+=100){accounts.transaction(()=>{
   for(let i=base;i<Math.min(count,base+100);i++){
    const p=players[i%8],id=randomUUID(),start=at+i,sample=samples.get(JSON.stringify(p.config)),ticket={id,ownerId:p.id,rulesId:rules.id,config:p.config,issuedAt:start,activateBy:start+60000};
    // A synthetic score fixture is explicitly NOT a newly verified player run.
    const result={rulesId:rules.id,outcome:sample.outcome,score:sample.score+(i%100),tick:sample.tick,homeHP:75,digest:sample.digest,commands:sample.batches.reduce((n,b)=>n+b.actions.length,0)},end=start+sample.tick*50;
    insert.run(id,p.id,SEASON,JSON.stringify(ticket),'verified',start,JSON.stringify(result),end);
    let pos=0;const append=e=>{const eventId=id+':'+pos,bytes=JSON.stringify({...e,eventId});event.run(id,pos,bytes);key.run(id,eventId,pos);hash.update(id+':'+pos+':'+bytes+'\n');pos++;eventCount++;};
    append({type:'active',at:start});for(const body of sample.batches){append({type:'batch',at:start+body.throughTick*50,body,digest:createHash('sha256').update(JSON.stringify(body,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)).digest('hex')});commandCount+=body.actions.length;}
    append({type:'submit',at:end,checkpoint:{tick:sample.tick,digest:sample.digest}});append({type:'job',at:end,job:{state:'running',attempts:1,nextAttemptAt:end+16000}});append({type:'settled',at:end+100,ok:true,result});
   }
  });if((base+100)%1000===0)console.log(JSON.stringify({stage:'seed-history',matches:base+100,total:count}));}
  accounts.db.prepare('UPDATE memberships SET locked_at=?').run(at);accounts.setOperationState({rulesId:rules.id,season:SEASON,admission:'open'});accounts.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return {players,rulesId:rules.id,history:{matches:count,events:eventCount,commands:commandCount,bytes:(await fs.stat(accounts.file)).size,fixtureOnly:true},samples};
 }finally{accounts.close();}
}
