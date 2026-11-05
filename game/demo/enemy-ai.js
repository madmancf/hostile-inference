import {FACTIONS} from '../v2/world.js';
import {unitType,kit,abilityProblem,castFactionAbility,protector,linked} from './faction-rules.js';
import {tree,nodeInfo,techBonuses,techCost,techCompute,heatThreshold,startProject,cancelProject,repairFacility,researchStaffed,projectProblem} from './faction-tech.js';
import {spawn,command,point,distance,nearestNode,scheduleTransfer,orderFacility} from './engine.js';

const combat=u=>unitType(u.faction,u.role).dps>0;
const alive=u=>u.hp>0;
const tell=(g,text)=>{g.events.unshift({time:g.time,text});g.events.length=Math.min(8,g.events.length);};
export const ENEMY_PLANS={
 misanthropic:{name:'Protected advance',intent:'Build wards, escort Oracles and hold ground. Break the Constitution before engaging its models.',opening:[0,1,2],army:{model:3,firewall:3,agent:1,malware:1}},
 closed:{name:'Linked strike team',intent:'Fund a linked force, mark a target and concentrate fire. Separate its Gatekeepers from the Black Boxes.',opening:[1,0,2],army:{model:3,firewall:2,agent:2,malware:1}},
 broke:{name:'Burst and recover',intent:'Mass cheap raiders, vent heat and attack in bursts. Survive No Filter, then punish the recovery.',opening:[0,2,1],army:{model:3,firewall:2,agent:1,malware:3}}
};
export function initEnemyAI(g){
 const op=g.operation;if(!op)return null;
 // Lazy migration adds decision state, never free units, funds or finished research.
 op.enemyEnergy??=100;op.enemyHeat??=30;op.enemyQuality??=100;op.enemyQueue??=[];
 op.enemyAI??={version:1,nextDecision:g.time,nextProject:Math.max(18,g.time),mode:'establish',lastLosses:0,losses:0,produced:0,deliveries:0,decisions:0,projects:0,abilities:0,repairs:0,retreats:0,scouted:[],lastRoster:g.units.filter(u=>u.team===op.rival&&alive(u)).map(u=>u.id),history:[]};
 return op.enemyAI;
}
function record(g,kind,detail){const ai=g.operation.enemyAI;ai.history.push({time:Math.round(g.time),kind,detail});if(ai.history.length>32)ai.history.shift();}
export function enemyCapacity(g){
 const op=g.operation,f=op.rival,units=g.units.filter(u=>u.team===f&&alive(u)),b=techBonuses(g,f);
 const clouds=units.filter(u=>u.role==='cloud'&&u.server===f&&!u.transit&&distance(u,point('intake',f))<85).length;
 return {used:units.reduce((n,u)=>n+techCompute(g,f,u.role,unitType(f,u.role).compute),0)+op.enemyQueue.reduce((n,q)=>n+techCompute(g,f,q.role,unitType(f,q.role).compute),0),capacity:44+clouds*kit(f).cloudCapacity+(b.capacity||0),clouds};
}
export function queueEnemy(g,role){
 const op=g.operation;if(!op||g.paused||g.result)return false;initEnemyAI(g);
 const f=op.rival;if(!Object.hasOwn(kit(f).units,role))return false;const t=unitType(f,role);
 const cp=enemyCapacity(g),cost=techCost(g,f,role,t.cost);
 if(op.enemyQueue.length>=4||op.enemyFunds<cost||cp.used+techCompute(g,f,role,t.compute)>cp.capacity||g.units.filter(u=>u.team===f&&alive(u)).length+op.enemyQueue.length>=20)return false;
 op.enemyFunds-=cost;op.enemyQueue.push({role,cost,remaining:t.time,total:t.time});record(g,'queue',role);return true;
}
export function enemyEconomy(g,dt){
 const op=g.operation,ai=initEnemyAI(g),f=op.rival,b=techBonuses(g,f),units=g.units.filter(u=>u.team===f&&alive(u));
 const cp=enemyCapacity(g),coolers=units.filter(u=>u.role==='cooler'&&u.server===f&&!u.transit&&u.locked===0&&distance(u,point('intake',f))<85).length,models=units.filter(u=>u.role==='model').length;
 op.enemyEnergy=Math.max(0,op.enemyEnergy-dt*(.16+units.length*.018+models*.07)*Math.max(.1,1+(b.energyUse||0)));
 op.enemyHeat=Math.max(10,Math.min(100,op.enemyHeat+dt*((.13+models*.19)*(f==='broke'?1.18:1)-coolers*kit(f).cooling-cp.clouds*.12+(b.heat||0)-(b.cooling||0))));
 op.enemyFunds=Math.min(6500,op.enemyFunds+dt*((g.difficulty==='relaxed'?3.2:4)+(b.income||0)+(f==='closed'?Math.min(2,cp.clouds)*2:0)));
 const thermal=op.enemyHeat>heatThreshold(g,f)?Math.max(.35,1-(op.enemyHeat-heatThreshold(g,f))/45):1;
 op.enemyThroughput=(op.enemyEnergy<10?.4:1)*thermal*Math.min(1,cp.capacity/Math.max(1,cp.used))*Math.max(.3,op.enemyQuality/100);
 op.enemyProductionPaused=!researchStaffed(g,f);
 if(!op.enemyProductionPaused)op.enemyQuality=Math.min(100,op.enemyQuality+dt*.08);
 const q=op.enemyQueue[0];if(!q)return;
 // Research staff can be recruited during a lockout. Every combat unit still needs a staffed lab.
 if(op.enemyProductionPaused&&q.role!=='researcher')return;
 q.remaining=Math.max(0,q.remaining-dt*op.enemyThroughput*(1+(b.assembly||0))*((op.enemyPriorityUntil||0)>g.time?1.6:1));
 if(q.remaining>1e-8)return;op.enemyQueue.shift();const u=spawn(g,q.role,f,q.role==='researcher'?'lab':undefined,f);u.order=combat(u)?'guard':'hold';ai.produced++;record(g,'deployed',q.role);
}
function observe(g){
 const f=g.operation.rival,units=g.units.filter(u=>u.team===f&&alive(u)),contacts=g.units.filter(e=>e.team==='player'&&alive(e)&&!e.transit&&(e.evacuatedUntil||0)<=g.time&&units.some(u=>!u.transit&&u.server===e.server&&distance(u,e)<320));
 const ai=g.operation.enemyAI;ai.scouted=[...new Set([...ai.scouted,...units.filter(u=>u.server===g.faction&&!u.transit).flatMap(u=>Object.keys(g.infrastructure[g.faction].buildings).filter(site=>distance(u,point(site,u.server))<320))])];
 const ids=new Set(units.map(u=>u.id)),lost=ai.lastRoster.filter(id=>!ids.has(id)).length;ai.losses+=lost;ai.lastRoster=[...ids];
 return {f,units,contacts,home:units.filter(u=>u.server===f&&!u.transit&&!u.raid),invaders:contacts.filter(u=>u.server===f),count:r=>units.filter(u=>u.role===r).length+g.operation.enemyQueue.filter(q=>q.role===r).length};
}
// A choice responds to the current economy and observed fighting. It cannot peek at a remote player queue.
export function chooseSpecialization(g,c){
 const f=g.operation.rival,ai=g.operation.enemyAI,cp=enemyCapacity(g);
 if(f==='misanthropic')return g.operation.enemyEnergy<35||cp.used>cp.capacity*.88?'cold-storage':ai.losses>=6&&c.count('agent')+c.count('malware')>=3?'consensus':'immutable-charter';
 if(f==='closed')return cp.used>cp.capacity*.86?'sovereign-cloud':c.contacts.filter(u=>u.role==='firewall').length>=2||c.count('agent')>=3?'license-lock':'network-effects';
 return g.operation.enemyHeat>57?'deep-freeze':c.contacts.some(u=>u.role==='model'&&u.hp>300)||c.contacts.some(u=>u.ward)?'run-hot':ai.losses>=4?'ship-everything':'deep-freeze';
}
export function chooseEnemyProject(g,c){
 const op=g.operation,f=op.rival,s=g.infrastructure[f],branches=tree(f).branches,cp=enemyCapacity(g);
 const broken=branches.find((b,i)=>s.buildings['facility'+(i+1)].built&&s.buildings['facility'+(i+1)].hp<=0);if(broken)return broken.id;
 const online=Object.values(s.buildings).filter(b=>b.hp>0).length;
 const priority=[...ENEMY_PLANS[f].opening];
 const urgent=f==='broke'&&op.enemyHeat>55?2:cp.used>cp.capacity*.82&&f==='closed'?2:f==='misanthropic'&&op.enemyEnergy<35?2:f==='closed'&&c.invaders.length>=2?0:null;
 if(urgent!==null){priority.splice(priority.indexOf(urgent),1);priority.unshift(urgent);}
 if(!online)return branches[priority[0]].id;
 // Secure first-tier economy and military upgrades before the expensive exclusive choice.
 for(const i of priority){const b=branches[i],building=s.buildings['facility'+(i+1)];if(!building.built)return b.id;if(!s.completed.includes(b.research[0].id))return b.research[0].id;}
 if(!s.specialization&&g.time>=260)return chooseSpecialization(g,c);
 return null;
}
function infrastructure(g,c){
 const op=g.operation,ai=op.enemyAI,s=g.infrastructure[c.f];
 if(s.project?.type==='research'&&(s.buildings[s.project.site].hp<=0||nodeInfo(c.f,s.project.id).tier===3&&Object.values(s.buildings).filter(b=>b.hp>0).length<2))cancelProject(g,c.f);
 if(s.project||g.time<ai.nextProject)return false;
 const damaged=Object.entries(s.buildings).filter(([,b])=>b.hp>0&&b.hp<b.maxHp*.55).sort((a,b)=>a[1].hp/a[1].maxHp-b[1].hp/b[1].maxHp)[0];
 if(damaged&&!c.invaders.some(e=>distance(e,point(damaged[0],c.f))<180)&&op.enemyFunds>300){const result=repairFacility(g,damaged[0],c.f);if(result.ok){ai.repairs++;ai.nextProject=g.time+25;record(g,'repair',damaged[0]);return true;}}
 const id=chooseEnemyProject(g,c);if(!id)return false;
 const n=nodeInfo(c.f,id),defenders=c.home.filter(combat),reserve=defenders.length<3?techCost(g,c.f,'firewall',unitType(c.f,'firewall').cost):120;
 if(op.enemyFunds<n.cost+reserve||projectProblem(g,id,c.f))return false;
 if(startProject(g,id,c.f).ok){ai.projects++;ai.nextProject=g.time+(n.tier===3?70:35);record(g,'project',id);return true;}return false;
}
function production(g,c){
 const op=g.operation,ai=op.enemyAI;
 if(!c.count('researcher')){op.staffReturnAt||=g.time+20;if(g.time>=op.staffReturnAt&&queueEnemy(g,'researcher')){op.enemyQueue.unshift(op.enemyQueue.pop());op.staffReturnAt=0;}return;}
 op.staffReturnAt=0;if(op.enemyQueue.length)return;
 if(!c.count('harvester')){queueEnemy(g,'harvester');return;}
 if(!c.count('cooler')||c.f==='broke'&&op.enemyHeat>58&&c.count('cooler')<2){queueEnemy(g,'cooler');return;}
 const cp=enemyCapacity(g),targets={...ENEMY_PLANS[c.f].army};
 if(c.contacts.filter(u=>u.role==='malware').length>=2)targets.firewall++;
 if(c.contacts.some(u=>u.role==='researcher'&&!protector(g,u)))targets.agent++;
 const order=c.f==='broke'?['malware','model','firewall','agent']:['model','firewall','agent','malware'];
 const role=order.filter(r=>c.count(r)<targets[r]).sort((a,b)=>c.count(a)/targets[a]-c.count(b)/targets[b])[0];
 if(!role)return;
 if(cp.used+techCompute(g,c.f,role,unitType(c.f,role).compute)>cp.capacity){if(c.count('cloud')<2)queueEnemy(g,'cloud');return;}
 // A supplied garrison saves for its next research choice rather than buying endless cheap replacements.
 const planned=chooseEnemyProject(g,c),readyForTech=c.home.filter(combat).length>=3&&g.time>=ai.nextProject&&!g.infrastructure[c.f].project;
 if(planned&&readyForTech&&op.enemyFunds<nodeInfo(c.f,planned).cost+120&&!c.invaders.length)return;
 queueEnemy(g,role);
}
function logistics(g,c){
 for(const u of c.home){const task=u.role==='researcher'?['research','lab']:u.role==='harvester'?['harvest','grid']:['cooler','cloud'].includes(u.role)?['cool','intake']:null;if(task&&u.order!==task[0])command(g,[u.id],...task,c.f);}
}
function launch(g,c){
 const op=g.operation,ai=op.enemyAI;
 const available=c.home.filter(u=>combat(u)&&u.hp>=u.maxHp*.65&&!u.retreating);
 const keep=new Set();for(const role of ['firewall','model']){const guard=available.find(u=>u.role===role);if(guard)keep.add(guard.id);}
 const squad=available.filter(u=>!keep.has(u.id));
 const ready=squad.length>=3&&squad.some(u=>u.role==='model')&&squad.some(u=>u.role==='firewall'||c.f==='broke'&&u.role==='malware');
 if(g.time>=op.nextAttack-25&&op.warningFor!==op.nextAttack&&ready){op.warningFor=op.nextAttack;tell(g,`${FACTIONS[c.f].name} is assembling a ${ENEMY_PLANS[c.f].name.toLowerCase()}. Intrusion in about 25 seconds.`);}
 if(g.time<op.nextAttack)return;
 // Threatened headquarters keep their combat force. No instant wave or free reinforcements.
 if(c.invaders.length>=2||!ready){op.nextAttack=g.time+15;return;}
 const team=[];
 for(const role of ['model','firewall']){const u=squad.find(u=>u.role===role);if(u)team.push(u);}
 for(const u of squad)if(!team.includes(u)&&team.length<(c.f==='broke'?4:3))team.push(u);
 if(scheduleTransfer(g,team.map(u=>u.id),c.f,g.faction,false)){op.attacks++;ai.mode='attack';record(g,'raid',team.map(u=>u.role).join(','));tell(g,`INCOMING — ${FACTIONS[c.f].name}: ${team.length} units transferring. Keep a defender at home.`);}
 op.nextAttack=g.time+kit(c.f).cadence+(g.difficulty==='relaxed'?30:0);
}
function chooseTarget(g,c,allies,contacts){
 const current=allies.find(u=>u.role==='model'&&u.focusTarget)?.focusTarget;
 return contacts.slice().sort((a,b)=>{
  const score=u=>(u.id===current&&c.f==='closed'?90:0)+(u.role==='firewall'?60:0)+(u.role==='researcher'&&!protector(g,u)?45:0)+(u.maxHp-u.hp)*.08-distance(u,allies[0])*.12;
  return score(b)-score(a)||a.id-b.id;
 })[0];
}
function tacticalOrders(g,c){
 const op=g.operation,ai=op.enemyAI;
 for(const server of [c.f,g.faction]){
  const team=c.units.filter(u=>u.server===server&&!u.raid&&!u.transit&&combat(u)&&u.locked===0),contacts=c.contacts.filter(e=>e.server===server&&unitType(e.faction,e.role).domain==='land');
  if(!team.length)continue;
  const focus=contacts.length?chooseTarget(g,c,team,contacts):null;
  const slowest=Math.min(...team.map(u=>unitType(c.f,u.role).speed));
  for(const u of team){
   if(server===c.f&&u.hp<u.maxHp*.28&&!u.retreating){u.retreating=true;command(g,[u.id],'move','lab',c.f);ai.retreats++;record(g,'retreat',u.role);}
   if(u.retreating){if(u.hp<u.maxHp*.75)continue;u.retreating=false;command(g,[u.id],'guard','campus',c.f);}
   // A second of decisions never continually resets travel or a ward's settle timer.
   const near=contacts.filter(e=>distance(u,e)<135),escort=team.find(e=>e.role==='firewall'&&!e.retreating),model=team.find(e=>e.role==='model'&&!e.retreating);
   if(focus&&(server===c.f||combat(focus)||u.role==='agent')&&u.target!==focus.id&&u.order!=='sabotage'&&distance(u,focus)<300)command(g,[u.id],'attack',focus.id,c.f);
   if(c.f==='misanthropic'&&u.role==='firewall'&&near.length&&model&&distance(u,model)<160){u.path=[];u.arrival=null;u.moving=false;u.currentSpeed=0;u.order='hold';}
   if((!focus||!combat(focus)&&u.role!=='agent')&&['hold','attack','guard'].includes(u.order)&&server!==c.f)command(g,[u.id],'siege','campus',c.f);
   if(!focus&&server===c.f&&u.order==='attack')command(g,[u.id],'guard','campus',c.f);
   // Keep escorts together while marching; contact stops each unit through normal combat rules.
   if(['misanthropic','closed'].includes(c.f)&&server!==c.f&&u.order!=='sabotage')u.speedLimit=slowest;
   if(c.f==='closed'&&u.role==='firewall'&&model&&distance(u,model)>125&&u.order!=='attack')command(g,[u.id],'move',nearestNode(model,'land',server),c.f);
   if(c.f==='broke'&&u.order==='move'&&u.arrival==='gateRoad'&&(u.recoveryUntil||0)<=g.time&&server!==c.f)command(g,[u.id],'siege','campus',c.f);
   if(c.f==='broke'&&(u.recoveryUntil||0)>g.time&&server!==c.f&&u.hp<u.maxHp*.5&&!near.length)command(g,[u.id],'move','gateRoad',c.f);
   if(server!==c.f&&u.role==='agent'&&!contacts.some(e=>distance(u,e)<150)&&u.order!=='sabotage'){
    const target=ai.scouted.filter(site=>g.infrastructure[g.faction].buildings[site].hp>0).sort((a,b)=>{
     const score=site=>{const b=g.infrastructure[g.faction].buildings[site],def=tree(g.faction).branches[Number(site.slice(8))-1];return (def.bonus.cooling?80:0)+(g.infrastructure[g.faction].project?.site===site?60:0)+(1-b.hp/b.maxHp)*50-distance(u,point(site,server))*.05;};return score(b)-score(a);
    })[0];if(target&&orderFacility(g,u,target)){record(g,'sabotage',target);tell(g,'SABOTAGE ALERT — a rival agent is targeting a campus facility.');}
   }
   // An isolated linked attacker waits briefly at the next road node for its escort.
   if(c.f==='closed'&&u.role==='model'&&escort&&!focus&&distance(u,escort)>165)u.speedLimit=unitType(c.f,'firewall').speed*.5;
  }
 }
}
function abilities(g,c){
 const op=g.operation,ai=op.enemyAI;
 // Support first: vent heat and establish protections before paying for bursts.
 const priority={cooler:0,firewall:1,researcher:2,agent:3,model:4,malware:5};
 for(const u of c.units.slice().sort((a,b)=>(priority[a.role]??9)-(priority[b.role]??9))){
  if(u.raid||op.enemyFunds<120||abilityProblem(g,u))continue;
  const near=c.contacts.filter(e=>e.server===u.server&&unitType(e.faction,e.role).domain==='land'&&distance(e,u)<130),friends=c.units.filter(e=>e.server===u.server&&!e.transit&&distance(e,u)<140);
  const hurt=friends.some(e=>e.hp<e.maxHp*.7||e.locked>0),f=u.faction;
  let use=u.role==='cooler'?op.enemyHeat>53:u.role==='researcher'?f==='broke'?op.enemyQueue[0]?.remaining>5&&op.enemyHeat<55&&op.enemyQuality>60: hurt:u.role==='firewall'?hurt||near.length>0&&(f==='misanthropic'&&(u.settled||0)<3||f==='closed'&&friends.some(e=>e.role==='model'&&(e.armourUntil||0)<g.time+2)):u.role==='agent'?near.some(e=>!protector(g,e)||f==='closed'&&(e.markedUntil||0)<g.time+2):u.role==='model'?near.length>0&&(f!=='broke'||op.enemyHeat<heatThreshold(g,f)-12):u.role==='malware'?near.length>=(f==='broke'?2:1)&&near.some(e=>!protector(g,e)):false;
  if(f==='closed'&&u.role==='model')use&&=linked(g,u);
  if(!use)continue;op.enemyFunds-=60;castFactionAbility(g,u);ai.abilities++;record(g,'ability',u.role);g.effects.push({server:u.server,x:u.x,y:u.y,color:FACTIONS[f].color,life:.8,max:.8,ring:true,style:f});
 }
}
export function tickEnemyAI(g,dt){
 if(!g.operation||g.paused||g.result)return;
 enemyEconomy(g,dt);const ai=g.operation.enemyAI;if(g.time<ai.nextDecision)return;
 ai.nextDecision=g.time+1;ai.decisions++;const c=observe(g);
 ai.mode=c.invaders.length?'defend':g.operation.enemyHeat>heatThreshold(g,c.f)?'cool':!researchStaffed(g,c.f)?'recover':g.time<120?'establish':'assemble';
 logistics(g,c);infrastructure(g,c);production(g,c);launch(g,c);tacticalOrders(g,c);abilities(g,c);
}
export function enemyBriefing(g){
 const f=g.operation?.rival;if(!f)return null;
 return {name:ENEMY_PLANS[f].name,copy:ENEMY_PLANS[f].intent};
}
export function validEnemyAI(op){
 if(op.enemyAI===undefined)return true;
 const a=op.enemyAI,finite=n=>Number.isFinite(n)&&n>=0;
 if(!a||a.version!==1||!['establish','assemble','attack','defend','cool','recover'].includes(a.mode))return false;
 if(['nextDecision','nextProject','lastLosses','losses','produced','deliveries','decisions','projects','abilities','repairs','retreats'].some(k=>!finite(a[k])))return false;
 if(!Array.isArray(a.lastRoster)||a.lastRoster.length>24||a.lastRoster.some(id=>!Number.isInteger(id)||id<1)||!Array.isArray(a.scouted)||a.scouted.some(s=>!['facility1','facility2','facility3'].includes(s))||a.scouted.length>3)return false;
 if(!Array.isArray(a.history)||a.history.length>32||a.history.some(e=>!e||!finite(e.time)||typeof e.kind!=='string'||typeof e.detail!=='string'||e.detail.length>160))return false;
 if(['enemyEnergy','enemyHeat','enemyQuality'].some(k=>!finite(op[k]))||op.enemyEnergy>160||op.enemyHeat>100||op.enemyQuality>100)return false;
 if(op.enemyThroughput!==undefined&&(!finite(op.enemyThroughput)||op.enemyThroughput>1))return false;
 if(op.enemyPriorityUntil!==undefined&&!finite(op.enemyPriorityUntil))return false;
 return Array.isArray(op.enemyQueue)&&op.enemyQueue.length<=4&&op.enemyQueue.every(q=>q&&Object.hasOwn(kit(op.rival).units,q.role)&&finite(q.cost)&&finite(q.total)&&q.total>0&&finite(q.remaining)&&q.remaining<=q.total);
}
