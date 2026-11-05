const output=process.env.HI_RANKED_OUTPUT||'output/playwright/ranked-current';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {RankedService} from '../api/ranked-service.mjs';import {replay,stateDigest} from '../game/demo/ranked-protocol.js';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hi-ranked-recovery-'));let now=Date.now(),service=await new RankedService({directory,now:()=>now}).init();
const config={faction:'closed',rival:'broke',difficulty:'standard'},checks=[];
const wait=async t=>{for(let i=0;i<300;i++){const m=service.get(t.id,t.token);if(['verified','rejected'].includes(m.status))return m;now+=50;await new Promise(r=>setTimeout(r,50));}throw Error('Verification timeout');};
try{
 const terminal=replay(config,[]),digest=await stateDigest(terminal.game);assert.ok(terminal.game.result);
 const t=await service.issue(config);await service.activate(t.id,t.token);now+=terminal.tick*50;
 await service.batch(t.id,t.token,{seq:0,throughTick:terminal.tick,actions:[]});await service.finish(t.id,t.token,{tick:terminal.tick,digest});
 await service.close();service=await new RankedService({directory,now:()=>now}).init();const restored=await wait(t);assert.equal(restored.status,'verified');assert.equal(restored.result.digest,digest);assert.equal(restored.result.score,0);checks.push('Pending verification survives worker/server termination and restarts from durable commands');
 const bad=await service.issue(config);await service.activate(bad.id,bad.token);now+=terminal.tick*50;await service.batch(bad.id,bad.token,{seq:0,throughTick:terminal.tick,actions:[]});await service.finish(bad.id,bad.token,{tick:terminal.tick,digest:'0'.repeat(64)});const rejected=await wait(bad);assert.equal(rejected.status,'rejected');assert.match(rejected.error,/disagree/);assert.equal(rejected.result,null);checks.push('A forged digest of an actually terminal run is rejected, with no result awarded');
 const race=await service.issue(config);await service.activate(race.id,race.token);now+=1000;const batch={seq:0,throughTick:20,actions:[{tick:0,action:{type:'economy'}}]};
 const responses=await Promise.all([service.batch(race.id,race.token,batch),service.batch(race.id,race.token,batch)]);assert.equal(responses.filter(x=>x.duplicate).length,1);assert.equal(service.get(race.id,race.token).actions.length,1);checks.push('Concurrent identical submissions persist exactly one command batch');
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/recovery-tests.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await service.close();await fs.rm(directory,{recursive:true,force:true});}
