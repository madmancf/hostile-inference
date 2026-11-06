import {CLIENT_RULES_ID,CLIENT_RELEASE_ID} from './rules-version.js';
import {PROTOCOL,STEP,MAX_TICKS,MAX_ACTIONS,applyAction,createRankedGame,replay,stateDigest} from './ranked-protocol.js';
import {tickOperation} from './operation.js';
const KEY='hostile-inference.verified-ticket.v1';
const validFaction=f=>['misanthropic','closed','broke'].includes(f);
const safeError=(code,status)=>Object.assign(new Error({HI_ACCOUNT_UNAVAILABLE:'Account service unavailable. Practice remains available.',HI_STANDINGS_UNAVAILABLE:'Current standings are unavailable. Your verified result is unchanged.',HI_RESPONSE_INVALID:'The service returned an incompatible response. Retry or reload.',HI_VERIFY_UNAVAILABLE:'Verification connection interrupted. Reconnect to recover acknowledged orders.'}[code]||'Service unavailable.'),{code,status});
// Read-only requests have one bounded retry. Mutations retain their existing replay/idempotency owner.
export async function readJSON(url,headers={},code='HI_RESPONSE_INVALID'){
 const started=performance.now();for(let attempt=0;attempt<2;attempt++){
  const remaining=12000-(performance.now()-started);if(remaining<=0)throw safeError(code);
  let response;try{response=await fetch(url,{headers,signal:AbortSignal.timeout(Math.max(1,Math.ceil(Math.min(6000,remaining))))});}
  catch(e){if(attempt===0&&['TimeoutError','AbortError'].includes(e.name))continue;throw safeError(code);}
  if(response.ok){try{return await response.json();}catch{throw safeError('HI_RESPONSE_INVALID');}}
  const retry=response.status>=500||response.status===429;
  if(attempt===0&&retry){let delay=0;if(response.status===429){const raw=response.headers.get('Retry-After');delay=/^\d+(?:\.\d+)?$/.test(raw||'')?Number(raw)*1000:Date.parse(raw)-Date.now();if(!Number.isFinite(delay)||delay<0||delay>=12000-(performance.now()-started))throw safeError(code,429);}if(delay)await new Promise(r=>setTimeout(r,delay));continue;}
  throw safeError(code,response.status);
 }throw safeError(code);
}
function validTicket(t){return t&&typeof t.id==='string'&&/^[a-f0-9-]{36}$/.test(t.id)&&t.protocol===PROTOCOL&&t.rulesId===CLIENT_RULES_ID&&validFaction(t.config?.faction)&&validFaction(t.config?.rival)&&t.config.faction!==t.config.rival&&t.config.difficulty==='standard'&&Number.isSafeInteger(t.seq)&&t.seq>=0&&Number.isSafeInteger(t.throughTick)&&t.throughTick>=0&&Number.isFinite(t.serverNow)&&['issued','active','verifying','verification_failed','verified','rejected','aborted'].includes(t.status)&&(t.status!=='verified'||!!t.result)&&(!t.result||t.result.rulesId===t.rulesId&&Number.isFinite(t.result.score)&&t.result.score>=0&&t.result.score<=10000&&['victory','defeat','timeout'].includes(t.result.outcome)&&typeof t.result.medal==='string'&&t.result.medal.length<=32&&t.result.breakdown&&Object.keys(t.result.breakdown).length>0&&Object.values(t.result.breakdown).every(Number.isFinite));}
export class RankedClient {
 constructor(ticket,onStatus=()=>{}){this.ticket=ticket;this.onStatus=onStatus;this.tick=0;this.pending=[];this.seq=ticket.seq;this.throughTick=ticket.throughTick;this.count=0;this.status=ticket.status;this.anchor=performance.now();this.serverAnchor=ticket.serverNow;this.closed=false;}
 static saved(){try{return JSON.parse(sessionStorage.getItem(KEY));}catch{return null;}}
 static remember(ticket){sessionStorage.setItem(KEY,JSON.stringify({id:ticket.id,...(ticket.token?{token:ticket.token}:{})}));}
 static forget(){sessionStorage.removeItem(KEY);}
 static async request(url,body,token){
  const headers={'X-HI-Client':'local-ranked-v1','X-HI-Build':CLIENT_RELEASE_ID,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})};
  if(body===undefined)return readJSON('/api/ranked/'+url,headers,'HI_VERIFY_UNAVAILABLE');
  let res;try{res=await fetch('/api/ranked/'+url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});}catch{throw safeError('HI_VERIFY_UNAVAILABLE');}
  if(!res.ok)throw safeError('HI_VERIFY_UNAVAILABLE',res.status);try{return await res.json();}catch{throw safeError('HI_RESPONSE_INVALID');}
 }
 static async create(config,onStatus,confirmFaction=false){const rules=await this.request('rules');if(rules.release!==CLIENT_RELEASE_ID)throw Error('A newer game build is ready. Reload this page before starting a verified operation.');if(rules.id!==CLIENT_RULES_ID)throw Error('This page uses older gameplay rules. Reload before starting a verified operation.');const ticket=await this.request('tickets',{config,confirmFaction});if(ticket.protocol!==PROTOCOL)throw Error('Reload to use the current verification protocol');if(!validTicket(ticket))throw safeError('HI_RESPONSE_INVALID');const client=new this(ticket,onStatus);this.remember(ticket);const active=await client.api('activate',{});client.update(active);return {client,game:createRankedGame(active.config)};}
 static async resume(onStatus){
  const saved=this.saved();if(!saved)throw Error('No verified run to reconnect');const data=await this.request('matches/'+saved.id+'?log=1',undefined,saved.token),client=new this({...data,token:saved.token},onStatus);
  if(data.accountOwned&&(['verified','rejected','aborted','verification_failed'].includes(data.status)||data.rulesId!==CLIENT_RULES_ID)){location.assign('/account/index.html?result='+encodeURIComponent(data.id));throw Error('Opening your saved result');}if(data.rulesId!==CLIENT_RULES_ID)throw Error('This run uses a different rules version. Its saved result is available from your account.');if(data.protocol!==PROTOCOL)throw Error('Verification protocol changed');if(data.status==='aborted'||data.status==='rejected')throw Error('This verified run has ended. View its result in your account.');
  if(!validTicket(data))throw safeError('HI_RESPONSE_INVALID');
  if(data.status==='issued')client.update(await client.api('activate',{}));
  const target=data.result?.tick??(data.status==='verifying'?data.throughTick:client.targetTick());const r=replay(data.config,data.actions||[],target);client.tick=r.tick;client.count=(data.actions||[]).length;return {client,game:r.game};
 }
 api(route,body){return RankedClient.request('matches/'+this.ticket.id+(route?'/'+route:''),body,this.ticket.token);}
 update(data){if(this.closed)return false;if(!validTicket(data)||data.id!==this.ticket.id||data.config.faction!==this.ticket.config.faction||data.config.rival!==this.ticket.config.rival)throw safeError('HI_RESPONSE_INVALID');this.ticket={...this.ticket,...data};this.seq=data.seq;this.throughTick=data.throughTick;this.status=data.status;this.anchor=performance.now();this.serverAnchor=data.serverNow;this.onStatus(this.summary());return true;}
 targetTick(){return Math.min(MAX_TICKS,Math.max(0,Math.floor((this.serverAnchor+performance.now()-this.anchor-this.ticket.startedAt)/50)));}
 summary(){return {id:this.ticket.id,accountOwned:!!this.ticket.accountOwned,status:this.status,tick:this.tick,acknowledgedTick:this.throughTick,commands:this.count,rulesId:this.ticket.rulesId,result:this.ticket.result||null,verification:this.ticket.verification?{state:this.ticket.verification.state,message:'Server replay is pending. Your result has not entered the standings.'}:null,error:this.error||(['rejected','aborted'].includes(this.status)?'This run has no verified points. See the saved result in your account.':null)};}
 advance(g,budget=100){if(this.closed||g.result)return;const target=Math.min(this.targetTick(),this.tick+budget);while(this.tick<target&&!g.result){tickOperation(g,STEP);this.tick++;}}
 issue(g,action){
  if(this.closed||this.status!=='active')throw Error('Reconnect to the local verifier before issuing orders');this.advance(g);
  if(this.targetTick()-this.tick>4)throw Error('Catching up to the server clock. Try the order again.');
  if(this.count>=MAX_ACTIONS)throw Error('This run reached the command limit');
  const result=applyAction(g,action);this.pending.push({tick:this.tick,action:structuredClone(action)});this.count++;return result;
 }
 attach(g){if(this.closed)return;this.game=g;this.timer=setInterval(()=>{if(document.hidden)this.advance(g,1200);this.pump().catch(()=>{});},1000);this.onStatus(this.summary());}
 async flush(){
  if(this.tick<=this.throughTick)return;
  const actions=this.pending.filter(x=>x.tick<this.tick);if(actions.length>256)throw Error('Too many orders between acknowledgments');
  const body={seq:this.seq,throughTick:this.tick,actions};
  // Keep the exact batch after a transport failure: retrying it is idempotent.
  this.inflight??=body;const ack=await this.api('commands',this.inflight);if(this.closed)return;const sent=this.inflight;
  this.pending=this.pending.filter(x=>x.tick>=sent.throughTick);this.inflight=null;this.update(ack);
 }
 async pump(){
  if(this.busy||this.closed||this.status==='interrupted')return;
  this.busy=true;this.idle=new Promise(resolve=>this.resolveIdle=resolve);try{
   if(this.status==='active'){
    await this.flush();if(this.closed)return;
    if(this.game.result){
     // A failed transport retry may acknowledge an earlier batch first.
     await this.flush();if(this.closed)return;
     if(this.finishUncertain){const current=await this.api('');if(this.closed)return;this.update(current);this.finishUncertain=false;}
     if(this.status==='active'){const digest=await stateDigest(this.game);if(this.closed)return;this.finishUncertain=true;const ack=await this.api('finish',{tick:this.tick,digest});if(this.closed)return;this.update(ack);this.finishUncertain=false;}
    }
   }else if(['verifying','verification_failed'].includes(this.status)){this.update(await this.api(''));}
   if(this.closed)return;this.failures=0;this.error=null;
   if(['verified','rejected','aborted'].includes(this.status)){clearInterval(this.timer);this.onStatus(this.summary());}
  }catch(e){if(this.closed)return;this.error=e.message;this.failures=(this.failures||0)+1;if(e.status&&e.status<500&&e.status!==429||this.failures>=3)this.status='interrupted';this.onStatus(this.summary());}
  finally{this.busy=false;this.resolveIdle?.();this.resolveIdle=null;}
 }
 async abandon(){await this.close();try{await this.api('abort',{});}finally{RankedClient.forget();}}
 close(){this.closed=true;clearInterval(this.timer);return this.idle||Promise.resolve();}
}
