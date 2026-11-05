import {CLIENT_RULES_ID,CLIENT_RELEASE_ID} from './rules-version.js';
import {PROTOCOL,STEP,MAX_TICKS,MAX_ACTIONS,applyAction,createRankedGame,replay,stateDigest} from './ranked-protocol.js';
import {tickOperation} from './operation.js';
const KEY='hostile-inference.verified-ticket.v1';
export class RankedClient {
 constructor(ticket,onStatus=()=>{}){this.ticket=ticket;this.onStatus=onStatus;this.tick=0;this.pending=[];this.seq=ticket.seq;this.throughTick=ticket.throughTick;this.count=0;this.status=ticket.status;this.anchor=performance.now();this.serverAnchor=ticket.serverNow;this.closed=false;}
 static saved(){try{return JSON.parse(sessionStorage.getItem(KEY));}catch{return null;}}
 static remember(ticket){sessionStorage.setItem(KEY,JSON.stringify({id:ticket.id,...(ticket.token?{token:ticket.token}:{})}));}
 static forget(){sessionStorage.removeItem(KEY);}
 static async request(url,body,token){
  const res=await fetch('/api/ranked/'+url,{method:body===undefined?'GET':'POST',headers:{'X-HI-Client':'local-ranked-v1','X-HI-Build':CLIENT_RELEASE_ID,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6000)});
  const data=await res.json();if(!res.ok){const e=Error(data.error||'Local verification unavailable');e.status=res.status;throw e;}return data;
 }
 static async create(config,onStatus,confirmFaction=false){const rules=await this.request('rules');if(rules.release!==CLIENT_RELEASE_ID)throw Error('A newer game build is ready. Reload this page before starting a verified operation.');if(rules.id!==CLIENT_RULES_ID)throw Error('This page uses older gameplay rules. Reload before starting a verified operation.');const ticket=await this.request('tickets',{config,confirmFaction});if(ticket.protocol!==PROTOCOL)throw Error('Reload to use the current verification protocol');const client=new this(ticket,onStatus);this.remember(ticket);const active=await client.api('activate',{});client.update(active);return {client,game:createRankedGame(active.config)};}
 static async resume(onStatus){
  const saved=this.saved();if(!saved)throw Error('No verified run to reconnect');const data=await this.request('matches/'+saved.id+'?log=1',undefined,saved.token),client=new this({...data,token:saved.token},onStatus);
  if(data.accountOwned&&(['verified','rejected','aborted','verification_failed'].includes(data.status)||data.rulesId!==CLIENT_RULES_ID)){location.assign('/account/index.html?result='+encodeURIComponent(data.id));throw Error('Opening your saved result');}if(data.rulesId!==CLIENT_RULES_ID)throw Error('This run uses a different rules version. Its saved result is available from your account.');if(data.protocol!==PROTOCOL)throw Error('Verification protocol changed');if(data.status==='aborted'||data.status==='rejected')throw Error(data.error||'This run has ended');
  if(data.status==='issued')client.update(await client.api('activate',{}));
  const target=data.result?.tick??(data.status==='verifying'?data.throughTick:client.targetTick());const r=replay(data.config,data.actions||[],target);client.tick=r.tick;client.count=(data.actions||[]).length;return {client,game:r.game};
 }
 api(route,body){return RankedClient.request('matches/'+this.ticket.id+(route?'/'+route:''),body,this.ticket.token);}
 update(data){this.ticket={...this.ticket,...data};this.seq=data.seq;this.throughTick=data.throughTick;this.status=data.status;this.anchor=performance.now();this.serverAnchor=data.serverNow;this.onStatus(this.summary());}
 targetTick(){return Math.min(MAX_TICKS,Math.max(0,Math.floor((this.serverAnchor+performance.now()-this.anchor-this.ticket.startedAt)/50)));}
 summary(){return {id:this.ticket.id,accountOwned:!!this.ticket.accountOwned,status:this.status,tick:this.tick,acknowledgedTick:this.throughTick,commands:this.count,rulesId:this.ticket.rulesId,result:this.ticket.result||null,verification:this.ticket.verification||null,error:this.error||this.ticket.error||null};}
 advance(g,budget=100){if(g.result)return;const target=Math.min(this.targetTick(),this.tick+budget);while(this.tick<target&&!g.result){tickOperation(g,STEP);this.tick++;}}
 issue(g,action){
  if(this.closed||this.status!=='active')throw Error('Reconnect to the local verifier before issuing orders');this.advance(g);
  if(this.targetTick()-this.tick>4)throw Error('Catching up to the server clock. Try the order again.');
  if(this.count>=MAX_ACTIONS)throw Error('This run reached the command limit');
  const result=applyAction(g,action);this.pending.push({tick:this.tick,action:structuredClone(action)});this.count++;return result;
 }
 attach(g){this.game=g;this.timer=setInterval(()=>{if(document.hidden)this.advance(g,1200);this.pump().catch(()=>{});},1000);this.onStatus(this.summary());}
 async flush(){
  if(this.tick<=this.throughTick)return;
  const actions=this.pending.filter(x=>x.tick<this.tick);if(actions.length>256)throw Error('Too many orders between acknowledgments');
  const body={seq:this.seq,throughTick:this.tick,actions};
  // Keep the exact batch after a transport failure: retrying it is idempotent.
  this.inflight??=body;const ack=await this.api('commands',this.inflight);const sent=this.inflight;
  this.pending=this.pending.filter(x=>x.tick>=sent.throughTick);this.inflight=null;this.update(ack);
 }
 async pump(){
  if(this.busy||this.closed||this.status==='interrupted')return;
  this.busy=true;this.idle=new Promise(resolve=>this.resolveIdle=resolve);try{
   if(this.status==='active'){
    await this.flush();
    if(this.game.result){
     // A failed transport retry may acknowledge an earlier batch first.
     await this.flush();const digest=await stateDigest(this.game);this.update(await this.api('finish',{tick:this.tick,digest}));
    }
   }else if(['verifying','verification_failed'].includes(this.status)){this.update(await this.api(''));}
   this.failures=0;this.error=null;
   if(['verified','rejected','aborted'].includes(this.status)){clearInterval(this.timer);this.onStatus(this.summary());}
  }catch(e){this.error=e.message;this.failures=(this.failures||0)+1;if(e.status&&e.status<500&&e.status!==429||this.failures>=3)this.status='interrupted';this.onStatus(this.summary());}
  finally{this.busy=false;this.resolveIdle?.();this.resolveIdle=null;}
 }
 async abandon(){await this.close();try{await this.api('abort',{});}finally{RankedClient.forget();}}
 close(){this.closed=true;clearInterval(this.timer);return this.idle||Promise.resolve();}
}
