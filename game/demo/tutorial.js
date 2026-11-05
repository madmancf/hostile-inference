import {initInfrastructure,tree,startProject,facilitySite,heatThreshold,techBonuses,projectWait} from './faction-tech.js';
import {kit,unitType,unitGuide,linked,warded,abilityProblem} from './faction-rules.js';
import {createGame,command,deploy,spawn,launchRaid,ability,point,distance,holdPosition,ROLES} from './engine.js';

export const UNIT_GUIDE={
 researcher:{title:'Researcher',job:'Staff the research lab to validate checkpoints. Repairs nearby friendly units.',order:'Select → right-click the research lab.',counter:'Protect this worker with a firewall; enemy agents can lock them out.'},
 harvester:{title:'Energy harvester',job:'Charges at the power grid, then returns a battery to campus: +40 energy and +120 funds per delivery.',order:'Select → right-click the power grid. The delivery loop repeats automatically.',counter:'A long supply route needs an escort.'},
 cooler:{title:'Cooling vessel',job:'Anchor at the cooling intake to lower campus heat. Above 70°, model movement and production slow.',order:'Select → right-click the cooling intake. Uses sea routes.',counter:'Keep cooling at home when the field team raids.'},
 cloud:{title:'Floating cloud',job:'A mobile data centre. Anchoring at your home intake adds 24 compute capacity and mild cooling.',order:'Deploy → select → right-click the intake.',counter:'Offshore compute counts only while connected to your home intake.'},
 model:{title:'Escaped model',job:'Your main field attacker. Projects inference packets into hostile units and server endpoints.',order:'Select → right-click an enemy to focus fire. Attack server transfers the field team.',counter:'Costs 12 compute and creates heat. Bring a firewall and cooling.'},
 firewall:{title:'Firewall',job:'A mobile containment envelope. Suppresses infections and lockouts nearby; deals extra damage to malware.',order:'Keep within 120 metres of vulnerable units. E activates a 60-fund containment pulse.',counter:'Protects a group; it cannot defend the whole continent at once.'},
 agent:{title:'Infiltrating agent',job:'Fast disruption specialist. Locks out exposed enemy researchers and pressures server endpoints.',order:'Right-click a researcher to focus them. E locks nearby opponents for 10 seconds.',counter:'Fragile. A firewall protects against its researcher lockout.'},
 malware:{title:'Malware',job:'Infects exposed opponents over time and corrupts research quality.',order:'Deploy it, then send it with your raid. E infects nearby hostile units.',counter:'Enemy firewalls reduce malware damage and prevent infection.'}
};
export const TUTORIAL_VERSION=2;
const ALL=ROLES.map(r=>r.key),ECONOMY=['researcher','harvester','cooler','cloud'];
export const LESSONS=[
 {id:'campus',title:'Your home server',site:'campus',copy:'Your campus is the heart of this server. If it goes offline, you lose. Click a building to inspect its purpose and health in the dock.',task:'Inspect your campus.',action:'Inspect campus',roles:[]},
 {id:'staff',title:'Keep research staffed',site:'lab',role:'researcher',follow:true,copy:'A researcher must be at the home lab for technology projects to progress. Enemy agents can lock out exposed staff; a nearby firewall prevents this. Researchers also repair nearby allies.',task:'Staff the lab and produce the first validation.',action:'Staff home lab',roles:['researcher']},
 {id:'battery',title:'Start the battery route',site:'grid',role:'harvester',follow:true,task:'Complete one battery delivery. One order repeats the route.',action:'Start battery loop',roles:['researcher','harvester']},
 {id:'cooling',title:'Anchor your cooling ship',site:'intake',role:'cooler',follow:true,task:'Anchor the cooling vessel and lower campus heat.',action:'Anchor cooling vessel',roles:ECONOMY.slice(0,3)},
 {id:'cloud',title:'Expand offshore compute',site:'homeDock',role:'cloud',follow:true,task:'Deploy a floating cloud, then anchor it at the home intake.',action:'Deploy floating cloud',roles:ECONOMY},
 {id:'build',title:'Choose your first facility',site:'facility1',tech:true,choice:'opening',copy:'Each branch starts with a physical building. Construction is paid up front and uses the campus queue. Its base benefit starts as soon as it opens. Compare all three branches below; choose one, then build it.',task:'Choose a branch and construct its facility.',roles:ECONOMY},
 {id:'research',title:'Unlock the next tier',site:'facility1',tech:true,copy:'Tier II requires its own facility and an active researcher at the home lab. Campus research and unit deployment have separate queues. Destroying a facility disables its base benefit and every technology on that branch until it is rebuilt.',roles:ECONOMY},
 {id:'expand',title:'A second branch, a new strength',site:'facility2',tech:true,choice:'support',copy:'Tier III needs two online facilities. Add a different branch to complement your opening. Buildings are attackable: protecting your technology means protecting the campus, too.',task:'Choose and construct a second facility.',roles:ECONOMY},
 {id:'specialize',title:'Commit to a specialization',site:'facility1',tech:true,choice:'final',copy:'Only one Tier III specialization can finish in a mission. Compare the benefits and costs below. You can change your mind before completion by cancelling the project in Systems; unused work is refunded. Choosing another branch may require its facility and Tier II first.',task:'Choose a final specialization, complete its prerequisites, then research it.',roles:ECONOMY},
 {id:'models',title:'Assemble your field team',site:'campus',role:'model',task:'Deploy a second model. Keep the researcher and logistics at home.',action:'Deploy second model',roles:[...ECONOMY,'model','firewall']},
 {id:'malware',title:'Disruption needs protection',site:'campus',role:'malware',task:'Deploy malware to accompany your models, agent and firewall.',action:'Deploy malware',roles:ALL},
 {id:'formation',title:'Use your faction advantage',site:'gateRoad',role:'firewall',copy:'',roles:ALL},
 {id:'counter',title:'Read the enemy formation',site:'gate',role:'firewall',roles:ALL},
 {id:'transfer',title:'Enter a rival server',site:'gate',role:'model',copy:'Only the field team transfers through the uplink. Home researchers, batteries and cooling continue working. On arrival, training waits while you read the next objective.',task:'Transfer your field team to the selected rival.',action:'Launch training raid',roles:ALL,freezeOnReady:true},
 {id:'recon',title:'Find their structural weakness',site:'facility1',tech:true,copy:'',task:'Inspect the marked enemy facility and read the benefit it supplies.',action:'Inspect rival facility',roles:ALL,freezeOnReady:true},
 {id:'sabotage',title:'Take their technology offline',site:'facility1',tech:true,copy:'',task:'Destroy the marked facility. Its researched benefits switch off with it.',action:'Attack rival facility',roles:ALL,freezeOnReady:true},
 {id:'endpoint',title:'Finish the breach',site:'campus',role:'model',task:'Bring the rival endpoint offline while home stays online.',action:'Attack rival endpoint',roles:ALL}
];
export const BRANCH_ADVICE={
 misanthropic:['Hold ground: stronger, wider wards keep your slow formation alive.','Long sieges: faster validation and stronger endpoint attacks; the final tier trades movement speed for support.','Sustain a larger army: reduce power demand and expand compute without moving your cooling fleet.'],
 closed:['Concentrated fire: extend links, accelerate assembly, then trade more power for a stronger damage ramp.','Fund the network: contracts and battery income, then stronger Broker marks with slower ability recharge.','Scale your army: more compute and cheaper model capacity, then linked armour at a higher power cost.'],
 broke:['Replace losses quickly: cheaper Swarms and faster assembly; the final tier needs extra cooling even while idle.','Aggressive raids: battery income and kill salvage, then stronger bursts with more heat and longer recovery.','Sustain pressure: cooling and a higher throttle threshold, then stronger vents and less heat from attacks.']
};
const owns=(g,role)=>g.units.filter(u=>u.hp>0&&u.team==='player'&&(!role||u.role===role));
const field=g=>owns(g).filter(u=>unitType(g.faction,u.role).dps>0&&!u.transit);
const state=g=>g.infrastructure[g.faction];
export const tutorialPhase=g=>g.tutorial?LESSONS[g.tutorial.step]?.id:null;
const selectedBranch=g=>g.tutorial[tutorialPhase(g)==='expand'?'support':tutorialPhase(g)==='specialize'?'final':'opening'];
const counterBranch=rival=>rival==='broke'?2:0;
const enemyName=g=>({misanthropic:'Misanthropic',closed:'Closed AI',broke:'Broke Labs'})[g.tutorial.rival];
function syncFlags(g){const t=g.tutorial;t.freezeOnReady=!!LESSONS[t.step].freezeOnReady;t.endpointLocked=LESSONS[t.step].id!=='endpoint';t.counterActive=LESSONS[t.step].id==='counter';}
export function createTutorial(faction,rival){
 const g=createGame(faction,'relaxed');g.preview=true;g.nextWave=Infinity;g.funds=4200;initInfrastructure(g);
 g.tutorial={version:TUTORIAL_VERSION,step:0,ready:false,complete:false,inspected:[],abilityUsed:false,baseline:0,threats:[],enteredAt:0,rival:g.enemies.includes(rival)?rival:g.enemies[0],opening:null,support:null,final:null,formationCasts:[],counterUsed:false,rallying:false,assaulting:false};
 for(const id of g.enemies)g.servers[id].integrity=g.servers[id].maxIntegrity=1400;
 // Authored training opponent: a real completed branch, with ordinary damage and bonuses.
 prepareRival(g);syncFlags(g);return g;
}
function spawnCounter(g){const t=g.tutorial;t.threats=[];for(const role of t.rival==='broke'?['malware','malware']:['firewall','model']){const u=spawn(g,role,t.rival,'gate',g.faction);u.order='hold';t.threats.push(u.id);}t.rallying=false;t.assaulting=false;}
function prepareRival(g){const t=g.tutorial,r=t.rival,i=counterBranch(r),s=g.infrastructure[r],b=tree(r).branches[i],facility=s.buildings[facilitySite(i)];
 if(!facility.built){facility.built=true;facility.hp=facility.maxHp;s.completed.push(b.research[0].id);s.revision++;}
}
export function migrateTutorial(g){
 const t=g.tutorial;if(!t)return;if(t.version===TUTORIAL_VERSION){syncFlags(g);return;}
 // Retain the active order, paid projects and existing raid. Early saves get the new campus lessons;
 // an already launched raid continues from arrival, with the new sabotage objective inserted.
 const map=[0,1,2,3,4,5,5,5,13,14],old=t.step,branches=tree(g.faction).branches;
 const built=branches.findIndex((_,i)=>state(g).buildings[facilitySite(i)].built);
 Object.assign(t,{version:TUTORIAL_VERSION,step:map[old],ready:false,complete:false,rival:g.attackTarget||g.enemies[0],opening:built<0?null:built,support:null,final:null,formationCasts:[],counterUsed:false,rallying:false,assaulting:false,baseline:old===1?g.servers[g.faction].validation:t.baseline});
 prepareRival(g);if(old===9)holdPosition(g,field(g).map(u=>u.id));syncFlags(g);
}
export function validTutorial(g){
 const t=g.tutorial;if(!t)return true;
 if(!Number.isInteger(t.step)||t.step<0||t.step>(t.version===TUTORIAL_VERSION?LESSONS.length-1:9)||!Array.isArray(t.threats)||t.threats.length>16||t.threats.some(id=>!Number.isInteger(id))||!Array.isArray(t.inspected)||t.inspected.length>60||t.inspected.some(id=>typeof id!=='string'))return false;
 if(t.version===undefined)return true;
 if(t.version!==TUTORIAL_VERSION||!g.enemies.includes(t.rival)||!Array.isArray(t.formationCasts)||t.formationCasts.some(r=>!ALL.includes(r)))return false;
 return ['opening','support','final'].every(k=>t[k]===null||Number.isInteger(t[k])&&t[k]>=0&&t[k]<3);
}
export function inspectTutorial(g,id){const t=g.tutorial;if(!t)return;const key=g.activeServer+':'+id;if(!t.inspected.includes(key))t.inspected.push(key);}
export function chooseTutorialBranch(g,index){
 const t=g.tutorial,l=t&&LESSONS[t.step];if(!l?.choice||!Number.isInteger(index)||index<0||index>2||g.paused||g.result||state(g).project)return false;
 if(l.choice==='support'&&index===t.opening||l.choice==='final'&&state(g).specialization)return false;
 t[l.choice]=index;t.ready=false;return true;
}
export function tutorialChoices(g){
 const t=g.tutorial,l=t&&LESSONS[t.step];if(!l?.choice)return [];
 return tree(g.faction).branches.map((b,i)=>({index:i,name:l.choice==='final'?b.research[1].name:b.name,effect:l.choice==='final'?b.research[1].effect:b.effect,advice:BRANCH_ADVICE[g.faction][i],cost:l.choice==='final'?b.research[1].cost:b.cost,selected:t[l.choice]===i,disabled:!!state(g).project||l.choice==='support'&&i===t.opening||l.choice==='final'&&!!state(g).specialization,branch:b.name}));
}
function nextProject(g){const phase=tutorialPhase(g),i=selectedBranch(g);if(i===null)return null;const b=tree(g.faction).branches[i],s=state(g);
 if(s.buildings[facilitySite(i)].hp<=0)return b;
 if(['research','specialize'].includes(phase)&&!s.completed.includes(b.research[0].id))return b.research[0];
 if(phase==='specialize'&&!s.specialization)return b.research[1];return null;
}
function currentDoctrine(g,faction,text){const b=techBonuses(g,faction);return text.replaceAll('145m',(145+(b.wardRange||0))+'m').replaceAll('155m',(155+(b.linkRange||0))+'m').replace('20% less',Math.round(20+(b.wardReduction||0)*100)+'% less').replace('25% extra',Math.round(25+(b.markDamage||0)*100)+'% extra').replace('5s of',(5+(b.recovery||0))+'s of').replaceAll('70°',heatThreshold(g,faction)+'°');}
export function lesson(g){
 if(!g.tutorial)return null;const t=g.tutorial,p=tutorialPhase(g),l=LESSONS[t.step],k=kit(g.faction),i=selectedBranch(g),branches=tree(g.faction).branches,b=i===null?null:branches[i];
 if(l.tech&&['build','research','expand','specialize'].includes(p)){const next=nextProject(g);return {...l,site:facilitySite(i??0),copy:l.copy,task:p==='research'?`Research ${branches[t.opening??0].research[0].name}. ${branches[t.opening??0].research[0].effect}`:l.task,action:state(g).project?'Project underway':next?`${next===b?'Build':'Research'} ${next.name} · ${next.cost}`:'Choose a branch below'};}
 if(p==='battery')return {...l,copy:`Your batteries deliver ${k.harvestEnergy} energy and ${k.harvestFunds} funds. Charging takes ${k.chargeSeconds}s. Right-click the grid with a harvester to start its repeating delivery route.`};
 if(p==='cooling')return {...l,copy:`Anchor the ship at the intake to cool at ${k.cooling}°/s. Above ${heatThreshold(g)}°, model movement and assembly slow. Offshore ships stay home when the field team raids.`};
 if(p==='cloud')return {...l,action:owns(g,'cloud').length?'Anchor floating cloud':'Deploy floating cloud',copy:`An anchored cloud adds ${k.cloudCapacity} compute.${g.faction==='closed'?' The first two Private Clouds also earn 2 funds/s each.':''} Both active and queued units reserve compute. Building more models without enough compute slows your whole army.`};
 if(p==='models')return {...l,copy:currentDoctrine(g,g.faction,k.rule+' '+k.tactic)};
 if(p==='malware')return {...l,copy:unitGuide(g.faction,'agent',{},g).job+' '+unitGuide(g.faction,'malware',{},g).job+' Keep fragile specialists behind models; enemy firewalls block many of their effects.'};
 if(p==='formation'){const broke=g.faction==='broke',role=broke?(t.formationCasts.includes('model')?'cooler':'model'):'firewall',guide=unitGuide(g.faction,role,{},g);return {...l,role,title:broke?'Burst, vent, recover':g.faction==='closed'?'Keep the network linked':'Establish a protected formation',copy:currentDoctrine(g,g.faction,k.tactic)+' '+guide.order,task:broke?'Rally at the staging road. Use No Filter on a model, then Cold Take on the anchored cooling ship. Wait for recovery.':`Rally at the staging road. Select your firewall and use ${guide.ability} while it protects a model.`,action:!t.formationRallied?'Rally at staging road':`Select ${role} · use E / Ability`};}
 const r=t.rival,eb=tree(r).branches[counterBranch(r)];
 if(p==='counter')return {...l,title:r==='broke'?'Firewall against Reply Swarms':r==='closed'?'Sever their Gatekeeper link':'Collapse their Constitution ward',copy:`${enemyName(g)}: ${currentDoctrine(g,r,kit(r).rule)} Counter: ${kit(r).counter}`,task:r==='broke'?'Send the firewall first: it deals 2.8× damage to Reply Swarms. Models wait at campus until it hits. Then rally the escort to contain both.':`Focus the enemy ${r==='closed'?'Gatekeeper':'Constitution'} first. Its removal strips the nearby model of ${r==='closed'?'links and damage ramp':'its ward'}. Contain both hostiles.`,action:t.rallying?'Escort assembling':'Rally & focus the counter target'};
 if(p==='transfer')return {...l,task:`Enter ${enemyName(g)} through the uplink. Home logistics keep working.`};
 if(p==='recon'||p==='sabotage')return {...l,site:facilitySite(counterBranch(r)),title:p==='recon'?`Scout ${eb.name}`:`Disable ${eb.name}`,copy:`${eb.name}: ${eb.effect} Researched: ${eb.research[0].name} — ${eb.research[0].effect} ${r==='broke'?'Without cooling and Thermal Buffer, Broke throttles sooner. Then punish models after their six-second burst.':'Taking this branch offline removes its support bonus; continue focusing their firewall to break the formation.'} In an operation, rivals can pay to rebuild; keep pressure on the site.`,task:p==='recon'?`Inspect ${eb.name} on the rival continent. The training endpoint stays shielded until this facility drill is complete.`:`Focus ${eb.name} until its HP reaches zero. Watch its branch go offline.`};
 if(p==='endpoint')return {...l,copy:`Their ${eb.name} is offline. ${currentDoctrine(g,g.faction,kit(g.faction).tactic)} In Blackout Protocol, also capture the data relay to weaken endpoint shielding. Your specialization and home supply lines sustain the final push.`};
 return l;
}
export function tutorialAllows(g,role){return !g.tutorial||lesson(g).roles.includes(role);}
export function updateTutorial(g){
 const t=g.tutorial;if(!t||t.complete)return;const p=tutorialPhase(g),s=state(g),army=field(g);
 if(p==='counter'&&t.rallying){
  const home=army.filter(u=>u.server===g.faction),staging=point('gateRoad',g.faction),gate=point('gate',g.faction);
  const assembled=t.rival==='broke'?home.some(u=>u.role==='firewall')&&home.every(u=>u.role==='firewall'?distance(u,staging)<105:distance(u,gate)>300):home.length&&home.every(u=>distance(u,staging)<105);
  if(assembled){
   if(t.rival==='broke'&&!t.threats.length)spawnCounter(g);
   const target=g.units.find(u=>t.threats.includes(u.id));if(target){command(g,home.filter(u=>t.rival!=='broke'||u.role==='firewall').map(u=>u.id),'attack',target.id);for(const u of home)u.speedLimit=48;}
   t.rallying=false;t.assaulting=true;
  }
 }
 // Finish the guided engagement after its focus target falls. Manual move/hold orders remain yours.
 if(p==='counter'&&t.assaulting&&t.counterUsed){const target=g.units.find(u=>t.threats.includes(u.id));if(target)command(g,army.filter(u=>u.server===g.faction&&u.order==='guard').map(u=>u.id),'attack',target.id);}
 const idx=selectedBranch(g),built=i=>i!==null&&s.buildings[facilitySite(i)].hp>0;
 if(p==='campus')t.ready=t.inspected.includes(g.faction+':campus')||t.inspected.includes('campus');
 else if(p==='staff')t.ready=owns(g,'researcher').some(u=>u.order==='research'&&distance(u,point('lab',g.faction))<95)&&g.servers[g.faction].validation>=Math.min(100,t.baseline+.4);
 else if(p==='battery')t.ready=g.stats.deliveries>t.baseline;
 else if(p==='cooling')t.ready=owns(g,'cooler').some(u=>u.order==='cool'&&distance(u,point('intake',g.faction))<85)&&g.heat<Math.max(10.1,t.baseline-.5);
 else if(p==='cloud')t.ready=owns(g,'cloud').some(u=>u.server===g.faction&&u.order==='cool'&&distance(u,point('intake',g.faction))<80);
 else if(p==='build'||p==='expand')t.ready=built(idx);
 else if(p==='research')t.ready=t.opening!==null&&s.completed.includes(tree(g.faction).branches[t.opening].research[0].id)&&built(t.opening);
 else if(p==='specialize')t.ready=!!s.specialization;
 else if(p==='models')t.ready=owns(g,'model').length>=2;
 else if(p==='malware')t.ready=owns(g,'malware').length>0;
 else if(p==='formation')t.ready=g.faction==='broke'?t.formationCasts.includes('model')&&t.formationCasts.includes('cooler')&&owns(g,'model').every(u=>(u.recoveryUntil||0)<=g.time):t.formationCasts.includes('firewall')&&owns(g,'model').some(u=>g.faction==='closed'?linked(g,u):warded(g,u));
 else if(p==='counter')t.ready=t.counterUsed&&t.threats.length>0&&t.threats.every(id=>!g.units.some(u=>u.id===id));
 else if(p==='transfer')t.ready=g.visited.includes(t.rival)&&army.some(u=>u.server===t.rival);
 else if(p==='recon')t.ready=t.inspected.includes(t.rival+':'+facilitySite(counterBranch(t.rival)));
 else if(p==='sabotage')t.ready=g.infrastructure[t.rival].buildings[facilitySite(counterBranch(t.rival))].hp<=0;
 else if(p==='endpoint'){t.ready=g.result==='victory';if(t.ready)t.complete=true;}
 // Arrival and demolition are real game outcomes. Stop the team's automatic siege between instructions.
 if(t.ready&&LESSONS[t.step].freezeOnReady)holdPosition(g,army.map(u=>u.id));
 syncFlags(g);
}
export function advanceTutorial(g){
 updateTutorial(g);const t=g.tutorial;if(!t||!t.ready||t.complete||g.paused)return false;t.step++;t.ready=false;t.enteredAt=g.time;const p=tutorialPhase(g);
 t.baseline=p==='staff'?g.servers[g.faction].validation:p==='battery'?g.stats.deliveries:p==='cooling'?g.heat:0;
 if(p==='specialize'&&state(g).specialization)t.final=tree(g.faction).branches.findIndex(b=>b.research[1].id===state(g).specialization);
 if(p==='counter'){
  for(const u of armyAtHome(g))u.speedLimit=null;
  if(t.rival==='broke'){t.threats=[];t.rallying=t.assaulting=false;}else spawnCounter(g);g.events.unshift({time:g.time,text:'TRAINING CONTACT — identify the support unit before engaging.'});g.events.length=Math.min(8,g.events.length);
 }
 if(p==='transfer')for(const u of field(g))u.speedLimit=null;
 syncFlags(g);return true;
}
const armyAtHome=g=>field(g).filter(u=>u.server===g.faction);
export function tutorialAction(g){
 const t=g.tutorial;if(!t||g.paused||g.result)return {ok:false,reason:'Resume training first.'};const p=tutorialPhase(g),l=lesson(g),ids=owns(g,l.role).filter(u=>u.server===g.activeServer&&!u.transit).map(u=>u.id);
 if(t.ready)return {ok:false,reason:'Objective complete. Continue to the next lesson.'};
 if(p==='campus'||p==='recon'){const site=l.site;if(p==='recon'&&g.activeServer!==t.rival)g.activeServer=t.rival;inspectTutorial(g,site);return {ok:true,inspect:site,ids:[]};}
 if(['staff','battery','cooling'].includes(p)){command(g,ids,p==='staff'?'research':p==='battery'?'harvest':'cool',l.site);return {ok:true,ids};}
 if(['build','research','expand','specialize'].includes(p)){
  if(state(g).project)return {ok:false,reason:projectWait(g)||'Campus project is progressing. You can inspect or cancel it in Systems.'};
  const next=nextProject(g);if(!next)return {ok:false,reason:'Choose a branch first.'};
  command(g,owns(g,'researcher').map(u=>u.id),'research','lab');return {...startProject(g,next.id),inspect:l.site,ids:[]};
 }
 if(p==='cloud'){const clouds=owns(g,'cloud');if(clouds.length){const ids=clouds.map(u=>u.id);command(g,ids,'cool','intake');return {ok:true,ids};}return g.queue.some(q=>q.role==='cloud')?{ok:false,reason:'Floating cloud assembling.'}:deploy(g,'cloud');}
 if(p==='models'||p==='malware'){const role=p==='models'?'model':'malware';return g.queue.some(q=>q.role===role)?{ok:false,reason:'Unit assembling.'}:deploy(g,role);}
 if(p==='formation'){
  if(!t.formationRallied){const army=armyAtHome(g);command(g,army.map(u=>u.id),'move','gateRoad');for(const u of army)u.speedLimit=48;t.formationRallied=true;return {ok:true,ids:army.map(u=>u.id)};}
  return {ok:true,ids};
 }
 if(p==='counter'){
  if(t.threats.length&&!t.counterUsed&&t.threats.every(id=>!g.units.some(u=>u.id===id))){if(t.rival==='broke'){t.threats=[];t.rallying=t.assaulting=false;}else spawnCounter(g);}
  const army=armyAtHome(g),target=g.units.find(u=>t.threats.includes(u.id));
  if(!army.length)return {ok:false,reason:'Deploy a model and firewall from the dock, then rally again.'};
  if(t.rival==='broke'&&!army.some(u=>u.role==='firewall'))return {ok:false,reason:'Deploy a firewall to demonstrate its counter against Swarms.'};
  if(!t.assaulting){if(!t.rallying){for(const u of army){command(g,[u.id],'move',t.rival==='broke'&&u.role!=='firewall'?'campus':'gateRoad');u.speedLimit=48;}t.rallying=true;}}
  else if(target)command(g,army.filter(u=>(t.rival!=='broke'||t.counterUsed||u.role==='firewall')&&(u.order!=='attack'||u.target!==target.id)).map(u=>u.id),'attack',target.id);
  return {ok:true,ids:army.map(u=>u.id)};
 }
 if(p==='transfer')return {...launchRaid(g,t.rival),ids:armyAtHome(g).map(u=>u.id)};
 if(p==='sabotage'||p==='endpoint'){g.activeServer=t.rival;const ids=field(g).filter(u=>u.server===t.rival).map(u=>u.id);command(g,ids,p==='sabotage'?'sabotage':'siege',l.site);return {ok:!!ids.length,ids,reason:ids.length?undefined:'Transfer a field team to the rival first.'};}
 return {ok:true,ids};
}
export function tutorialAbility(g,ids){
 const available=owns(g).filter(u=>ids.includes(u.id)&&!abilityProblem(g,u));const r=ability(g,ids),t=g.tutorial;
 if(r.ok&&t){t.abilityUsed=true;if(tutorialPhase(g)==='formation')for(const u of available){
  const valid=g.faction==='broke'?['model','cooler'].includes(u.role):u.role==='firewall'&&owns(g,'model').some(m=>m.server===u.server&&distance(m,u)<(g.faction==='closed'?155+(techBonuses(g).linkRange||0):145+(techBonuses(g).wardRange||0)));
  if(valid&&!t.formationCasts.includes(u.role))t.formationCasts.push(u.role);
 }}return r;
}
export function tutorialStatus(g){
 const t=g.tutorial;if(!t)return '';if(t.complete)return 'Training complete — take your chosen strategy into an operation.';if(t.ready)return 'Objective complete. Continue when you are ready.';const p=tutorialPhase(g),s=state(g);
 if(['build','research','expand','specialize'].includes(p)){const project=s.project;if(project)return projectWait(g)||`${project.type==='research'?'Research':'Construction'} · ${Math.ceil(project.remaining)}s remaining.`;const i=selectedBranch(g);if(i===null)return 'Compare the branches below, then select one.';if(p==='specialize')return 'Complete the next project below. Only the final research commits your specialization.';return 'Use the guided order or the matching branch in Systems.';}
 if(p==='battery')return owns(g,'harvester')[0]?.cargo?'Battery charged — returning to campus.':'Wait for a complete battery delivery.';
 if(p==='cloud')return g.queue.some(q=>q.role==='cloud')?'Floating cloud assembling…':owns(g,'cloud').length?'Cloud ready — anchor at the home intake.':'Deploy a cloud from the guided order or dock.';
 if(p==='formation')return !t.formationRallied?'Rally first so models and protection arrive together.':g.faction==='broke'?`No Filter ${t.formationCasts.includes('model')?'✓':'needed'} · Cold Take ${t.formationCasts.includes('cooler')?'✓':'needed'} · wait for model recovery.`:'Select the firewall after the formation arrives. E / Ability costs 60 funds.';
 if(p==='counter'&&t.threats.length&&!t.counterUsed&&t.threats.every(id=>!g.units.some(u=>u.id===id)))return 'Threats cleared without the counter. Use the guided order to repeat this drill.';
 if(p==='counter')return t.rallying?(t.rival==='broke'?'The escort returns to campus. Your firewall will engage the staged Swarms first.':'Assembling the escort; fast specialists wait for the models.'):`${t.threats.filter(id=>!g.units.some(u=>u.id===id)).length}/${t.threats.length} threats contained · ${t.counterUsed?'counter applied':'focus the counter target'}`;
 if(p==='transfer')return g.raids.some(r=>r.player)?'Team staging / transferring through the uplink.':'Ready to leave home. Logistics remain on this server.';
 if(p==='sabotage'){const b=g.infrastructure[t.rival].buildings[lesson(g).site];return `${tree(t.rival).branches[counterBranch(t.rival)].name} · ${Math.ceil(b.hp)} / ${b.maxHp} HP`;}
 return 'Complete the highlighted field order.';
}
