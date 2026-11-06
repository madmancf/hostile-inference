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
export const TUTORIAL_VERSION=3;
// Frozen engine compatibility only. Never use this value as lesson progress.
export const TUTORIAL_ENGINE_STEP=3;
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
export const OPENING_CONTACT={misanthropic:{x:-98,y:18},closed:{x:-98,y:12},broke:{x:-94,y:34}};
export const TUTORIAL_ORDER=['campus','formation.open','staff','battery','cooling','cloud','build','research','expand','specialize','models','malware','formation.finish','counter','transfer','recon','sabotage','endpoint'];
const LEGACY_ORDER=['campus','staff','battery','cooling','cloud','build','build','build','transfer','recon'];
const known=new Set(TUTORIAL_ORDER),chapterFor=id=>['campus','formation.open'].includes(id)?'Defend':['counter','transfer','recon','sabotage','endpoint'].includes(id)?'Breach':'Sustain';
export const tutorialPhase=g=>g.tutorial?.objectiveId||null;
export const tutorialGoal=g=>tutorialPhase(g)?.startsWith('formation.')?'formation':tutorialPhase(g);
const currentLesson=g=>LESSONS.find(l=>l.id===tutorialGoal(g));
export function tutorialProgress(g){const t=g.tutorial;if(!t)return null;return {id:t.objectiveId,chapter:chapterFor(t.objectiveId),completed:LESSONS.filter(l=>l.id==='formation'?t.completed.includes('formation.open')&&t.completed.includes('formation.finish'):t.completed.includes(l.id)).length,total:LESSONS.length};}
const selectedBranch=g=>g.tutorial[tutorialPhase(g)==='expand'?'support':tutorialPhase(g)==='specialize'?'final':'opening'];
const counterBranch=rival=>rival==='broke'?2:0;
const enemyName=g=>({misanthropic:'Misanthropic',closed:'Closed AI',broke:'Broke Labs'})[g.tutorial.rival];
function syncFlags(g){const t=g.tutorial,l=currentLesson(g);t.step=TUTORIAL_ENGINE_STEP;t.freezeOnReady=!!l?.freezeOnReady||t.objectiveId==='formation.open';t.endpointLocked=t.objectiveId!=='endpoint';t.counterActive=t.objectiveId==='counter'&&t.counterReleased===true;}
const hasFact=(g,kind)=>g.tutorial.evidence.some(e=>e.kind===kind);
function fact(g,kind,unit=null){if(!hasFact(g,kind)&&g.tutorial.evidence.length<32)g.tutorial.evidence.push({kind,time:g.time,unit:unit?.id||null,server:unit?.server||g.activeServer,faction:g.faction});}
const FACTS=new Set(['ward.ready','ward.broken','ward.restored','link.ready','link.broken','link.restored','opening.ability','opening.focus','burst.heat','burst.recovery','burst.recovered','cooling.vent','counter.mark','counter.applied','facility.offline']);
function openingUnits(g){const t=g.tutorial;return {model:g.units.find(u=>u.id===t.openingUnits?.model&&u.team==='player'),firewall:g.units.find(u=>u.id===t.openingUnits?.firewall&&u.team==='player')};}
export function tutorialFailure(g,reason){const t=g.tutorial;if(!t||t.complete)return;t.failure=reason;t.ready=false;g.paused=true;}
function openingReady(g){const pair=openingUnits(g);if(!pair.model||!pair.firewall)return false;const f=g.faction;return f==='misanthropic'?hasFact(g,'ward.restored')&&warded(g,pair.model):f==='closed'?hasFact(g,'link.restored')&&!openingUnits(g).model.path.length&&!openingUnits(g).model.moving&&distance(openingUnits(g).model,point('gateRoad',g.faction))<55:true;}
function openingStatus(g){const t=g.tutorial;if(!t.openingStaged)return 'Rally the model and firewall at your home staging road.';if(t.failure)return t.failure;if(t.openingState==='active')return g.faction==='broke'?'Use No Filter on your model. Watch its burst, heat and recovery.':'Focus the contact with your model; use '+(g.faction==='closed'?'Exclusive Endpoint while linked.':'Quarantine while protecting your Oracle.');if(openingReady(g))return 'Formation ready. Begin contact when you are ready.';if(g.faction==='misanthropic')return !hasFact(g,'ward.ready')?'Hold the Constitution still for 3 seconds to establish its ward.':!hasFact(g,'ward.broken')?'Move the Constitution to see its ward break.':'Return beside your Oracle and hold the Constitution still to restore its ward.';return !hasFact(g,'link.ready')?'Keep a Black Box within 155m of the Gatekeeper.':!hasFact(g,'link.broken')?'Move the Black Box outside the link, then reconnect.':'Bring the Black Box back beside the Gatekeeper.';}
function updateOpening(g){const t=g.tutorial,{model,firewall}=openingUnits(g);if(!model||!firewall){tutorialFailure(g,'A teaching unit was lost. Retry the named training checkpoint or replace the unit.');return;}
 if(!t.openingStaged){if([model,firewall].every(u=>u.server===g.faction&&!u.path.length&&distance(u,point('gateRoad',g.faction))<75))t.openingStaged=true;else return;}
 if(g.faction==='misanthropic'){if(warded(g,model)){fact(g,'ward.ready',model);if(hasFact(g,'ward.broken'))fact(g,'ward.restored',model);}else if(hasFact(g,'ward.ready')&&firewall.moving)fact(g,'ward.broken',firewall);}
 if(g.faction==='closed'){if(linked(g,model)){fact(g,'link.ready',model);if(hasFact(g,'link.broken'))fact(g,'link.restored',model);}else if(hasFact(g,'link.ready'))fact(g,'link.broken',model);if(t.openingState==='active'&&(model.focusStacks||0)>0&&t.threats.includes(model.focusTarget))fact(g,'opening.focus',model);}
 if(g.faction==='broke'&&hasFact(g,'opening.ability')){if(g.time>=(model.boostUntil||0))fact(g,'burst.recovery',model);if(g.time>=(model.recoveryUntil||0))fact(g,'burst.recovered',model);}
 if(t.openingState!=='active')return;
 const cleared=t.threats.length>0&&t.threats.every(id=>!g.units.some(u=>u.id===id));
 if(cleared&&!hasFact(g,'opening.ability')){tutorialFailure(g,'Contact cleared before the faction ability was demonstrated. Retry this contact.');return;}
 t.ready=cleared&&hasFact(g,'opening.ability')&&(g.faction==='closed'?hasFact(g,'opening.focus'):g.faction==='broke'?hasFact(g,'burst.heat')&&hasFact(g,'burst.recovery'):hasFact(g,'ward.restored'));
 if(cleared&&g.faction==='closed'&&!hasFact(g,'opening.focus'))tutorialFailure(g,'The contact ended before concentrated linked fire was demonstrated. Retry this contact.');
}
function openingAction(g,release){const t=g.tutorial,{model,firewall}=openingUnits(g);if(!model||!firewall)return {ok:false,reason:'A teaching unit is missing. Use the named retry.'};
 if(!t.openingStaged){command(g,[model.id,firewall.id],'move','gateRoad');return {ok:true,ids:[model.id,firewall.id]};}
 if(t.openingState==='active'){return {ok:true,ids:[g.faction==='misanthropic'?firewall.id:model.id]};}
 if(!openingReady(g)){
  if(g.faction==='misanthropic'){if(hasFact(g,'ward.broken')&&distance(model,firewall)>120)command(g,[firewall.id],'move','gateRoad');else if(!hasFact(g,'ward.ready')||hasFact(g,'ward.broken'))holdPosition(g,[firewall.id]);else command(g,[firewall.id],'move','campus');return {ok:true,ids:[firewall.id]};}
  command(g,[model.id],'move',hasFact(g,'link.broken')?'gateRoad':'campus');return {ok:true,ids:[model.id]};
 }
 if(!release)return {ok:false,needsCheckpoint:true,checkpoint:'Defend contact',reason:'Prepare a recovery point before releasing contact.'};
 const u=spawn(g,'model',t.rival,'gateRoad',g.faction),p=point('gateRoad',g.faction);const offset=OPENING_CONTACT[g.faction];u.x=p.x+offset.x;u.y=p.y+offset.y;u.order='hold';t.threats=[u.id];t.openingState='active';t.encounterGeneration++;holdPosition(g,[model.id,firewall.id]);return {ok:true,ids:[g.faction==='misanthropic'?firewall.id:model.id]};
}
export function createTutorial(faction,rival){
 const g=createGame(faction,'relaxed');g.preview=true;g.nextWave=Infinity;g.funds=4200;g.heat=52;initInfrastructure(g);
 g.tutorial={version:TUTORIAL_VERSION,step:TUTORIAL_ENGINE_STEP,objectiveId:'campus',completed:[],evidence:[],compatibilitySkipped:[],openingState:'prepare',openingStaged:true,openingUnits:{},failure:null,encounterGeneration:0,counterReleased:false,ready:false,complete:false,inspected:[],abilityUsed:false,baseline:0,threats:[],enteredAt:0,rival:g.enemies.includes(rival)?rival:g.enemies[0],opening:null,support:null,final:null,formationCasts:[],counterUsed:false,rallying:false,assaulting:false};
 for(const id of g.enemies)g.servers[id].integrity=g.servers[id].maxIntegrity=1400;
 // Authored training opponent: a real completed branch, with ordinary damage and bonuses.
 prepareRival(g);const p=point('gateRoad',faction);for(const role of ['model','firewall']){const u=owns(g,role)[0];u.node='gateRoad';u.x=p.x;u.y=p.y+(role==='model'?-24:24);tutorialUnit(g,role,u);}syncFlags(g);return g;
}
function tutorialUnit(g,role,u){g.tutorial.openingUnits[role]=u.id;}
function spawnCounter(g){const t=g.tutorial;t.threats=[];for(const role of t.rival==='broke'?['malware','malware']:['firewall','model']){const u=spawn(g,role,t.rival,'gate',g.faction);u.order='hold';t.threats.push(u.id);}t.rallying=false;t.assaulting=false;}
function prepareRival(g){const t=g.tutorial,r=t.rival,i=counterBranch(r),s=g.infrastructure[r],b=tree(r).branches[i],facility=s.buildings[facilitySite(i)];
 if(!facility.built){facility.built=true;facility.hp=facility.maxHp;s.completed.push(b.research[0].id);s.revision++;}
}
export function migrateTutorial(g){
 const t=g.tutorial;if(!t)return;if(t.version===TUTORIAL_VERSION){syncFlags(g);return;}
 if(t.version!==undefined&&t.version!==2)throw Error('HI_MIGRATION_VERSION');
 const old=t.step,wasV2=t.version===2,id=wasV2?(LESSONS[old]?.id==='formation'?'formation.finish':LESSONS[old]?.id):LEGACY_ORDER[old];if(!id)throw Error('HI_MIGRATION_OBJECTIVE');
 const completed=[];const index=TUTORIAL_ORDER.indexOf(id);for(const x of TUTORIAL_ORDER.slice(0,index))completed.push(x);
 // v2's formation was after production. Preserve that prerequisite, even in early saves.
 if(wasV2&&old<11){const i=completed.indexOf('formation.finish');if(i>=0)completed.splice(i,1);}
 const infrastructure=state(g),branches=tree(g.faction).branches,activeBranch=branches.findIndex(b=>[b.id,...b.research.map(r=>r.id)].includes(infrastructure.project?.id)),built=branches.findIndex((b,i)=>infrastructure.buildings[facilitySite(i)].built),specialized=branches.findIndex(b=>b.research[1].id===infrastructure.specialization);
 Object.assign(t,{enteredAt:Number.isFinite(t.enteredAt)?t.enteredAt:g.time,abilityUsed:!!t.abilityUsed,complete:!!t.complete,version:TUTORIAL_VERSION,step:TUTORIAL_ENGINE_STEP,objectiveId:id,completed,evidence:[],compatibilitySkipped:old>0?['formation.open']:[],openingState:old>0?'complete':'prepare',openingStaged:old>0,openingUnits:{model:owns(g,'model')[0]?.id||null,firewall:owns(g,'firewall')[0]?.id||null},failure:null,encounterGeneration:0,counterReleased:id==='counter'&&t.threats.length>0,rival:wasV2?t.rival:g.attackTarget||g.enemies[0],opening:wasV2?t.opening:activeBranch>=0?activeBranch:built>=0?built:null,support:wasV2?t.support:null,final:wasV2?t.final:specialized>=0?specialized:null,formationCasts:wasV2?t.formationCasts:[],counterUsed:!!t.counterUsed,rallying:!!t.rallying,assaulting:!!t.assaulting,baseline:!wasV2&&old===1?g.servers[g.faction].validation:t.baseline});
 if(old>0&&!t.completed.includes('formation.open'))t.completed.push('formation.open');t.ready=false;syncFlags(g);
}
export function validTutorial(g){
 const t=g.tutorial;if(!t)return true;
 if(!Array.isArray(t.threats)||t.threats.length>16||t.threats.some(id=>!Number.isInteger(id))||!Array.isArray(t.inspected)||t.inspected.length>60||t.inspected.some(id=>typeof id!=='string'||id.length>80))return false;
 if(t.version===undefined)return Number.isInteger(t.step)&&t.step>=0&&t.step<=9;
 if(![2,TUTORIAL_VERSION].includes(t.version)||!g.enemies.includes(t.rival)||!Array.isArray(t.formationCasts)||t.formationCasts.length>8||t.formationCasts.some(r=>!ALL.includes(r)))return false;
 if(!['opening','support','final'].every(k=>t[k]===null||Number.isInteger(t[k])&&t[k]>=0&&t[k]<3))return false;
 if(t.version===2)return Number.isInteger(t.step)&&t.step>=0&&t.step<LESSONS.length;
 const ids=v=>Array.isArray(v)&&v.length<=TUTORIAL_ORDER.length&&new Set(v).size===v.length&&v.every(id=>known.has(id));
 return ['ready','complete','abilityUsed','counterUsed','rallying','assaulting'].every(k=>typeof t[k]==='boolean')&&Number.isFinite(t.baseline)&&Number.isFinite(t.enteredAt)&&t.step===TUTORIAL_ENGINE_STEP&&known.has(t.objectiveId)&&ids(t.completed)&&t.completed.every(id=>TUTORIAL_ORDER.indexOf(id)<TUTORIAL_ORDER.indexOf(t.objectiveId)||t.complete&&id==='endpoint')&&ids(t.compatibilitySkipped)&&t.compatibilitySkipped.every(id=>id==='formation.open'&&t.completed.includes(id))&&Array.isArray(t.evidence)&&t.evidence.length<=32&&t.evidence.every(e=>e&&FACTS.has(e.kind)&&Number.isFinite(e.time)&&e.time>=0&&e.faction===g.faction&&g.enemies.concat(g.faction).includes(e.server)&&(e.unit===null||Number.isInteger(e.unit)))&&['prepare','active','complete'].includes(t.openingState)&&Number.isInteger(t.encounterGeneration)&&t.encounterGeneration>=0&&(t.failure===null||typeof t.failure==='string'&&t.failure.length<=200)&&typeof t.counterReleased==='boolean'&&typeof t.openingStaged==='boolean'&&t.openingUnits&&['model','firewall'].every(k=>t.openingUnits[k]===null||Number.isInteger(t.openingUnits[k]));
}
export function inspectTutorial(g,id){const t=g.tutorial;if(!t)return;const key=g.activeServer+':'+id;if(!t.inspected.includes(key))t.inspected.push(key);}
export function chooseTutorialBranch(g,index){
 const t=g.tutorial,l=t&&currentLesson(g);if(!l?.choice||!Number.isInteger(index)||index<0||index>2||g.paused||g.result||state(g).project)return false;
 if(l.choice==='support'&&index===t.opening||l.choice==='final'&&state(g).specialization)return false;
 t[l.choice]=index;t.ready=false;return true;
}
export function tutorialChoices(g){
 const t=g.tutorial,l=t&&currentLesson(g);if(!l?.choice)return [];
 return tree(g.faction).branches.map((b,i)=>({index:i,name:l.choice==='final'?b.research[1].name:b.name,effect:l.choice==='final'?b.research[1].effect:b.effect,advice:BRANCH_ADVICE[g.faction][i],cost:l.choice==='final'?b.research[1].cost:b.cost,selected:t[l.choice]===i,disabled:!!state(g).project||l.choice==='support'&&i===t.opening||l.choice==='final'&&!!state(g).specialization,branch:b.name}));
}
function nextProject(g){const phase=tutorialPhase(g),i=selectedBranch(g);if(i===null)return null;const b=tree(g.faction).branches[i],s=state(g);
 if(s.buildings[facilitySite(i)].hp<=0)return b;
 if(['research','specialize'].includes(phase)&&!s.completed.includes(b.research[0].id))return b.research[0];
 if(phase==='specialize'&&!s.specialization)return b.research[1];return null;
}
function currentDoctrine(g,faction,text){const b=techBonuses(g,faction);return text.replaceAll('145m',(145+(b.wardRange||0))+'m').replaceAll('155m',(155+(b.linkRange||0))+'m').replace('20% less',Math.round(20+(b.wardReduction||0)*100)+'% less').replace('25% extra',Math.round(25+(b.markDamage||0)*100)+'% extra').replace('5s of',(5+(b.recovery||0))+'s of').replaceAll('70°',heatThreshold(g,faction)+'°');}
export function lesson(g){
 if(!g.tutorial)return null;const t=g.tutorial,p=tutorialPhase(g),l=currentLesson(g),k=kit(g.faction),i=selectedBranch(g),branches=tree(g.faction).branches,b=i===null?null:branches[i];
 if(p==='formation.open')return {...l,id:p,roles:['model','firewall'],title:g.faction==='misanthropic'?'Hold. Break. Re-form.':g.faction==='closed'?'Connect. Focus. Overwhelm.':'Burst now. Pay in heat.',site:'gateRoad',role:g.faction==='misanthropic'?'firewall':'model',copy:k.rule,task:openingStatus(g),action:!t.openingStaged?'Rally your field pair':t.openingState==='active'?'Focus contact · use E / Ability':openingReady(g)?'Begin contact':g.faction==='misanthropic'?hasFact(g,'ward.broken')?'Return and restore ward':hasFact(g,'ward.ready')?'Move Constitution':'Hold Constitution':hasFact(g,'link.broken')?'Restore Gatekeeper link':'Move Black Box outside link'};
 if(l.tech&&['build','research','expand','specialize'].includes(p)){const next=nextProject(g);return {...l,site:facilitySite(i??0),copy:l.copy,task:p==='research'?`Research ${branches[t.opening??0].research[0].name}. ${branches[t.opening??0].research[0].effect}`:l.task,action:state(g).project?'Project underway':next?`${next===b?'Build':'Research'} ${next.name} · ${next.cost}`:'Choose a branch below'};}
 if(p==='battery')return {...l,copy:`Your batteries deliver ${k.harvestEnergy} energy and ${k.harvestFunds} funds. Charging takes ${k.chargeSeconds}s. Right-click the grid with a harvester to start its repeating delivery route.`};
 if(p==='cooling')return {...l,task:g.faction==='broke'?'Anchor the cooling ship, then select it and use Cold Take (E / Ability) to shed burst heat.':l.task,copy:`Anchor the ship at the intake to cool at ${k.cooling}°/s. Above ${heatThreshold(g)}°, model movement and assembly slow. Offshore ships stay home when the field team raids.`};
 if(p==='cloud')return {...l,action:owns(g,'cloud').length?'Anchor floating cloud':'Deploy floating cloud',copy:`An anchored cloud adds ${k.cloudCapacity} compute.${g.faction==='closed'?' The first two Private Clouds also earn 2 funds/s each.':''} Both active and queued units reserve compute. Building more models without enough compute slows your whole army.`};
 if(p==='models')return {...l,copy:currentDoctrine(g,g.faction,k.rule+' '+k.tactic)};
 if(p==='malware')return {...l,copy:unitGuide(g.faction,'agent',{},g).job+' '+unitGuide(g.faction,'malware',{},g).job+' Keep fragile specialists behind models; enemy firewalls block many of their effects.'};
 if(p==='formation.finish'){const broke=g.faction==='broke',role=broke?(t.formationCasts.includes('model')?'cooler':'model'):'firewall',guide=unitGuide(g.faction,role,{},g);return {...l,role,title:broke?'Burst, vent, recover':g.faction==='closed'?'Keep the network linked':'Establish a protected formation',copy:currentDoctrine(g,g.faction,k.tactic)+' '+guide.order,task:broke?'Rally at the staging road. Your earlier burst and anchored vent count; wait for the model to recover.':`Rally at the staging road. Select your firewall and use ${guide.ability} while it protects a model.`,action:!t.formationRallied?'Rally at staging road':`Select ${role} · use E / Ability`};}
 const r=t.rival,eb=tree(r).branches[counterBranch(r)];
 if(p==='counter')return {...l,title:r==='broke'?'Firewall against Reply Swarms':r==='closed'?'Sever their Gatekeeper link':'Collapse their Constitution ward',copy:`${enemyName(g)}: ${currentDoctrine(g,r,kit(r).rule)} Counter: ${kit(r).counter}`,task:r==='broke'?'Send the firewall first: it deals 2.8× damage to Reply Swarms. Models wait at campus until it hits. Then rally the escort to contain both.':`Focus the enemy ${r==='closed'?'Gatekeeper':'Constitution'} first. Its removal strips the nearby model of ${r==='closed'?'links and damage ramp':'its ward'}. Contain both hostiles.`,action:t.rallying?'Escort assembling':'Rally & focus the counter target'};
 if(p==='transfer')return {...l,task:`Enter ${enemyName(g)} through the uplink. Home logistics keep working.`};
 if(p==='recon'||p==='sabotage')return {...l,site:facilitySite(counterBranch(r)),title:p==='recon'?`Scout ${eb.name}`:`Disable ${eb.name}`,copy:`${eb.name}: ${eb.effect} Researched: ${eb.research[0].name} — ${eb.research[0].effect} ${r==='broke'?'Without cooling and Thermal Buffer, Broke throttles sooner. Then punish models after their six-second burst.':'Taking this branch offline removes its support bonus; continue focusing their firewall to break the formation.'} In an operation, rivals can pay to rebuild; keep pressure on the site.`,task:p==='recon'?`Inspect ${eb.name} on the rival continent. The training endpoint stays shielded until this facility drill is complete.`:`Focus ${eb.name} until its HP reaches zero. Watch its branch go offline.`};
 if(p==='endpoint')return {...l,copy:`Their ${eb.name} is offline. ${currentDoctrine(g,g.faction,kit(g.faction).tactic)} In Blackout Protocol, also capture the data relay to weaken endpoint shielding. Your specialization and home supply lines sustain the final push.`};
 return l;
}
export function tutorialAllows(g,role){return !g.tutorial||(tutorialPhase(g)==='formation.open'?['model','firewall']:currentLesson(g).roles).includes(role);}
export function updateTutorial(g){
 const t=g.tutorial;if(!t||t.complete)return;const p=tutorialPhase(g),s=state(g),army=field(g);if(t.failure)return;const essential=p==='staff'?['researcher']:p==='battery'?['harvester']:p==='cooling'?['cooler']:p==='counter'?[...(t.rival==='broke'&&!t.counterUsed?['firewall']:[]),...(g.faction==='closed'&&!t.compatibilitySkipped.includes('formation.open')&&!hasFact(g,'counter.mark')?['agent']:[])]:[];if(['transfer','recon','sabotage','endpoint','counter'].includes(p)&&!owns(g).some(u=>unitType(g.faction,u.role).dps>0)&&!g.queue.some(q=>unitType(g.faction,q.role).dps>0)){tutorialFailure(g,'The field team was lost. Retry the named checkpoint or rebuild from your home campus.');return;}if(essential.some(role=>!owns(g,role).length&&!g.queue.some(q=>q.role===role))){tutorialFailure(g,'A required field unit was lost. Retry the named checkpoint, or restart training from the menu.');return;}if(p==='formation.open'){updateOpening(g);syncFlags(g);return;}if(g.faction==='broke'&&hasFact(g,'opening.ability')&&owns(g,'model').every(u=>(u.recoveryUntil||0)<=g.time))fact(g,'burst.recovered');if(p==='counter'&&g.faction==='closed'&&g.units.some(u=>t.threats.includes(u.id)&&u.markedBy==='closed'&&u.markedUntil>g.time))fact(g,'counter.mark');
 if(p==='counter'&&t.rallying){
  const home=army.filter(u=>u.server===g.faction),staging=point('gateRoad',g.faction),gate=point('gate',g.faction);
  const assembled=t.rival==='broke'?home.some(u=>u.role==='firewall')&&home.every(u=>u.role==='firewall'||g.faction==='closed'&&u.role==='agent'?distance(u,staging)<105:distance(u,gate)>300):home.length&&home.every(u=>distance(u,staging)<105);
  if(assembled){
   if(!t.threats.length)spawnCounter(g);
   const target=g.units.find(u=>t.threats.includes(u.id));if(target){command(g,home.filter(u=>t.rival!=='broke'||u.role==='firewall').map(u=>u.id),'attack',target.id);for(const u of home)u.speedLimit=48;}
   t.rallying=false;t.assaulting=true;
  }
 }
 // Finish the guided engagement after its focus target falls. Manual move/hold orders remain yours.
 if(p==='counter'&&t.assaulting&&t.counterUsed){const target=g.units.find(u=>t.threats.includes(u.id));if(target)command(g,army.filter(u=>u.server===g.faction&&['guard','hold','move'].includes(u.order)).map(u=>u.id),'attack',target.id);}
 const idx=selectedBranch(g),built=i=>i!==null&&s.buildings[facilitySite(i)].hp>0;
 if(p==='campus')t.ready=t.inspected.includes(g.faction+':campus')||t.inspected.includes('campus');
 else if(p==='staff')t.ready=owns(g,'researcher').some(u=>u.order==='research'&&distance(u,point('lab',g.faction))<95)&&g.servers[g.faction].validation>=Math.min(100,t.baseline+.4);
 else if(p==='battery')t.ready=g.stats.deliveries>t.baseline;
 else if(p==='cooling')t.ready=(g.faction!=='broke'||t.compatibilitySkipped.includes('formation.open')||hasFact(g,'cooling.vent'))&&owns(g,'cooler').some(u=>u.order==='cool'&&distance(u,point('intake',g.faction))<85)&&g.heat<Math.max(10.1,t.baseline-.5);
 else if(p==='cloud')t.ready=owns(g,'cloud').some(u=>u.server===g.faction&&u.order==='cool'&&distance(u,point('intake',g.faction))<80);
 else if(p==='build'||p==='expand')t.ready=built(idx);
 else if(p==='research')t.ready=t.opening!==null&&s.completed.includes(tree(g.faction).branches[t.opening].research[0].id)&&built(t.opening);
 else if(p==='specialize')t.ready=!!s.specialization;
 else if(p==='models')t.ready=owns(g,'model').length>=2;
 else if(p==='malware')t.ready=owns(g,'malware').length>0;
 else if(p==='formation.finish')t.ready=(t.compatibilitySkipped.includes('formation.open')||t.formationRallied&&armyAtHome(g).every(u=>distance(u,point('gateRoad',g.faction))<105))&&(g.faction==='broke'?t.formationCasts.includes('model')&&t.formationCasts.includes('cooler')&&owns(g,'model').every(u=>(u.recoveryUntil||0)<=g.time):t.formationCasts.includes('firewall')&&owns(g,'model').some(u=>g.faction==='closed'?linked(g,u):warded(g,u)));
 else if(p==='counter')t.ready=t.counterUsed&&(g.faction!=='closed'||t.compatibilitySkipped.includes('formation.open')||hasFact(g,'counter.mark'))&&t.threats.length>0&&t.threats.every(id=>!g.units.some(u=>u.id===id));
 else if(p==='transfer')t.ready=g.visited.includes(t.rival)&&army.some(u=>u.server===t.rival);
 else if(p==='recon')t.ready=t.inspected.includes(t.rival+':'+facilitySite(counterBranch(t.rival)));
 else if(p==='sabotage')t.ready=g.infrastructure[t.rival].buildings[facilitySite(counterBranch(t.rival))].hp<=0;
 else if(p==='endpoint'){t.ready=g.result==='victory';if(t.ready){t.complete=true;if(!t.completed.includes('endpoint'))t.completed.push('endpoint');}}
 // Arrival and demolition are real game outcomes. Stop the team's automatic siege between instructions.
 if(t.ready&&currentLesson(g).freezeOnReady)holdPosition(g,army.map(u=>u.id));
 if(['recon','sabotage'].includes(p)&&g.infrastructure[t.rival].buildings[facilitySite(counterBranch(t.rival))].hp>0)t.sabotageOnline=true;
 if(t.ready&&p==='counter')fact(g,'counter.applied');if(t.ready&&p==='sabotage'&&t.sabotageOnline)fact(g,'facility.offline');if(p==='counter'&&t.counterReleased&&t.threats.length&&t.threats.every(id=>!g.units.some(u=>u.id===id))&&!t.ready)tutorialFailure(g,'Contact cleared without the required counter. Retry the named checkpoint.');syncFlags(g);
}
export function advanceTutorial(g){
 updateTutorial(g);const t=g.tutorial;if(!t||!t.ready||t.complete||g.paused)return false;if(!t.completed.includes(t.objectiveId))t.completed.push(t.objectiveId);if(t.objectiveId==='formation.open')t.openingState='complete';const next=TUTORIAL_ORDER.slice(TUTORIAL_ORDER.indexOf(t.objectiveId)+1).find(id=>!t.completed.includes(id));if(!next)return false;t.objectiveId=next;t.ready=false;t.enteredAt=g.time;const p=tutorialPhase(g);
 t.baseline=p==='staff'?g.servers[g.faction].validation:p==='battery'?g.stats.deliveries:p==='cooling'?g.heat:0;
 if(p==='specialize'&&state(g).specialization)t.final=tree(g.faction).branches.findIndex(b=>b.research[1].id===state(g).specialization);
 if(p==='counter'){
  for(const u of armyAtHome(g))u.speedLimit=null;
  t.threats=[];t.rallying=t.assaulting=false;t.counterReleased=false;g.events.unshift({time:g.time,text:'TRAINING CONTACT — identify the support unit before engaging.'});g.events.length=Math.min(8,g.events.length);
 }
 if(p==='transfer')for(const u of field(g))u.speedLimit=null;
 syncFlags(g);return true;
}
const armyAtHome=g=>field(g).filter(u=>u.server===g.faction);
export function tutorialAction(g,{release=false}={}){
 const t=g.tutorial;if(!t||g.paused||g.result)return {ok:false,reason:'Resume training first.'};const p=tutorialPhase(g),l=lesson(g),ids=owns(g,l.role).filter(u=>u.server===g.activeServer&&!u.transit).map(u=>u.id);
 if(t.failure)return {ok:false,reason:t.failure,retry:true};if(p==='formation.open')return openingAction(g,release);
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
 if(p==='formation.finish'){
  if(!t.formationRallied){const army=armyAtHome(g);command(g,army.map(u=>u.id),'move','gateRoad');for(const u of army)u.speedLimit=48;t.formationRallied=true;return {ok:true,ids:army.map(u=>u.id)};}
  return {ok:true,ids};
 }
 if(p==='counter'){
  if(!t.counterReleased){if(!release)return {ok:false,needsCheckpoint:true,checkpoint:'Breach counter',reason:'Prepare a recovery point before releasing contact.'};t.counterReleased=true;t.encounterGeneration++;syncFlags(g);}
  const army=armyAtHome(g),target=g.units.find(u=>t.threats.includes(u.id));
  if(!army.length)return {ok:false,reason:'Deploy a model and firewall from the dock, then rally again.'};
  if(t.rival==='broke'&&!army.some(u=>u.role==='firewall'))return {ok:false,reason:'Deploy a firewall to demonstrate its counter against Swarms.'};
  if(!t.assaulting){if(!t.rallying){for(const u of army){command(g,[u.id],'move',t.rival==='broke'&&u.role!=='firewall'&&!(g.faction==='closed'&&u.role==='agent')?'campus':'gateRoad');u.speedLimit=48;}t.rallying=true;}}
  else if(target)command(g,army.filter(u=>(t.rival!=='broke'||t.counterUsed||u.role==='firewall')&&(u.order!=='attack'||u.target!==target.id)).map(u=>u.id),'attack',target.id);
  return {ok:true,ids:army.map(u=>u.id)};
 }
 if(p==='transfer')return {...launchRaid(g,t.rival),ids:armyAtHome(g).map(u=>u.id)};
 if(p==='sabotage'||p==='endpoint'){g.activeServer=t.rival;const ids=field(g).filter(u=>u.server===t.rival).map(u=>u.id);command(g,ids,p==='sabotage'?'sabotage':'siege',l.site);return {ok:!!ids.length,ids,reason:ids.length?undefined:'Transfer a field team first: Units → Attack server. Home logistics stay behind.'};}
 return {ok:true,ids};
}
export function tutorialAbility(g,ids){
 const available=owns(g).filter(u=>ids.includes(u.id)&&!abilityProblem(g,u)),beforeHeat=g.heat,r=ability(g,ids),t=g.tutorial;if(!r.ok||!t)return r;
 t.abilityUsed=true;const p=tutorialPhase(g);
 for(const u of available){if(u.server!==g.faction)continue;
  if(p==='formation.open'&&t.openingState==='active'&&u.id===t.openingUnits[g.faction==='misanthropic'?'firewall':'model']){const m=openingUnits(g).model;if(g.faction==='misanthropic'?m&&warded(g,m):g.faction==='closed'?linked(g,u):true){fact(g,'opening.ability',u);if(g.faction==='broke'&&g.heat>beforeHeat)fact(g,'burst.heat',u);if(!t.formationCasts.includes(u.role))t.formationCasts.push(u.role);}}
  if((p==='cooling'||p==='formation.finish')&&g.faction==='broke'&&u.role==='cooler'){fact(g,'cooling.vent',u);if(!t.formationCasts.includes('cooler'))t.formationCasts.push('cooler');}
  if(p==='formation.finish'){const valid=g.faction==='broke'?['model','cooler'].includes(u.role):u.role==='firewall'&&owns(g,'model').some(m=>m.server===u.server&&distance(m,u)<(g.faction==='closed'?155+(techBonuses(g).linkRange||0):145+(techBonuses(g).wardRange||0)));if(valid&&!t.formationCasts.includes(u.role))t.formationCasts.push(u.role);}
 }return r;
}
export function tutorialTakeaway(g){if(!g.tutorial)return '';if(hasFact(g,'facility.offline'))return 'You disabled the rival’s supporting technology before the final breach.';if(hasFact(g,'cooling.vent'))return 'You used anchored cooling to shed the heat of your burst.';if(hasFact(g,'opening.focus'))return 'Your linked model concentrated fire on one contact.';if(hasFact(g,'ward.restored'))return 'You restored the ward after movement broke the formation.';return 'Keep the field team supplied while you pressure the rival server.';}
export function tutorialStatus(g){
 const t=g.tutorial;if(!t)return '';if(t.failure)return t.failure;if(tutorialPhase(g)==='formation.open')return t.ready?'Contact contained. Continue to sustain your campus.':openingStatus(g);if(t.complete)return 'Training complete — take your chosen strategy into an operation.';if(t.ready)return 'Objective complete. Continue when you are ready.';const p=tutorialPhase(g),s=state(g);
 if(['build','research','expand','specialize'].includes(p)){const project=s.project;if(project)return projectWait(g)||`${project.type==='research'?'Research':'Construction'} · ${Math.ceil(project.remaining)}s remaining.`;const i=selectedBranch(g);if(i===null)return 'Compare the branches below, then select one.';if(p==='specialize')return 'Complete the next project below. Only the final research commits your specialization.';return 'Use the guided order or the matching branch in Systems.';}
 if(p==='battery')return owns(g,'harvester')[0]?.cargo?'Battery charged — returning to campus.':'Wait for a complete battery delivery.';
 if(p==='cloud')return g.queue.some(q=>q.role==='cloud')?'Floating cloud assembling…':owns(g,'cloud').length?'Cloud ready — anchor at the home intake.':'Deploy a cloud from the guided order or dock.';
 if(p==='formation.finish')return !t.formationRallied?'Rally first so models and protection arrive together.':g.faction==='broke'?`No Filter ${t.formationCasts.includes('model')?'✓':'needed'} · Cold Take ${t.formationCasts.includes('cooler')?'✓':'needed'} · wait for model recovery.`:'Select the firewall after the formation arrives. E / Ability costs 60 funds.';
 if(p==='counter'&&t.threats.length&&!t.counterUsed&&t.threats.every(id=>!g.units.some(u=>u.id===id)))return 'Threats cleared without the counter. Use the guided order to repeat this drill.';
 if(p==='counter'&&!t.counterReleased)return 'Read the enemy formation. Begin the counter when you are ready.';
 if(p==='counter')return t.rallying?(t.rival==='broke'?'The escort returns to campus. Your firewall will engage the staged Swarms first.':'Assembling the escort; fast specialists wait for the models.'):`${t.threats.filter(id=>!g.units.some(u=>u.id===id)).length}/${t.threats.length} threats contained · ${t.counterUsed?'counter applied':'focus the counter target'}`;
 if(p==='transfer')return g.raids.some(r=>r.player)?'Team staging / transferring through the uplink.':'Ready to leave home. Logistics remain on this server.';
 if(p==='sabotage'){const b=g.infrastructure[t.rival].buildings[lesson(g).site];return `${tree(t.rival).branches[counterBranch(t.rival)].name} · ${Math.ceil(b.hp)} / ${b.maxHp} HP`;}
 return 'Complete the highlighted field order.';
}
