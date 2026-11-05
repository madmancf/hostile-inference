import {techBonuses,techCost,techCompute,heatThreshold,tickInfrastructure,damageFacility} from './faction-tech.js';
import { FACTIONS, UNITS } from '../v2/world.js';
import { SERVERS, SERVER_WORLD, serverPoint, serverNearest, serverRoute } from '../servers/territories.js';
import { ROLES } from '../servers/roles.js';
import { unitType, kit, protector, linked, updateFactionState, attackPower, receiveDamage, onHit, abilityProblem, castFactionAbility } from './faction-rules.js';
export { ROLES, SERVERS };
export const WORLD=SERVER_WORLD;
export const point=serverPoint,route=serverRoute,nearestNode=serverNearest;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const typeFor=u=>unitType(u.faction,u.role);
const local=(a,b)=>!a.transit&&!b.transit&&a.server===b.server;
function log(g,text){g.events.unshift({time:g.time,text});g.events=g.events.slice(0,8);}
export function spawn(g,role,team='player',node,server){
 if(!ROLES.some(r=>r.key===role))throw new Error('Unknown role');
 const faction=team==='player'?g.faction:FACTIONS[team]?team:g.enemies[0];
 const type=unitType(faction,role);server=server||faction;const origin=node||(type.domain==='sea'?'homeDock':role==='researcher'?'lab':role==='harvester'?'grid':role==='agent'?'lab':'campus');
 const p=point(origin,server),rank=g.units.filter(u=>u.role===role&&u.team===team&&u.server===server).length;
 const offset=formationSlot(role,rank),u={id:g.nextId++,role,team,faction,server,rank,x:p.x+offset.x,y:p.y+offset.y,hp:type.hp,maxHp:type.hp,path:[],node:origin,order:'hold',target:null,locked:0,infected:0,cooldown:0,abilityCooldown:0,work:0,cargo:0,arrival:null,raid:null,transit:false,evacuations:0,currentSpeed:0,heading:0,moving:false,animDistance:0,shot:0,hit:0};g.units.push(u);return u;
}
function formationSlot(role,rank){const angle=(ROLES.findIndex(r=>r.key===role)*2.399963+rank*1.9),radius=role==='model'?48:role==='firewall'?46:role==='cooler'||role==='cloud'?30:32;return {x:Math.cos(angle)*(radius+Math.floor(rank/3)*22),y:Math.sin(angle)*(radius+Math.floor(rank/3)*22)};}
export function createGame(faction='misanthropic',difficulty='standard'){
 if(!FACTIONS[faction])throw new Error('Unknown faction');
 const g={rulesVersion:2,faction,enemies:Object.keys(FACTIONS).filter(f=>f!==faction),difficulty:difficulty==='relaxed'?'relaxed':'standard',activeServer:faction,visited:[faction],servers:Object.fromEntries(Object.keys(SERVERS).map(id=>[id,{integrity:id===faction?1000:1300,maxIntegrity:id===faction?1000:1300,validation:0}])),raids:[],attackTarget:null,nextRaid:1,time:0,nextId:1,units:[],queue:[],funds:900,energy:100,heat:30,quality:100,progress:0,campus:1000,capacity:38,used:0,wave:0,nextWave:difficulty==='relaxed'?60:40,events:[],effects:[],result:null,stats:{deployed:0,contained:0,deliveries:0,transfers:0},paused:false};
 for(const role of ['researcher','harvester','model','firewall','agent','cooler'])spawn(g,role);
 for(const enemy of g.enemies){for(const role of ['firewall','agent','malware']){const u=spawn(g,role,enemy,'campus',enemy);u.order='guard';}spawn(g,'researcher',enemy,'lab',enemy);}
 log(g,`${FACTIONS[faction].name} home server online. Choose a rival server to attack.`);return g;
}
export function compute(g){const cloud=g.units.filter(u=>u.hp>0&&u.team==='player'&&u.server===g.faction&&!u.transit&&u.role==='cloud'&&distance(u,point('intake',u.server))<80).length;g.capacity=(g.operation?44+(g.operation.upgrades.fabric||0)*16:38)+cloud*kit(g.faction).cloudCapacity+(techBonuses(g).capacity||0);g.used=g.units.filter(u=>u.hp>0&&u.team==='player').reduce((n,u)=>n+techCompute(g,u.faction,u.role,typeFor(u).compute),0)+g.queue.reduce((n,q)=>n+techCompute(g,g.faction,q.role,unitType(g.faction,q.role).compute),0);return {used:g.used,capacity:g.capacity};}
export function deploy(g,role){
 if(g.result)return {ok:false,reason:'The raid has ended.'};const type=ROLES.some(r=>r.key===role)&&unitType(g.faction,role);if(!type)return {ok:false,reason:'Unknown unit.'};const cost=techCost(g,g.faction,role,type.cost);compute(g);
 if(g.operation&&g.units.filter(u=>u.team==='player'&&u.hp>0).length+g.queue.length>=24)return {ok:false,reason:'Field limit reached: 24 units. Recover your team before expanding.'};
 if(g.queue.length>=4)return {ok:false,reason:'Deployment queue full.'};if(g.funds<cost)return {ok:false,reason:'Insufficient funds. Keep home harvesters delivering.'};if(g.used+techCompute(g,g.faction,role,type.compute)>g.capacity)return {ok:false,reason:'Compute full. Anchor a floating cloud at your home intake.'};
 g.funds-=cost;g.queue.push({role,cost,remaining:type.time,total:type.time});compute(g);log(g,`${UNITS[g.faction][type.index].name} queued at home.`);return {ok:true};
}
export function cancelDeployment(g,index){if(g.result||!g.queue[index])return false;const [q]=g.queue.splice(index,1);g.funds+=q.cost*q.remaining/q.total;compute(g);return true;}
function travel(u,destination){u.settled=0;const type=typeFor(u),nodes=SERVERS[u.server].nodes,start=nearestNode(u,type.domain,u.server),end=typeof destination==='string'?destination:nearestNode(destination,type.domain,u.server);if(!nodes[end]||!SERVERS[u.server].edges[type.domain].flat().includes(end))return false;u.path=[start,...route(start,end,type.domain,u.server)];u.arrival=end;return true;}
export function command(g,ids,kind,target,team='player'){
 if(g.result||g.paused)return 0;let count=0;for(const u of g.units.filter(u=>u.hp>0&&u.team===team&&ids.includes(u.id)&&!u.transit)){
  const t=typeFor(u),previous={target:u.target,order:u.order,work:u.work,raid:u.raid};let destination=target;
  if(u.order===kind&&['harvest','cool','research'].includes(kind)){count++;continue;}
  if(u.order===kind&&typeof target==='string'&&u.arrival===target){count++;continue;}
  if(kind==='attack'){const enemy=g.units.find(e=>e.id===target&&e.team!==team&&e.hp>0&&local(u,e));if(!enemy||!t.dps||typeFor(enemy).domain!==t.domain)continue;destination=point(nearestNode(enemy,t.domain,u.server),u.server);u.target=enemy.id;}
  else if(kind==='sabotage'){if(!t.dps||u.server===u.faction||!(g.infrastructure?.[u.server]?.buildings[target]?.hp>0))continue;destination=target;}
  else if(kind==='harvest'){if(u.role!=='harvester'||u.server!==u.faction)continue;destination='grid';}
  else if(kind==='cool'){if(t.domain!=='sea'||u.server!==u.faction)continue;destination='intake';}
  else if(kind==='research'){if(u.role!=='researcher'||u.server!==u.faction)continue;destination='lab';}
  else if(kind==='siege'){if(!t.dps||u.server===u.faction)continue;destination='campus';}
  if(kind==='attack'&&u.order!=='attack')u.resumeOrder=u.order;u.order=kind;u.target=['attack','sabotage'].includes(kind)?target:null;u.work=0;u.raid=null;u.speedLimit=null;
  if(travel(u,destination))count++;else Object.assign(u,previous);
 }return count;
}
export function viewServer(g,id){if(!g.visited.includes(id))return false;g.activeServer=id;return true;}
export function orderFacility(g,u,site){
 if(g.result||g.paused||u.hp<=0||u.transit||u.raid||!typeFor(u).dps||u.server===u.faction||!(g.infrastructure?.[u.server]?.buildings[site]?.hp>0))return false;
 u.order='sabotage';u.target=site;u.arrival=null;return travel(u,site);
}
export function holdPosition(g,ids){if(g.result)return 0;let count=0;for(const u of g.units){if(u.hp<=0||u.team!=='player'||u.transit||!ids.includes(u.id))continue;u.order='hold';u.path=[];u.arrival=null;u.target=null;u.raid=null;u.currentSpeed=0;u.moving=false;count++;}return count;}
export function scheduleTransfer(g,ids,source,target,player=true){
 const army=g.units.filter(u=>u.hp>0&&ids.includes(u.id)&&u.server===source&&!u.transit&&!u.raid&&typeFor(u).domain==='land'&&typeFor(u).dps>0);
 if(!army.length)return false;const id=g.nextRaid++;g.raids.push({id,source,target,ids:army.map(u=>u.id),state:'staging',remaining:4,player});for(const u of army){u.raid=id;u.order='transfer';u.target=null;travel(u,'gate');}return true;
}
export function launchRaid(g,target,ids=null){
 if(g.result||!g.enemies.includes(target)||g.servers[target].integrity<=0)return {ok:false,reason:'Choose a live rival server.'};
 const available=g.units.filter(u=>u.team==='player'&&u.server===g.faction&&!u.transit&&!u.raid&&typeFor(u).dps>0&&(!ids||ids.includes(u.id)));
 if(!scheduleTransfer(g,available.map(u=>u.id),g.faction,target))return {ok:false,reason:'No ready field units at home. Deploy or return a team first.'};
 g.attackTarget=target;log(g,`Raid staging at your uplink → ${FACTIONS[target].name}.`);return {ok:true};
}
export function returnHome(g,ids=null){const source=g.activeServer;if(source===g.faction)return {ok:false,reason:'Already viewing home.'};const army=g.units.filter(u=>u.team==='player'&&u.server===source&&(!ids||ids.includes(u.id)));if(!scheduleTransfer(g,army.map(u=>u.id),source,g.faction))return {ok:false,reason:'No field team ready to return.'};log(g,'Field team returning through the server uplink.');return {ok:true};}
export function ability(g,ids){
 if(g.result||g.paused)return {ok:false,reason:'Resume an active mission first.'};
 const selected=g.units.filter(u=>u.team==='player'&&ids.includes(u.id));
 const army=selected.filter(u=>!abilityProblem(g,u));
 if(!army.length)return {ok:false,reason:abilityProblem(g,selected[0])||'Select a ready unit.'};
 const cost=60*army.length;if(g.funds<cost)return {ok:false,reason:`${army.length} ready abilities require ${cost} funds (60 each). Select fewer units.`};
 g.funds-=cost;
 for(const u of army){castFactionAbility(g,u);g.effects.push({server:u.server,x:u.x,y:u.y,color:FACTIONS[g.faction].color,life:.8,max:.8,ring:true,style:g.faction});}
 return {ok:true,count:army.length,cost};
}

