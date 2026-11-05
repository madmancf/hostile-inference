import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Accounts} from '../api/accounts.mjs';
import {RankedService} from '../api/ranked-service.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'hi-history-integrity-'));
let accounts,ranked,now=Date.now();const checks=[];
const open=async options=>{accounts=await new Accounts({file:path.join(root,'accounts.sqlite'),now:()=>now}).init();ranked=await new RankedService({accounts,directory:path.join(root,'legacy'),now:()=>now,...options}).init();};
try{
 await open({maxStartsPerHour:2});const u=(await accounts.signup({username:'history_owner',callsign:'History Owner',password:'History integrity password!',faction:'closed'})).user,token={accountId:u.id},config={faction:'closed',rival:'broke',difficulty:'standard'};
 const t=await ranked.issue(config,u.id,true);await ranked.activate(t.id,token);now+=1000;const batch={seq:0,throughTick:20,actions:[{tick:0,action:{type:'economy'}}]};await ranked.batch(t.id,token,batch);await ranked.abort(t.id,token);
 assert.equal(ranked.matches.size,0);const expected=ranked.get(t.id,token);assert.deepEqual(expected.actions,batch.actions);assert.equal((await ranked.batch(t.id,token,batch)).duplicate,true);await assert.rejects(()=>ranked.batch(t.id,token,{...batch,actions:[]}),e=>e.status===409);
 for(let i=0;i<100;i++){assert.deepEqual(ranked.get(t.id,token),expected);assert.equal(accounts.matchHistory(u.id,ranked,0).matches[0].status,'aborted');}
 assert.equal(ranked.matches.size,0);assert.equal(ranked.locks.size,0);assert.throws(()=>ranked.get(t.id,{accountId:'someone-else'}),e=>e.status===404);checks.push('Cold history and command-log reads preserve ownership and idempotency without repopulating the live map');
 const second=await ranked.issue(config,u.id,true);await ranked.abort(second.id,token);await ranked.close();accounts.close();await open({maxStartsPerHour:2});assert.equal(ranked.matches.size,0);await assert.rejects(()=>ranked.issue(config,u.id,true),e=>e.status===429);checks.push('The global hourly start budget survives a process restart');
 now+=3600001;const pending=await ranked.issue(config,u.id,true);await ranked.activate(pending.id,token);now+=1000;await ranked.batch(pending.id,token,batch);const before=ranked.get(pending.id,token);await ranked.close();accounts.close();await open();assert.equal(ranked.matches.size,1);assert.deepEqual(ranked.get(pending.id,token),before);await ranked.abort(pending.id,token);assert.equal(ranked.matches.size,0);checks.push('Only active commands are rehydrated on startup; aborted runs are released immediately');
 const plans={live:accounts.db.prepare("EXPLAIN QUERY PLAN SELECT ticket FROM account_matches WHERE status IN ('issued','active','verifying') ORDER BY issued_at,id").all(),page:accounts.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM account_matches WHERE user_id=? ORDER BY issued_at DESC,id DESC LIMIT 25 OFFSET 25').all(u.id),event:accounts.db.prepare("EXPLAIN QUERY PLAN SELECT event FROM account_events WHERE match_id=? AND json_extract(event,'$.type')='active' ORDER BY position DESC LIMIT 1").all(t.id)};
 assert.ok(plans.live.some(r=>r.detail.includes('match_state')));assert.ok(plans.page.some(r=>r.detail.includes('match_history_page')));assert.ok(plans.event.some(r=>r.detail.includes('match_event_type')));checks.push('Startup, paginated history and summary-event lookups use their indexes');
 await fs.mkdir('output/server-capacity-v0.20',{recursive:true});await fs.writeFile('output/server-capacity-v0.20/history-integrity.json',JSON.stringify({status:'passed',checks,plans},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await ranked?.close();accounts?.close();await fs.rm(root,{recursive:true,force:true});}
