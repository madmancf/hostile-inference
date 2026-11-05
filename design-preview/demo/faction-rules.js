import {techBonuses,techCompute,heatThreshold} from './faction-tech.js';
import { ROLES } from '../servers/roles.js';
import { UNITS } from '../v2/world.js';

// One source for simulation, production cards, teaching and opponent composition.
// Cached definitions: no per-frame stat-object allocation.
export const FACTION_KITS = {
  misanthropic: {
    name: 'Contain. Then advance.', rule: 'Constitutions establish a ward after holding still for 3 seconds. Allies within 145m take 20% less damage; Oracles inside deal 20% more.',
    tactic: 'Advance with a Constitution, stop to establish its ward, then let the long-range Oracle fire. Quarantine restores the formation.',
    counter: 'Force its slow formation to move. Disable or focus the Constitution to collapse the ward.',
    opening: 'firewall', openingCount: 2, openingPlan:[['firewall',2],['model',2]], army: {model:4, firewall:4, agent:1, malware:1},
    waves: [['firewall','malware'],['model','firewall'],['agent','firewall']], cadence: 105,
    cloudCapacity:24, cooling:.8, harvestFunds:170, harvestEnergy:40, chargeSeconds:5,
    stats:{model:{hp:500,speed:48,range:135,dps:22,compute:14,time:18,cost:820},firewall:{hp:280,speed:52,range:112,dps:10,time:9,cost:380},agent:{hp:125,speed:80,range:98,dps:9},malware:{hp:110,speed:68,range:116,dps:8},harvester:{speed:72}},
    units:{
      researcher:['Peer review','Repairs nearby allies at 4 HP/s.','Cleanse and repair allies within 145m for 55 HP; restore 18 quality.'],
      harvester:['Microgrid','Slower batteries deliver 40 energy and 170 funds.','Discharge a reserve: +35 energy immediately.'],
      agent:['Formal objection','Hits suppress enemy firing speed for 4s. Exposed staff are locked out.','Lock unprotected enemies within 135m for 6s.'],
      malware:['Contradiction','Suppression packets slow firing for 4s; no infection damage over time.','Suppress enemies within 135m for 12s. Firewalls block it.'],
      model:['Refusal field','Long-range, durable Oracle. +20% damage inside an established ward.','Deal 40 damage within 135m and suppress unprotected survivors for 8s.'],
      firewall:['Quarantine','Hold still 3s: establish a 145m ward with 20% damage reduction. Moving or lockout breaks it.','Establish the ward immediately; cleanse and repair allies within 145m for 35 HP.'],
      cooler:['Cold reserve','Anchored Thermal Ark cools at 0.8°/s.','At the intake: shed 18 heat.'],
      cloud:['Air gap','Anchored monastery adds 24 compute.','At the intake: restore 15 quality and 20 energy.']
    }
  },
  closed: {
    name:'Connect. Mark. Concentrate.', rule:'Gatekeepers link allies within 155m. Linked Black Boxes ramp damage against the same target. Access Brokers mark targets for 25% extra damage from linked allies.',
    tactic:'Keep a Gatekeeper beside Black Boxes. Focus one target with a Broker; severed links reset the damage ramp. Private Clouds fund the network.',
    counter:'Separate the Gatekeeper from its models or lock it out. Force Black Boxes to switch targets.',
    opening:'model', openingCount:2, openingPlan:[['model',2],['firewall',2]], army:{model:4,firewall:3,agent:2,malware:1},
    waves:[['agent','firewall'],['model','agent'],['malware','firewall']], cadence:95,
    cloudCapacity:32,cooling:.72,harvestFunds:110,harvestEnergy:45,chargeSeconds:12,
    stats:{model:{hp:430,speed:57,range:135,dps:23,compute:12,time:15,cost:780},firewall:{hp:230,speed:65,range:106,dps:12,cost:360},agent:{speed:95,range:120,dps:8},malware:{hp:95,range:100,dps:8},cloud:{time:14,cost:1000}},
    units:{
      researcher:['Fine-tune','Repairs nearby allies. Staff keeps the deployment queue online.','Cleanse and heal nearby allies for 35 HP; accelerate the staffed queue by 60% for 8s.'],
      harvester:['Priority charging','Delivers 45 energy and 110 funds per battery.','Gain 25 energy and accelerate the staffed queue by 60% for 8s.'],
      agent:['Access revoked','Marks a target for 8s: linked allies deal 25% extra damage to it.','Mark nearby enemies for 14s; lock unprotected targets for 4s.'],
      malware:['Meter drain','Unprotected hits steal 4 funds and restore 6 HP; firewall envelopes block the theft.','Siphon up to 18 HP per unprotected enemy within 135m and recover half as health.'],
      model:['Exclusive endpoint','Linked hits against one target ramp by 7 damage, up to +21. Switching targets resets the ramp.','Gain +50% damage for 6s. Requires an active Gatekeeper link.'],
      firewall:['Allowlist','Links allies within 155m and blocks infections and staff lockouts.','Cleanse and heal linked allies for 35 HP; give them 25% damage reduction for 8s.'],
      cooler:['Closed loop','At the intake, cools at 0.72°/s.','At the intake: shed 12 heat and recover 20 energy.'],
      cloud:['Private region','At the intake: +32 compute and +2 funds/s per cloud (maximum two income bonuses).','At the intake: accelerate the staffed queue by 60% for 8s and gain 25 energy.']
    }
  },
  broke: {
    name:'Burst. Vent. Repeat.', rule:'Fast, cheaper Unfiltered models generate heat with every shot. Reply Swarms splash up to two extra targets. No Filter gives a 6s burst, then 5s of reduced damage.',
    tactic:'Raid with cheap Swarms and fast models. Trigger No Filter at contact, then use Cold Take before heat reaches 70° and throttles inference.',
    counter:'Spread out against Swarms. Survive the burst, then attack during the recovery window. Pressure the cooling economy.',
    opening:'malware',openingCount:2,openingPlan:[['malware',2],['model',2]],army:{model:4,firewall:2,agent:1,malware:4},
    waves:[['malware','malware','agent'],['model','malware'],['agent','malware']],cadence:75,
    cloudCapacity:24,cooling:1.65,harvestFunds:120,harvestEnergy:40,chargeSeconds:3,
    stats:{model:{hp:390,speed:83,range:112,dps:32,compute:10,time:10,cost:620},firewall:{hp:200,speed:82,range:98,dps:14,time:5,cost:300},agent:{hp:95,speed:112,range:76,dps:11,time:5,cost:350},malware:{hp:72,speed:102,range:90,dps:12,compute:2,time:4,cost:220},harvester:{speed:96},cooler:{speed:100}},
    units:{
      researcher:['Ship tonight','Faster validation; repairs nearby allies.','Advance a staffed production queue by 5s, at the cost of 6 quality and 5 heat.'],
      harvester:['Power grab','Fast battery route: 3s charge time, 40 energy and 120 funds.','Gain 50 energy immediately; add 8 heat.'],
      agent:['Offer letter','Very fast, fragile raider. Exposed researcher hits lock production.','Lock unprotected enemies within 135m for 6s; gain 20 funds per exposed researcher.'],
      malware:['Reply storm','Hits splash 35% damage onto up to two enemies within 65m. No persistent infection.','Blast up to four enemies within 135m for 35 damage. Adds 4 heat.'],
      model:['No filter','Cheap, fast, fragile attacker. Each shot adds 0.55 heat to home.','For 6s: +55% damage and +25% movement. Then 5s at 60% damage. Adds 8 heat.'],
      firewall:['Hot patch','Fast security escort; smaller 95m protection envelope.','Cleanse and repair allies within 135m for 65 HP. Adds 3 heat.'],
      cooler:['Cold take','At the intake: heavy cooling at 1.65°/s.','At the intake: vent 28 heat. Recharges in 30s.'],
      cloud:['Failover raft','At the intake: +24 compute.','At the intake: shed 15 heat and restore 8 quality.']
    }
  }
};
const definitions=Object.fromEntries(Object.entries(FACTION_KITS).map(([f,k])=>[f,Object.fromEntries(ROLES.map(r=>[r.key,Object.freeze({...r,cost:UNITS[f][r.index].cost,...k.stats[r.key]})]))]));
export const unitType=(faction,role)=>definitions[faction][role];
export const kit=faction=>FACTION_KITS[faction];
export function unitGuide(faction,role,base={},g=null){
 const [ability,job,effect]=kit(faction).units[role],t=unitType(faction,role),b=g?techBonuses(g,faction):{};
 const text=s=>s.replace(kit(faction).harvestEnergy+' energy',(kit(faction).harvestEnergy+(b.harvestEnergy||0))+' energy').replace(kit(faction).harvestFunds+' funds',(kit(faction).harvestFunds+(b.harvestFunds||0))+' funds').replace(/(adds? |and )(\d+) heat/gi,(_,prefix,n)=>prefix+(Number(n)*(1+(b.heatGain||0)))+' heat').replaceAll('145m',(145+(b.wardRange||0))+'m').replaceAll('155m',(155+(b.linkRange||0))+'m').replace('20% damage reduction',Math.round(20+(b.wardReduction||0)*100)+'% damage reduction').replace('7 damage, up to +21',(7+(b.focusDamage||0))+' damage, up to +'+(3*(7+(b.focusDamage||0)))).replace('25% extra damage',Math.round(25+(b.markDamage||0)*100)+'% extra damage').replace('+55% damage','+'+Math.round(55+(b.burstDamage||0)*100)+'% damage').replace('Then 5s','Then '+(5+(b.recovery||0))+'s').replace('vent 28 heat','vent '+(28+(b.coolerBurst||0))+' heat').replace('Recharges in 30s.','').replace('0.55 heat',((.55+(b.shotHeat||0))*(1+(b.heatGain||0))).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')+' heat');
 const cp=g?techCompute(g,faction,role,t.compute):t.compute,recharge=Math.round((role==='cooler'?30:22)*(1+(b.abilityRecharge||0))*10)/10;
 return {...base,job:text(job),order:`E · ${ability}: ${text(effect)} 60 funds per unit. ${recharge}s recharge.`,counter:kit(faction).counter,ability,effect:text(effect),stats:`${t.hp} HP · ${cp} compute · ${t.time}s base assembly`};
}

const nearby=(a,b,r)=>a.hp>0&&b.hp>0&&!a.transit&&!b.transit&&a.server===b.server&&Math.hypot(a.x-b.x,a.y-b.y)<r;
export function protector(g,u){return g.units.find(f=>f.team===u.team&&f.role==='firewall'&&f.locked===0&&nearby(f,u,f.faction==='broke'?95:f.faction==='closed'?155+(techBonuses(g,f.faction).linkRange||0):145+(techBonuses(g,f.faction).wardRange||0)));}
export function warded(g,u){return g.units.some(f=>f.faction==='misanthropic'&&f.role==='firewall'&&f.team===u.team&&f.locked===0&&(f.settled||0)>=3&&!f.moving&&nearby(f,u,145+(techBonuses(g,f.faction).wardRange||0)));}
export function linked(g,u){return g.units.some(f=>f.faction==='closed'&&f.role==='firewall'&&f.team===u.team&&f.locked===0&&nearby(f,u,155+(techBonuses(g,f.faction).linkRange||0)));}
export function updateFactionState(g,dt){
 for(const u of g.units){
  u.settled=u.hp>0&&!u.transit&&u.locked===0&&!u.moving?Math.min(3,(u.settled||0)+dt):0;
  u.ward=warded(g,u);u.linked=linked(g,u);if(u.hp>0&&u.ward)u.hp=Math.min(u.maxHp,u.hp+dt*(techBonuses(g,u.faction).wardRegen||0));
  if(!u.linked){u.focusTarget=null;u.focusStacks=0;}
 }
}
export function attackPower(g,u,targetId,base){
 let damage=base;
 if(u.faction==='misanthropic'&&u.role==='model'&&warded(g,u))damage*=1.2;
 if(u.faction==='closed'&&u.role==='model'&&linked(g,u)){
  u.focusStacks=u.focusTarget===targetId?Math.min(3,(u.focusStacks||0)+1):0;u.focusTarget=targetId;
  damage+=(u.focusStacks||0)*(7+(techBonuses(g,u.faction).focusDamage||0));
 }
 if((u.boostUntil||0)>g.time)damage*=u.faction==='broke'?1.55+(techBonuses(g,u.faction).burstDamage||0):1.5;
 else if((u.recoveryUntil||0)>g.time)damage*=.6;
 if(u.faction==='broke'&&u.role==='model')addHeat(g,u,.55+(techBonuses(g,u.faction).shotHeat||0));
 return damage;
}
export function receiveDamage(g,u,amount){
 if(u.hp<=0)return 0;
 if(warded(g,u))amount*=.8-(techBonuses(g,u.faction).wardReduction||0);if(linked(g,u))amount*=1-(techBonuses(g,u.faction).linkedArmour||0);
 if((u.armourUntil||0)>g.time)amount*=.75;
 if(u.team==='player'&&g.faction==='misanthropic'&&(g.operation?.boostUntil||0)>g.time)amount*=.65;
 const actual=Math.min(u.hp,amount);u.hp-=amount;u.hit=.3;return actual;
}
export function onHit(g,u,target,damage){
 const protectedTarget=protector(g,target);
 if(u.faction==='misanthropic'&&['agent','malware'].includes(u.role)&&!protectedTarget)target.suppressedUntil=g.time+4;
 if(u.faction==='closed'&&u.role==='agent'){target.markedUntil=g.time+8;target.markedBy=u.faction;}
 if(u.faction==='closed'&&u.role==='malware'&&!protectedTarget){u.hp=Math.min(u.maxHp,u.hp+6);if(u.team==='player')g.funds+=4;else if(g.operation)g.operation.enemyFunds+=4;}
 if(u.faction==='broke'&&u.role==='malware'){
  let count=0;for(const other of g.units){if(other===target||other.team===u.team||other.hp<=0||other.transit||other.server!==target.server||Math.hypot(target.x-other.x,target.y-other.y)>=65||unitType(other.faction,other.role).domain!=='land')continue;receiveDamage(g,other,damage*.35*(protector(g,other)?.4:1));if(++count===2)break;}
 }
 if(u.role==='agent'&&target.role==='researcher'&&!protectedTarget)target.locked=Math.max(target.locked,5);
}
export function abilityProblem(g,u){
 if(!u||u.hp<=0||u.transit||u.locked>0||u.abilityCooldown>0)return 'Unit is unavailable or recharging.';
 if(['cooler','cloud'].includes(u.role)&&(u.server!==u.faction||u.order!=='cool'||u.path.length))return 'Anchor this vessel at the home intake first.';
 if(u.faction==='closed'&&u.role==='model'&&!linked(g,u))return `Exclusive Endpoint needs a Gatekeeper within ${155+(techBonuses(g,u.faction).linkRange||0)}m.`;
 if(u.faction==='broke'&&u.role==='researcher'&&(!(u.team==='player'?g.queue:g.operation?.enemyQueue)?.length||(u.team==='player'?g.operation?.productionPaused:g.operation?.enemyProductionPaused)))return 'Staff the lab and queue a unit before Ship Tonight.';
 return null;
}
function addHeat(g,u,n){n*=1+(techBonuses(g,u.faction).heatGain||0);if(u.team==='player')g.heat=Math.min(100,g.heat+n);else if(g.operation)g.operation.enemyHeat=Math.min(100,(g.operation.enemyHeat??30)+n);}
export function castFactionAbility(g,u){
 const own=u.team==='player',queue=own?g.queue:g.operation?.enemyQueue;
 const resource=(key,amount,min=0,max=160)=>{const target=own?g:g.operation,k=own?key:'enemy'+key[0].toUpperCase()+key.slice(1);if(target)target[k]=Math.max(min,Math.min(max,(target[k]??(key==='quality'?100:0))+amount));};
 const priority=()=>{if(own)g.priorityUntil=g.time+8;else if(g.operation)g.operation.enemyPriorityUntil=g.time+8;};
 const f=u.faction,r=u.role,allies=g.units.filter(e=>e.team===u.team&&nearby(u,e,f==='misanthropic'?145+(techBonuses(g,f).wardRange||0):f==='closed'?155+(techBonuses(g,f).linkRange||0):135)),enemies=g.units.filter(e=>e.team!==u.team&&nearby(u,e,135)&&unitType(e.faction,e.role).domain==='land');
 const heal=n=>{for(const e of allies){e.infected=e.locked=0;e.suppressedUntil=0;e.hp=Math.min(e.maxHp,e.hp+n);}};
 if(r==='firewall'||r==='researcher'&&f!=='broke')heal(f==='broke'?65:f==='misanthropic'&&r==='researcher'?55:35);
 if(r==='firewall'){
  if(f==='misanthropic'){u.path=[];u.arrival=null;u.order='hold';u.raid=null;u.currentSpeed=0;u.moving=false;u.settled=3;}
  if(f==='closed')for(const e of allies)e.armourUntil=g.time+8;
  if(f==='broke')addHeat(g,u,3);
 }
 if(r==='researcher'){
  if(f==='misanthropic')resource('quality',18,0,100);
  if(f==='closed')priority();
  if(f==='broke'){if(queue?.length){queue[0].remaining=Math.max(.01,queue[0].remaining-5);resource('quality',-6,30,100);addHeat(g,u,5);}}
 }
 if(r==='harvester'){resource('energy',f==='broke'?50:f==='misanthropic'?35:25);if(f==='broke')addHeat(g,u,8);if(f==='closed')priority();}
 if(r==='cooler'){resource('heat',-(f==='broke'?28+(techBonuses(g,f).coolerBurst||0):f==='closed'?12:18),10,100);if(f==='closed')resource('energy',20);}
 if(r==='cloud'){if(f==='broke'){resource('heat',-15,10,100);resource('quality',8,0,100);}else{resource('energy',f==='closed'?25:20);if(f==='closed')priority();else resource('quality',15,0,100);}}
 if(r==='agent')for(const e of enemies){if(f==='closed'){e.markedUntil=g.time+14;e.markedBy=f;}if(!protector(g,e)){e.locked=Math.max(e.locked,f==='closed'?4:6);if(f==='broke'&&e.role==='researcher'){if(u.team==='player')g.funds+=20;else if(g.operation)g.operation.enemyFunds+=20;}}}
 if(r==='model'){
  if(f==='misanthropic')for(const e of enemies){receiveDamage(g,e,40);if(!protector(g,e))e.suppressedUntil=g.time+8;}
  else{u.boostUntil=g.time+6;if(f==='broke'){u.recoveryUntil=g.time+11+(techBonuses(g,f).recovery||0);addHeat(g,u,8);}}
 }
 if(r==='malware'){
  if(f==='misanthropic')for(const e of enemies)if(!protector(g,e))e.suppressedUntil=g.time+12;
  if(f==='closed')for(const e of enemies)if(!protector(g,e)){const n=receiveDamage(g,e,18);u.hp=Math.min(u.maxHp,u.hp+n/2);}
  if(f==='broke'){for(const e of enemies.slice(0,4))receiveDamage(g,e,35*(protector(g,e)?.4:1));addHeat(g,u,4);}
 }
 u.abilityCooldown=(r==='cooler'?30:22)*(1+(techBonuses(g,f).abilityRecharge||0));
}
export function unitState(g,u){
 if((u.boostUntil||0)>g.time)return (u.faction==='closed'?'FOCUS ':'BURST ')+Math.ceil(u.boostUntil-g.time)+'s';
 if((u.recoveryUntil||0)>g.time)return 'RECOVERY '+Math.ceil(u.recoveryUntil-g.time)+'s';
 if((u.markedUntil||0)>g.time)return 'MARKED';
 if((u.suppressedUntil||0)>g.time)return 'SUPPRESSED';
 if(u.faction==='misanthropic')return warded(g,u)?'WARDED':u.role==='firewall'?'WARD '+Math.floor((u.settled||0)/3*100)+'%':'';
 if(u.faction==='closed')return linked(g,u)?'LINKED'+(u.role==='model'?' · RAMP '+(u.focusStacks||0)+'/3':''):'UNLINKED';
 return '';
}