function move(u,dt,factor){while(u.path.length&&distance(u,point(u.path[0],u.server))<(u.path.length===1&&['gate','gateRoad'].includes(u.path[0])?75:28))u.node=u.path.shift();const type=typeFor(u),oldX=u.x,oldY=u.y,maxSpeed=Math.min(type.speed,u.speedLimit??Infinity)*factor;const stop=u.path.length?distance(u,point(u.path[u.path.length-1],u.server)):u.arrival?distance(u,point(u.arrival,u.server)):0;const wanted=u.path.length?Math.min(maxSpeed,Math.sqrt(Math.max(0,stop)*360)):0;u.currentSpeed+=(wanted-u.currentSpeed)*Math.min(1,dt*6);let budget=u.currentSpeed*dt;while(u.path.length&&budget>0){const p=point(u.path[0],u.server),d=distance(u,p);if(d<budget+.1){u.x=p.x;u.y=p.y;u.node=u.path.shift();budget-=d;}else{u.x+=(p.x-u.x)/d*budget;u.y+=(p.y-u.y)/d*budget;budget=0;}}
 if(!u.path.length&&u.arrival){const p=point(u.arrival,u.server),offset=formationSlot(u.role,u.rank),slot={x:p.x+offset.x,y:p.y+offset.y},d=distance(u,slot);if(d>1){const n=Math.min(maxSpeed*dt,d);u.x+=(slot.x-u.x)/d*n;u.y+=(slot.y-u.y)/d*n;}}
 const moved=Math.hypot(u.x-oldX,u.y-oldY);u.moving=moved/dt>2;u.animDistance+=moved;if(u.moving){const angle=Math.atan2(u.y-oldY,u.x-oldX),delta=Math.atan2(Math.sin(angle-u.heading),Math.cos(angle-u.heading));u.heading+=delta*Math.min(1,dt*8);}
}
function separate(g){const units=g.units.filter(u=>!u.transit&&u.hp>0);for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){const a=units[i],b=units[j];if(a.server!==b.server||typeFor(a).domain!==typeFor(b).domain)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),radius=u=>['model','cloud'].includes(u.role)?24:['harvester','cooler','firewall'].includes(u.role)?20:13,min=radius(a)+radius(b);if(d>=min)continue;const angle=d>.001?Math.atan2(dy,dx):(a.id*1.7+b.id),push=(min-d)*.18,x=Math.cos(angle)*push,y=Math.sin(angle)*push;a.x-=x;a.y-=y;b.x+=x;b.y+=y;}}
function transfers(g,dt){for(const raid of g.raids){const army=g.units.filter(u=>raid.ids.includes(u.id)&&u.raid===raid.id&&u.hp>0);if(!army.length){raid.state='done';continue;}if(raid.state==='staging'&&army.every(u=>u.path.length===0&&distance(u,point('gate',u.server))<110)){raid.state='transit';for(const u of army)u.transit=true;log(g,`${raid.player?'Your':'Rival'} checkpoint transfer in flight.`);}if(raid.state==='transit'){raid.remaining-=dt;if(raid.remaining<=0){for(const u of army){u.server=raid.target;u.transit=false;u.raid=null;u.currentSpeed=0;u.moving=false;const p=point('gate',u.server);u.x=p.x+(u.id%3-1)*22;u.y=p.y;u.node='gate';u.order=u.server===u.faction?'guard':'siege';travel(u,'campus');}const portal=point('gate',raid.target);g.effects.push({server:raid.target,x:portal.x,y:portal.y,color:'#80d9d7',life:1.1,max:1.1,ring:true});raid.state='done';if(raid.player){if(!g.visited.includes(raid.target))g.visited.push(raid.target);g.activeServer=raid.target;g.stats.transfers++;log(g,`Field team entered ${FACTIONS[raid.target].name}'s own server continent.`);}else log(g,`${FACTIONS[army[0].faction].name} breached your home uplink.`);}}}g.raids=g.raids.filter(r=>r.state!=='done');}
function wave(g){g.wave++;const enemy=g.enemies[g.wave%2];const raid=[];for(const role of g.wave%3===0?['model','malware']:['agent','malware']){const u=spawn(g,role,enemy,'campus',enemy);raid.push(u.id);}scheduleTransfer(g,raid,enemy,g.faction,false);for(const other of g.enemies){if(g.units.filter(u=>u.server===other&&!u.transit&&u.team===other&&typeFor(u).dps>0&&!u.raid).length<2){const guard=spawn(g,'firewall',other,'campus',other);guard.order='guard';}}log(g,`${FACTIONS[enemy].name} is staging a raid on your home server.`);g.nextWave+=g.difficulty==='relaxed'?50:35;}
export function tickGame(g,dt){
 if(g.paused||g.result||g.tutorial?.freezeOnReady&&g.tutorial.ready||!Number.isFinite(dt)||dt<=0)return;if(dt>.1){let left=dt;while(left>.00001){const step=Math.min(.1,left);tickGame(g,step);left-=step;if(g.result)break;}return;}
 g.time+=dt;tickInfrastructure(g,dt);compute(g);updateFactionState(g,dt);const player=g.units.filter(u=>u.team==='player'),home=player.filter(u=>u.server===g.faction&&!u.transit),cooling=home.filter(u=>u.role==='cooler'&&distance(u,point('intake',u.server))<85).length,clouds=home.filter(u=>u.role==='cloud'&&distance(u,point('intake',u.server))<85).length;
 const tech=techBonuses(g),threshold=heatThreshold(g),energy=g.energy<10?.4:1,thermal=g.heat>threshold?Math.max(.35,1-(g.heat-threshold)/45):1,computeFactor=Math.min(1,g.capacity/Math.max(1,g.used)),throughput=energy*thermal*computeFactor*(g.operation?Math.max(.3,g.quality/100):1);
 const staffed=home.some(u=>u.hp>0&&u.role==='researcher'&&u.locked===0&&u.order==='research'&&distance(u,point('lab',u.server))<95);
 const op=g.operation,boost=op&&op.boostUntil>g.time;
 g.energy=Math.max(0,g.energy-dt*(.16+player.length*.018+player.filter(u=>u.role==='model').length*.07)*Math.max(.1,1-(op?.upgrades.grid||0)*.15+(tech.energyUse||0)));g.funds+=dt*(5+(tech.income||0)+(g.faction==='closed'?Math.min(2,clouds)*2:0))*(boost&&g.faction==='closed'?2:1);g.heat=Math.max(10,Math.min(100,g.heat+dt*((.13+player.filter(u=>u.role==='model').length*.19)*(g.faction==='broke'?1.18:1)-cooling*kit(g.faction).cooling-clouds*.12+(tech.heat||0)-(tech.cooling||0))));
 if(g.tutorial&&g.tutorial.step<3){g.energy=Math.max(80,g.energy);g.heat=Math.min(45,g.heat);}
 if(op)op.productionPaused=!staffed;
 if(g.queue.length){g.queue[0].remaining=Math.max(0,g.queue[0].remaining-dt*throughput*(op&&!staffed?0:1)*(boost&&g.faction==='closed'?1.4:1)*((g.priorityUntil||0)>g.time?1.6:1)*(1+(tech.assembly||0)));if(g.queue[0].remaining===0){const q=g.queue.shift();spawn(g,q.role);g.stats.deployed++;log(g,`${UNITS[g.faction][ROLES.find(r=>r.key===q.role).index].name} deployed at home.`);}}
 if(g.time>=g.nextWave)wave(g);
 for(const u of g.units){if(u.hp<=0)continue;u.shot=Math.max(0,(u.shot||0)-dt);u.hit=Math.max(0,(u.hit||0)-dt);u.moving=false;u.locked=Math.max(0,u.locked-dt);u.infected=Math.max(0,u.infected-dt);u.cooldown=Math.max(0,u.cooldown-dt);u.abilityCooldown=Math.max(0,u.abilityCooldown-dt);if(u.transit)continue;
  const type=typeFor(u),shield=protector(g,u);
  if(shield){u.infected=Math.max(0,u.infected-dt*3);u.locked=Math.max(0,u.locked-dt*2);}if(u.infected>0){u.hp-=dt*2;if(u.team==='player')g.quality=Math.max(30,g.quality-dt*.2);}if(u.hp<=0||u.locked>0)continue;
  const candidates=g.units.filter(e=>local(u,e)&&e.team!==u.team&&(u.team==='player'||e.team==='player')&&e.hp>0&&(e.evacuatedUntil||0)<=g.time&&typeFor(e).domain===type.domain&&distance(u,e)<type.range).sort((a,b)=>a.id===u.target?-1:b.id===u.target?1:distance(a,u)-distance(b,u)),target=type.dps&&!u.retreating?candidates[0]:null;
  if(target){u.currentSpeed=0;if(u.cooldown===0){const protectedTarget=protector(g,target);let damage=attackPower(g,u,target.id,type.dps)*(u.role==='firewall'&&target.role==='malware'?2.8:1)*(u.team==='player'?throughput:(op?.enemyThroughput??1));
 if(op&&u.team==='player'&&boost&&g.faction==='broke')damage*=1.35;
 if((target.markedUntil||0)>g.time&&target.markedBy===u.faction&&linked(g,u))damage*=1.25+(techBonuses(g,u.faction).markDamage||0);
 if(protectedTarget&&u.role==='malware')damage*=.4;
 receiveDamage(g,target,damage);onHit(g,u,target,damage);
 // Training observes the actual hit, including a lethal shot between UI refreshes.
 const drill=g.tutorial;if(drill?.counterActive&&u.team==='player'&&drill.threats.includes(target.id)&&(drill.rival==='broke'?u.role==='firewall':u.target===target.id&&target.id===drill.threats[0]))drill.counterUsed=true;
 u.shot=.35;u.aim=Math.atan2(target.y-u.y,target.x-u.x);
 u.cooldown=(u.suppressedUntil||0)>g.time?1.6:1;g.effects.push({server:u.server,x:u.x,y:u.y,tx:target.x,ty:target.y,sourceId:u.id,targetId:target.id,role:u.role,color:FACTIONS[u.faction].color,life:.24,max:.24});}}
  else{if(u.order==='sabotage'&&!(g.infrastructure?.[u.server]?.buildings[u.target]?.hp>0)){u.order='siege';u.target=null;travel(u,'campus');}if(u.order==='attack'&&!g.units.some(e=>e.id===u.target&&e.hp>0&&local(u,e))){u.order=u.resumeOrder==='capture'?'capture':u.server!==u.faction?'siege':'guard';u.target=null;travel(u,u.order==='capture'?'grid':'campus');}if(u.order==='attack'){const enemy=g.units.find(e=>e.id===u.target&&local(u,e)&&e.hp>0);if(enemy&&!u.path.length&&distance(u,enemy)>type.range)travel(u,enemy);}move(u,dt,(u.role==='model'?1+(techBonuses(g,u.faction).modelSpeed||0):1)*(u.team==='player'?energy*(u.role==='model'?thermal:1):1)*((u.boostUntil||0)>g.time&&u.faction==='broke'?1.25:1));
   if(u.order==='sabotage'&&u.target&&distance(u,point(u.target,u.server))<125&&u.cooldown===0){const p=point(u.target,u.server),damage=attackPower(g,u,'facility:'+u.target,type.dps)*(u.team==='player'?throughput:(op?.enemyThroughput??1));damageFacility(g,u.server,u.target,damage);u.cooldown=(u.suppressedUntil||0)>g.time?1.6:1;u.shot=.35;u.aim=Math.atan2(p.y-u.y,p.x-u.x);g.effects.push({server:u.server,x:u.x,y:u.y,tx:p.x,ty:p.y,kind:'facility',site:u.target,sourceId:u.id,role:u.role,color:FACTIONS[u.faction].color,life:.3,max:.3});}
   if(u.order==='siege'&&!(u.team==='player'&&g.tutorial?.endpointLocked)&&u.server!==u.faction&&type.dps&&distance(u,point('campus',u.server))<125&&u.cooldown===0){let damage=attackPower(g,u,'endpoint:'+u.server,type.dps)*(u.team==='player'?throughput*(1+g.servers[g.faction].validation/500):.3*(op?.enemyThroughput??1)*(1+g.servers[u.faction].validation/500));if(op&&u.team==='player')damage*=op.relay.captured?.9:.35;if(op&&u.team==='player'&&boost&&g.faction==='broke')damage*=1.35;if(u.role==='model')damage*=1+(techBonuses(g,u.faction).siege||0);if(u.role==='agent'||u.role==='malware')damage*=1.25;g.servers[u.server].integrity=Math.max(0,g.servers[u.server].integrity-damage);u.cooldown=(u.suppressedUntil||0)>g.time?1.6:1;u.shot=.35;const p=point('campus',u.server);u.aim=Math.atan2(p.y-u.y,p.x-u.x);g.effects.push({server:u.server,x:u.x,y:u.y,tx:p.x,ty:p.y,kind:'siege',sourceId:u.id,role:u.role,color:FACTIONS[u.faction].color,life:.3,max:.3});}}
  if(u.role==='researcher'){for(const friend of g.units.filter(f=>f.hp>0&&local(f,u)&&f.team===u.team&&distance(f,u)<100))friend.hp=Math.min(friend.maxHp,friend.hp+dt*((u.faction==='misanthropic'?4:2.5)+(u.team==='player'?(op?.upgrades.containment||0):0)+(techBonuses(g,u.faction).repair||0)));if(distance(u,point('lab',u.server))<95){g.servers[u.server].validation=Math.min(100,g.servers[u.server].validation+dt*(u.faction==='broke'?.65:.5)*(1+(u.team==='player'?(op?.upgrades.research||0)*.35:0)+(techBonuses(g,u.faction).validation||0)));if(u.team==='player')g.quality=Math.min(100,g.quality+dt*.08);}}
  if(u.order==='harvest'&&!u.path.length&&u.server===u.faction){const b=techBonuses(g,u.faction),own=u.team==='player';u.work+=dt;if(u.node==='grid'&&u.work>=kit(u.faction).chargeSeconds){u.cargo=kit(u.faction).harvestEnergy+(b.harvestEnergy||0);u.work=0;travel(u,'campus');}if(u.node==='campus'&&u.cargo){const credit=kit(u.faction).harvestFunds+(b.harvestFunds||0);if(own){g.energy=Math.min(160,g.energy+u.cargo);g.funds+=credit;g.stats.deliveries++;log(g,`Home battery delivered. +${u.cargo} energy / +${credit} funds.`);}else if(op){op.enemyEnergy=Math.min(160,(op.enemyEnergy??100)+u.cargo);op.enemyFunds+=credit;if(op.enemyAI)op.enemyAI.deliveries++;}u.cargo=0;u.work=0;travel(u,'grid');}}
 }
 transfers(g,dt);separate(g);
 for(const u of g.units.filter(u=>u.hp<=0)){if(u.team!=='player'){g.stats.contained++;g.funds+=tech.bounty||0;}else if(op)op.enemyFunds+=techBonuses(g,op.rival).bounty||0;g.effects.push({server:u.server,x:u.x,y:u.y-20,color:FACTIONS[u.faction].color,life:.7,max:.7,burst:true});if(u.role==='researcher'&&u.team==='player'){u.server=g.faction;Object.assign(u,point('campus',g.faction));u.node='campus';u.arrival=null;u.hp=u.maxHp;u.locked=12;u.infected=0;u.path=[];u.order='hold';u.raid=null;u.transit=false;u.evacuations++;u.evacuatedUntil=g.time+12;log(g,'Researcher evacuated to home campus.');}}
 g.units=g.units.filter(u=>u.hp>0);g.effects=g.effects.filter(e=>(e.life-=dt)>0);g.campus=g.servers[g.faction].integrity;if(g.attackTarget)g.progress=Math.min(100,100*(1-g.servers[g.attackTarget].integrity/g.servers[g.attackTarget].maxIntegrity));
 const defeated=g.enemies.find(id=>g.servers[id].integrity<=0);if(g.campus<=0){g.result='defeat';log(g,defeated?'Both endpoints collapsed. Home survival was required.':'Home inference endpoint collapsed.');}else if(defeated){g.attackTarget=defeated;g.activeServer=defeated;g.result='victory';g.progress=100;log(g,'Rival server offline. Your home continent remains online.');}else if(g.time>=180&&!g.preview){g.result='timeout';log(g,'Raid window expired.');}
}
