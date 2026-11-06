import assert from 'node:assert/strict';
import {RankedClient,readJSON} from '../game/demo/ranked-client.js';
import {DebriefStandings,contributionCopy,validStandings,trainingHandoff} from '../game/demo/debrief.js';
import {CLIENT_RULES_ID} from '../game/demo/rules-version.js';
import {PROTOCOL,createRankedGame} from '../game/demo/ranked-protocol.js';
const originalFetch=globalThis.fetch;
const ticket={id:'11111111-1111-1111-1111-111111111111',protocol:PROTOCOL,rulesId:CLIENT_RULES_ID,config:{faction:'closed',rival:'broke',difficulty:'standard'},status:'active',serverNow:1000,startedAt:0,seq:0,throughTick:0};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
try{
 for(const failure of [false,true]){
  const wait=deferred();let callbacks=0;const c=new RankedClient(ticket,()=>callbacks++);c.game=createRankedGame(ticket.config);c.tick=2;globalThis.fetch=()=>wait.promise;
  const pending=c.pump();c.close();if(failure)wait.reject(Error('credential-like content'));else wait.resolve(json({...ticket,seq:1,throughTick:2}));await pending;
  assert.equal(callbacks,0);assert.equal(c.status,'active');assert.equal(c.throughTick,0);assert.equal(c.update({...ticket,status:'rejected'}),false);
 }
 // Ambiguous finish: status reconciliation wins; do not issue finish a second time.
 {
  const c=new RankedClient(ticket);c.game=createRankedGame(ticket.config);c.game.result='defeat';c.tick=c.throughTick=2;let finishes=0,reads=0;
  globalThis.fetch=async url=>{if(url.endsWith('/finish')){finishes++;throw new TypeError('lost acknowledgment');}reads++;return json({...ticket,throughTick:2,status:'verifying'});};
  await c.pump();assert.equal(c.finishUncertain,true);await c.pump();assert.equal(finishes,1);assert.equal(reads,1);assert.equal(c.status,'verifying');await c.close();
 }
 // Command retries keep their exact body even when newer commands arrive.
 {
  const bodies=[],c=new RankedClient(ticket);c.game=createRankedGame(ticket.config);c.tick=2;globalThis.fetch=async(url,options)=>{bodies.push(options.body);if(bodies.length===1)throw Error('lost');return json({...ticket,seq:1,throughTick:2});};await c.pump();c.tick=3;await c.pump();assert.equal(bodies[0],bodies[1]);await c.close();
 }
 for(const status of [400,401,403,404,409,429,500,503]){let calls=0;globalThis.fetch=async()=>{calls++;return json({error:'do not reflect this secret'},status,status===429?{'Retry-After':'999'}:{});};await assert.rejects(readJSON('/test'),e=>!e.message.includes('secret'));assert.equal(calls,status>=500?2:1);}
 {
  let calls=0;globalThis.fetch=async()=>{calls++;if(calls===1)throw new DOMException('timeout','TimeoutError');return json({ok:true});};assert.deepEqual(await readJSON('/test'),{ok:true});assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>{calls++;return calls===1?json({},429,{'Retry-After':'0'}):json({ok:true});};assert.deepEqual(await readJSON('/test'),{ok:true});assert.equal(calls,2);
  globalThis.fetch=async()=>({ok:true,json:async()=>{throw Error('raw nested token');}});await assert.rejects(readJSON('/test'),e=>e.code==='HI_RESPONSE_INVALID'&&!e.message.includes('token'));
 }
 const identity={accountId:'owner',runId:ticket.id,rulesId:CLIENT_RULES_ID,faction:'closed'},snapshot={version:1,policy:'balanced-best-two-top20-v1',rulesId:CLIENT_RULES_ID,me:{faction:'closed',rank:1,score:100,contribution:5,counted:true,best:[{rival:'misanthropic',score:null},{rival:'broke',score:200}]}};
 assert.ok(validStandings(snapshot,identity));assert.equal(validStandings({...snapshot,rulesId:'wrong'},identity),false);
 let text=contributionCopy(snapshot,snapshot,'broke');assert.match(text,/unchanged/);assert.match(text,/contribution: 5/);
 for(const [rank,expected]of [[21,/outside the top 20/],[null,/reason unavailable/],[1,/No positive contribution/]]){const s=structuredClone(snapshot);Object.assign(s.me,{rank,score:0,contribution:0,counted:false});s.me.best[1].score=0;text=contributionCopy(s,null,'broke');assert.match(text,/contribution: 0/);assert.match(text,expected);assert.ok(!text.includes('undefined'));}
 // Earlier success cannot repaint after a newer success, failure, or account/run reset.
 for(const outcome of ['success','failure','reset']){
  const old=deferred(),recent=deferred();let calls=0;globalThis.fetch=()=>++calls===1?old.promise:calls===2?recent.promise:Promise.resolve(json({},503));const view=new DebriefStandings();view.reset(identity);const p1=view.load(true),p2=view.load(true);
  if(outcome==='reset')view.reset({...identity,accountId:'different'});
  recent.resolve(outcome==='failure'?json({},503):json(snapshot));await p2;old.resolve(json({...snapshot,me:{...snapshot.me,contribution:999}}));await p1;
  assert.equal(view.current?.me.contribution,outcome==='success'?5:undefined);assert.equal(view.status,outcome==='success'?'ready':outcome==='failure'?'unavailable':'idle');
 }
 {
  const old=deferred();let calls=0;globalThis.fetch=()=>++calls===1?old.promise:Promise.resolve(json(snapshot));const v=new DebriefStandings();v.reset(identity);const baseline=v.load(false);await v.load(true);old.resolve(json(snapshot));await baseline;assert.equal(v.baseline,null);assert.equal(v.current.me.contribution,5);
 }
 console.log('PASS First Light clients: closed callbacks, finish reconciliation, identical batch retry, bounded GET retries, malformed input, standings generations and truthful zero states');
}finally{globalThis.fetch=originalFetch;}

for(const faction of ['misanthropic','closed','broke']){
 const guest=trainingHandoff(faction,'broke',null);assert.match(guest.href,/account/);assert.match(guest.note,/unranked/);
 for(const allegiance of ['misanthropic','closed','broke'])for(const lockedAt of [null,123]){
  const h=trainingHandoff(faction,'broke',{membership:{faction:allegiance,lockedAt}});assert.equal(new URL(h.href,'http://test').searchParams.get('faction'),allegiance);assert.equal(!!h.changeHref,faction!==allegiance&&lockedAt===null);if(faction!==allegiance)assert.match(h.note,/Verified play represents/);
 }
}

{const client=new RankedClient(ticket);assert.throws(()=>client.update({...ticket,status:'verified'}),e=>e.code==='HI_RESPONSE_INVALID');assert.throws(()=>client.update({...ticket,config:{...ticket.config,faction:'misanthropic'}}),e=>e.code==='HI_RESPONSE_INVALID');client.close();}
