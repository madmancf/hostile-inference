import {accountURL,playURL} from '../entry-flow.js';
import {FACTIONS} from '../v2/world.js';
import {readJSON} from './ranked-client.js';
const factions=['misanthropic','closed','broke'],number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function validStandings(data,identity){
 const me=data?.me;
 return data?.version===1&&data.policy==='balanced-best-two-top20-v1'&&data.rulesId===identity.rulesId&&me?.faction===identity.faction&&(me.rank===null||Number.isSafeInteger(me.rank)&&me.rank>0)&&number(me.score)&&number(me.contribution)&&typeof me.counted==='boolean'&&Array.isArray(me.best)&&me.best.length===2&&new Set(me.best.map(b=>b.rival)).size===2&&me.best.every(b=>factions.includes(b.rival)&&b.rival!==me.faction&&(b.score===null||number(b.score)&&b.score<=10000));
}
export function contributionCopy(data,baseline,rival){
 const me=data.me,best=me.best.find(b=>b.rival===rival),previous=baseline?.me.best.find(b=>b.rival===rival),fmt=n=>new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(n);
 const improvement=best?.score===null?'No eligible best against this rival.':previous?.score===undefined?'Best against this rival: '+fmt(best.score)+'.':previous.score===null?'First eligible best against this rival: '+fmt(best.score)+'.':best.score>previous.score?'Rival best improved by '+fmt(best.score-previous.score)+'.':'Your rival best is unchanged.';
 const rank=me.rank===null?'Rank unavailable.':'Your faction rank: #'+me.rank+'.';
 const contribution=me.counted?'Current faction contribution: '+fmt(me.contribution)+'.':me.rank>20?'Current faction contribution: 0. You are outside the top 20.':me.rank===null?'Current faction contribution: 0. Not counted; reason unavailable.':'Current faction contribution: '+fmt(me.contribution)+'. No positive contribution recorded.';
 const bests=me.best.map(b=>FACTIONS[b.rival].name+': '+(b.score===null?'unplayed':fmt(b.score))).join(' · '),next=me.best.find(b=>b.score===null)||[...me.best].sort((a,b)=>a.score-b.score)[0];
 return improvement+' Personal bests — '+bests+'. '+rank+' '+contribution+' Next: '+(next.score===null?'play ':'improve your best against ')+FACTIONS[next.rival].name+'. Repeat runs improve your best; they do not stack points.';
}
// A request belongs to one account/run/rules identity and one monotonic request generation.
// Baseline is separate and may never stand in for unavailable current standings.
export class DebriefStandings{
 constructor(onChange=()=>{}){this.onChange=onChange;this.generation=0;this.identity=null;this.baseline=null;this.current=null;this.status='idle';}
 reset(identity=null){this.generation++;this.identity=identity;this.baseline=this.current=null;this.status='idle';}
 async load(current=false){
  const identity=this.identity,serial=++this.generation;if(!identity)return;
  if(current){this.current=null;this.status='loading';this.onChange();}
  try{const data=await readJSON('/api/leaderboards?'+new URLSearchParams({faction:identity.faction,rulesId:identity.rulesId}),{'X-HI-Client':'local-leaderboards-v1'},'HI_STANDINGS_UNAVAILABLE');
   if(serial!==this.generation||identity!==this.identity)return;
   if(!validStandings(data,identity))throw Error('HI_RESPONSE_INVALID');
   if(current){this.current=data;this.status='ready';}else this.baseline=data;
  }catch{if(serial!==this.generation||identity!==this.identity)return;if(current){this.current=null;this.status='unavailable';}}
  if(current)this.onChange();
 }
}

// The trained faction and server-owned allegiance are separate destinations.
export function trainingHandoff(faction,rival,user){
 const trained=FACTIONS[faction].name,member=user?.membership,joined=member&&FACTIONS[member.faction];
 return {practice:'Practice '+trained+' ↗',ranked:joined?'Play for '+joined.name+' ↗':'Join '+trained+' & play for your faction ↗',href:joined?playURL(member.faction,'ranked',rival):accountURL(faction),
  note:joined&&member.faction!==faction?'You trained as '+trained+'. Verified play represents '+joined.name+'. '+(member.lockedAt!==null?'Your allegiance is locked; other factions remain available in practice.':'You can change allegiance explicitly in your account before committing.'):'Practice is unranked. Faction points require a server-verified operation.',
  changeHref:joined&&member.faction!==faction&&member.lockedAt===null?accountURL(faction):null};
}
