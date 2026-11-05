import {clientSource} from './client-source.mjs';
import {SEASON,cookieToken,localRequest,accountError} from './accounts.mjs';
import {FACTION_IDS,MAX_TICKS} from '../game/demo/ranked-protocol.js';
export const LEADERBOARD_VERSION=1,POLICY='balanced-best-two-top20-v1',SLOTS=20,PAGE_SIZE=20;
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const compareText=(a,b)=>a<b?-1:a>b?1:0;
const compareRun=(a,b)=>b.score-a.score||b.homeHP-a.homeHP||a.tick-b.tick||a.issuedAt-b.issuedAt||compareText(a.id,b.id);
// Only the private, committed replay-result table is authoritative. No browser
// archive, posted score, anonymous capability or in-memory pending result enters.
export function eligibleRows(accounts){
 const rows=accounts.db.prepare(`SELECT m.id,m.user_id,m.season,m.ticket,m.result,m.issued_at,u.callsign,(SELECT public_id FROM user_safety a WHERE a.user_id=u.id) AS report_ref,s.faction,s.locked_at FROM account_matches m JOIN users u ON u.id=m.user_id JOIN memberships s ON s.user_id=m.user_id AND s.season=m.season WHERE m.status='verified' AND m.result IS NOT NULL AND m.season=? AND s.locked_at IS NOT NULL AND EXISTS(SELECT 1 FROM user_safety a WHERE a.user_id=u.id AND a.status='active')`).iterate(SEASON);
 // Retain at most two best rows per player/rules version. A streamed cursor
 // prevents completed-run volume from becoming an equally large JS cache.
 const eligible=new Map();
 for(const row of rows){
  let t,r;try{t=JSON.parse(row.ticket);r=JSON.parse(row.result);}catch{continue;}
  if(!t||typeof t!=='object'||!r||typeof r!=='object')continue;
  if(t.id!==row.id||t.ownerId!==row.user_id||!validHash(t.rulesId)||r.rulesId!==t.rulesId||t.config?.difficulty!=='standard'||t.config.faction!==row.faction||!FACTION_IDS.includes(row.faction)||!FACTION_IDS.includes(t.config.rival)||t.config.rival===row.faction)continue;
  if(!['victory','defeat','timeout'].includes(r.outcome)||!Number.isSafeInteger(r.score)||r.score<0||r.score>10000||r.outcome!=='victory'&&r.score!==0||!Number.isSafeInteger(r.tick)||r.tick<1||r.tick>MAX_TICKS||!Number.isFinite(r.homeHP)||r.homeHP<0||!validHash(r.digest))continue;
  const candidate={id:row.id,userId:row.user_id,callsign:row.callsign,reportRef:row.report_ref,faction:row.faction,rival:t.config.rival,rulesId:t.rulesId,issuedAt:row.issued_at,score:r.score,tick:r.tick,homeHP:r.homeHP,outcome:r.outcome},key=JSON.stringify([row.user_id,t.rulesId,t.config.rival]),previous=eligible.get(key);
  if(!previous||compareRun(candidate,previous)<0)eligible.set(key,candidate);
 }
 return [...eligible.values()];
}
export function project(rows,rulesId){
 const people=new Map();
 for(const r of rows){if(r.rulesId!==rulesId)continue;let p=people.get(r.userId);if(!p){p={userId:r.userId,callsign:r.callsign,reportRef:r.reportRef,faction:r.faction,best:{}};people.set(r.userId,p);}const before=p.best[r.rival];if(!before||compareRun(r,before)<0)p.best[r.rival]=r;}
 const groups=Object.fromEntries(FACTION_IDS.map(f=>[f,[]]));
 for(const p of people.values()){const best=Object.values(p.best);p.units=best.reduce((n,r)=>n+r.score,0);p.homeHP=best.reduce((n,r)=>n+r.homeHP,0);p.ticks=best.reduce((n,r)=>n+r.tick,0)+(2-best.length)*(MAX_TICKS+1);p.achievedAt=Math.max(...best.map(r=>r.issuedAt));groups[p.faction].push(p);}
 const factions=FACTION_IDS.map(id=>{const players=groups[id];players.sort((a,b)=>b.units-a.units||b.homeHP-a.homeHP||a.ticks-b.ticks||a.achievedAt-b.achievedAt||compareText(a.userId,b.userId));players.forEach((p,i)=>{p.rank=i+1;p.counted=i<SLOTS&&p.units>0;p.contributionUnits=p.counted?p.units:0;});const units=players.slice(0,SLOTS).reduce((n,p)=>n+p.units,0);return {id,units,points:units/(2*SLOTS),rankedPlayers:players.length,contributors:players.filter(p=>p.counted).length,slots:SLOTS};}).sort((a,b)=>b.units-a.units||compareText(a.id,b.id));
 for(let i=0;i<factions.length;i++)factions[i].rank=factions[i].rankedPlayers===0?null:1+factions.filter(f=>f.units>factions[i].units).length;
 return {people,groups,factions};
}
function publicPlayer(p,viewerId,totalUnits){return {reportRef:p.reportRef,rank:p.rank,callsign:p.callsign,faction:p.faction,score:p.units/2,counted:p.counted,contribution:p.contributionUnits/(2*SLOTS),sharePercent:totalUnits?p.contributionUnits/totalUnits*100:0,isMe:p.userId===viewerId,best:FACTION_IDS.filter(f=>f!==p.faction).map(rival=>{const r=p.best[rival];return {rival,score:r?.score??null,outcome:r?.outcome??null,seconds:r?r.tick*.05:null,...(r&&p.userId===viewerId?{matchId:r.id}:{})};})};}
const caches=new WeakMap();
function standings(accounts,ranked){
 const revision=accounts.db.prepare("SELECT value FROM operations_state WHERE key='standingsRevision'").get()?.value||'0';
 let cache=caches.get(accounts);if(!cache||cache.revision!==revision){const rows=eligibleRows(accounts);cache={revision,rows,versions:[ranked.rules.id,...new Set(rows.map(r=>r.rulesId).filter(id=>id!==ranked.rules.id).sort())],projects:new Map()};caches.set(accounts,cache);}
 return cache;
}
export function leaderboardSnapshot(accounts,ranked,{faction,offset=0,rulesId=ranked.rules.id,viewerId=null}={}){
 if(accounts.operationState().publication==='paused')accountError(503,'Standings are temporarily paused for review. Verified results are still saved.');const cache=standings(accounts,ranked),{rows,versions}=cache;
 if(!validHash(rulesId)||!versions.includes(rulesId))accountError(400,'Unknown gameplay rules version.');
 const profile=viewerId?accounts.profile(viewerId):null;faction??=profile?.membership?.faction||FACTION_IDS[0];
 if(!FACTION_IDS.includes(faction))accountError(400,'Unknown faction.');if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)accountError(400,'Invalid leaderboard page.');
 if(!cache.projects.has(rulesId))cache.projects.set(rulesId,project(rows,rulesId));const projected=cache.projects.get(rulesId),team=id=>projected.factions.find(f=>f.id===id),players=projected.groups[faction],page=players.length?Math.min(offset,Math.floor((players.length-1)/PAGE_SIZE)*PAGE_SIZE):0;
 let me=null;
 if(profile){const f=profile.membership.faction,p=projected.people.get(viewerId),ownTeam=team(f);me={callsign:profile.callsign,faction:f,rank:null,score:0,contribution:0,sharePercent:0,counted:false,best:FACTION_IDS.filter(id=>id!==f).map(rival=>({rival,score:null,outcome:null,seconds:null})),...(p?publicPlayer(p,viewerId,ownTeam.units):{}),rankedPlayers:ownTeam.rankedPlayers,factionRank:ownTeam.rank,pending:accounts.db.prepare("SELECT COUNT(*) AS n FROM account_matches WHERE user_id=? AND season=? AND status IN ('issued','active','verifying','verification_failed') AND json_extract(ticket,'$.rulesId')=?").get(viewerId,SEASON,rulesId).n};}
 return {version:LEADERBOARD_VERSION,policy:POLICY,season:SEASON,rulesId,currentRulesId:ranked.rules.id,versions,updatedAt:accounts.now(),provisional:projected.factions.some(f=>f.rankedPlayers<5),factions:projected.factions.map(({units,...f})=>f),players:{faction,offset:page,limit:PAGE_SIZE,total:players.length,rows:players.slice(page,page+PAGE_SIZE).map(p=>publicPlayer(p,viewerId,team(faction).units))},me};
}
export function leaderboardHandler(accounts,ranked,port){return async(req,res,url)=>{
 if(url.pathname!=='/api/leaderboards')return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 try{localRequest(req,port,'local-leaderboards-v1');accounts.limit('boards:'+accounts.sourceKey(clientSource(req,port)),120,60000);if(req.method!=='GET')accountError(405,'Leaderboards are read-only.');for(const [key] of url.searchParams)if(!['faction','rulesId','offset'].includes(key)||url.searchParams.getAll(key).length!==1)accountError(400,'Unsupported leaderboard filter.');const viewer=accounts.session(cookieToken(req));send(200,leaderboardSnapshot(accounts,ranked,{faction:url.searchParams.get('faction')??undefined,rulesId:url.searchParams.get('rulesId')??undefined,offset:Number(url.searchParams.get('offset')||0),viewerId:viewer?.id}));}catch(e){if([429,503].includes(e.status))res.setHeader('Retry-After',String(e.retryAfter||5));send(e.status||503,{error:e.status?e.message:'Standings are temporarily unavailable.'});}return true;
};}
