import { FACTIONS, UNITS } from '../v2/world.js';
import { SERVERS, SERVER_WORLD, serverPoint, serverNearest, serverRoute } from '../servers/territories.js';
import { ROLES } from '../servers/roles.js';
export { ROLES, SERVERS };
export const WORLD=SERVER_WORLD;
export const point=serverPoint,route=serverRoute,nearestNode=serverNearest;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const typeFor=u=>ROLES.find(r=>r.key===u.role);
const local=(a,b)=>!a.transit&&!b.transit&&a.server===b.server;
function log(g,text){g.events.unshift({time:g.time,text});g.events=g.events.slice(0,8);}
export function spawn(g,role,team='player',node,server){
 const type=ROLES.find(r=>r.key===role);if(!type)throw new Error('Unknown role');
 const faction=team==='player'?g.faction:FACTIONS[team]?team:g.enemies[0];
 server=server||faction;const origin=node||(type.domain==='sea'?'homeDock':'campus');
 const p=point(origin,server),rank=g.units.filter(u=>u.role===role&&u.team===team&&u.server===server).length;
 const u={id:g.nextId++,role,team,faction,server,rank,x:p.x+(g.nextId%3-1)*18,y:p.y+rank*15,hp:type.hp,maxHp:type.hp,path:[],node:origin,order:'hold',target:null,locked:0,infected:0,cooldown:0,abilityCooldown:0,work:0,cargo:0,arrival:null,raid:null,transit:false,evacuations:0,currentSpeed:0,heading:0,moving:false,animDistance:0};g.units.push(u);return u;
}
export function createGame(faction='misanthropic',difficulty='standard'){
 if(!FACTIONS[faction])throw new Error('Unknown faction');
 const g={faction,enemies:Object.keys(FACTIONS).filter(f=>f!==faction),difficulty:difficulty==='relaxed'?'relaxed':'standard',activeServer:faction,visited:[faction],servers:Object.fromEntries(Object.keys(SERVERS).map(id=>[id,{integrity:id===faction?1000:1300,maxIntegrity:id===faction?1000:1300,validation:0}])),raids:[],attackTarget:null,nextRaid:1,time:0,nextId:1,units:[],queue:[],funds:900,energy:100,heat:30,quality:100,progress:0,campus:1000,capacity:38,used:0,wave:0,nextWave:difficulty==='relaxed'?60:40,events:[],effects:[],result:null,stats:{deployed:0,contained:0,deliveries:0,transfers:0},paused:false};
 for(const role of ['researcher','harvester','model','firewall','agent','cooler'])spawn(g,role);
 for(const enemy of g.enemies){for(const role of ['firewall','agent','malware']){const u=spawn(g,role,enemy,'campus',enemy);u.order='guard';}spawn(g,'researcher',enemy,'lab',enemy);}
 log(g,`${FACTIONS[faction].name} home server online. Choose a rival server to attack.`);return g;
}
export function compute(g){const cloud=g.units.filter(u=>u.team==='player'&&u.server===g.faction&&!u.transit&&u.role==='cloud'&&distance(u,point('intake',u.server))<80).length;g.capacity=38+cloud*24;g.used=g.units.filter(u=>u.team==='player').reduce((n,u)=>n+typeFor(u).compute,0)+g.queue.reduce((n,q)=>n+ROLES.find(r=>r.key===q.role).compute,0);return {used:g.used,capacity:g.capacity};}
export function deploy(g,role){
 if(g.result)return {ok:false,reason:'The raid has ended.'};const type=ROLES.find(r=>r.key===role);if(!type)return {ok:false,reason:'Unknown unit.'};const cost=UNITS[g.faction][type.index].cost;compute(g);
 if(g.queue.length>=4)return {ok:false,reason:'Deployment queue full.'};if(g.funds<cost)return {ok:false,reason:'Insufficient funds. Keep home harvesters delivering.'};if(g.used+type.compute>g.capacity)return {ok:false,reason:'Compute full. Anchor a floating cloud at your home intake.'};
 g.funds-=cost;g.queue.push({role,cost,remaining:type.time,total:type.time});compute(g);log(g,`${UNITS[g.faction][type.index].name} queued at home.`);return {ok:true};
}
export function cancelDeployment(g,index){if(g.result||!g.queue[index])return false;const [q]=g.queue.splice(index,1);g.funds+=q.cost*q.remaining/q.total;compute(g);return true;}
function travel(u,destination){const type=typeFor(u),nodes=SERVERS[u.server].nodes,start=nearestNode(u,type.domain,u.server),end=typeof destination==='string'?destination:nearestNode(destination,type.domain,u.server);if(!nodes[end]||!SERVERS[u.server].edges[type.domain].flat().includes(end))return false;u.path=[start,...route(start,end,type.domain,u.server)];u.arrival=end;return true;}
export function command(g,ids,kind,target){
 if(g.result)return 0;let count=0;for(const u of g.units.filter(u=>u.team==='player'&&ids.includes(u.id)&&!u.transit)){
  const t=typeFor(u),previous={target:u.target,order:u.order,work:u.work,raid:u.raid};let destination=target;
  if(kind==='attack'){const enemy=g.units.find(e=>e.id===target&&e.team!=='player'&&local(u,e));if(!enemy||!t.dps)continue;destination=point(nearestNode(enemy,t.domain,u.server),u.server);u.target=enemy.id;}
  else if(kind==='harvest'){if(u.role!=='harvester'||u.server!==g.faction)continue;destination='grid';}
  else if(kind==='cool'){if(t.domain!=='sea'||u.server!==g.faction)continue;destination='intake';}
  else if(kind==='research'){if(u.role!=='researcher'||u.server!==g.faction)continue;destination='lab';}
  else if(kind==='siege'){if(!t.dps||u.server===g.faction)continue;destination='campus';}
  u.order=kind;u.target=kind==='attack'?target:null;u.work=0;u.raid=null;
  if(travel(u,destination))count++;else Object.assign(u,previous);
 }return count;
}
export function viewServer(g,id){if(!g.visited.includes(id))return false;g.activeServer=id;return true;}
function scheduleTransfer(g,ids,source,target,player=true){
 const army=g.units.filter(u=>ids.includes(u.id)&&u.server===source&&!u.transit&&!u.raid&&typeFor(u).domain==='land'&&typeFor(u).dps>0);
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
 if(g.result)return {ok:false,reason:'The raid has ended.'};const army=g.units.filter(u=>u.team==='player'&&ids.includes(u.id)&&!u.transit&&u.locked===0&&u.abilityCooldown===0&&['researcher','firewall','model','agent','malware'].includes(u.role));if(!army.length)return {ok:false,reason:'Select a ready field unit.'};if(g.funds<60)return {ok:false,reason:'Ability requires 60 funds.'};
 for(const u of army){for(const other of g.units.filter(e=>local(u,e)&&distance(u,e)<135)){if(other.team==='player'&&['researcher','firewall'].includes(u.role)){other.infected=0;other.locked=0;other.hp=Math.min(other.maxHp,other.hp+35);}else if(other.team!=='player'){if(u.role==='model'||u.role==='firewall')other.hp-=u.role==='model'?65:other.role==='malware'?100:30;if(u.role==='agent')other.locked=10;if(u.role==='malware')other.infected=18;}}if(u.role==='researcher')g.quality=Math.min(100,g.quality+18);u.abilityCooldown=22;g.effects.push({server:u.server,x:u.x,y:u.y,color:FACTIONS[g.faction].color,life:.6,max:.6,ring:true});}g.funds-=60;g.heat=Math.min(100,g.heat+2);return {ok:true};
}
function move(u,dt,factor){while(u.path.length&&distance(u,point(u.path[0],u.server))<.3)u.node=u.path.shift();const type=typeFor(u),oldX=u.x,oldY=u.y,maxSpeed=type.speed*factor;const stop=u.path.length?distance(u,point(u.path[u.path.length-1],u.server)):u.arrival?distance(u,point(u.arrival,u.server)):0;const wanted=u.path.length?Math.min(maxSpeed,Math.sqrt(Math.max(0,stop)*360)):0;u.currentSpeed+=(wanted-u.currentSpeed)*Math.min(1,dt*6);let budget=u.currentSpeed*dt;while(u.path.length&&budget>0){const p=point(u.path[0],u.server),d=distance(u,p);if(d<budget+.1){u.x=p.x;u.y=p.y;u.node=u.path.shift();budget-=d;}else{u.x+=(p.x-u.x)/d*budget;u.y+=(p.y-u.y)/d*budget;budget=0;}}
 if(!u.path.length&&u.arrival){const p=point(u.arrival,u.server),slots={researcher:[-40,20],model:[-32,-10],firewall:[35,20],agent:[-5,42],malware:[55,-12]},offset=slots[u.role]||[(u.id%3-1)*22,15],slot={x:p.x+offset[0]-(u.rank%2)*48,y:p.y+offset[1]-(u.rank%2)*35},d=distance(u,slot);if(d>1){const n=Math.min(type.speed*dt*factor,d);u.x+=(slot.x-u.x)/d*n;u.y+=(slot.y-u.y)/d*n;}}
 const moved=Math.hypot(u.x-oldX,u.y-oldY);u.moving=moved/dt>2;u.animDistance+=moved;if(u.moving){const angle=Math.atan2(u.y-oldY,u.x-oldX),delta=Math.atan2(Math.sin(angle-u.heading),Math.cos(angle-u.heading));u.heading+=delta*Math.min(1,dt*8);}
}
function transfers(g,dt){for(const raid of g.raids){const army=g.units.filter(u=>raid.ids.includes(u.id)&&u.raid===raid.id&&u.hp>0);if(!army.length){raid.state='done';continue;}if(raid.state==='staging'&&army.every(u=>u.path.length===0&&distance(u,point('gate',u.server))<110)){raid.state='transit';for(const u of army)u.transit=true;log(g,`${raid.player?'Your':'Rival'} checkpoint transfer in flight.`);}if(raid.state==='transit'){raid.remaining-=dt;if(raid.remaining<=0){for(const u of army){u.server=raid.target;u.transit=false;u.raid=null;u.currentSpeed=0;u.moving=false;const p=point('gate',u.server);u.x=p.x+(u.id%3-1)*22;u.y=p.y;u.node='gate';u.order=u.server===u.faction?'guard':'siege';travel(u,'campus');}const portal=point('gate',raid.target);g.effects.push({server:raid.target,x:portal.x,y:portal.y,color:'#80d9d7',life:1.1,max:1.1,ring:true});raid.state='done';if(raid.player){if(!g.visited.includes(raid.target))g.visited.push(raid.target);g.activeServer=raid.target;g.stats.transfers++;log(g,`Field team entered ${FACTIONS[raid.target].name}'s own server continent.`);}else log(g,`${FACTIONS[army[0].faction].name} breached your home uplink.`);}}}g.raids=g.raids.filter(r=>r.state!=='done');}
function wave(g){g.wave++;const enemy=g.enemies[g.wave%2];const raid=[];for(const role of g.wave%3===0?['model','malware']:['agent','malware']){const u=spawn(g,role,enemy,'campus',enemy);raid.push(u.id);}scheduleTransfer(g,raid,enemy,g.faction,false);for(const other of g.enemies){if(g.units.filter(u=>u.server===other&&!u.transit&&u.team===other&&typeFor(u).dps>0&&!u.raid).length<2){const guard=spawn(g,'firewall',other,'campus',other);guard.order='guard';}}log(g,`${FACTIONS[enemy].name} is staging a raid on your home server.`);g.nextWave+=g.difficulty==='relaxed'?50:35;}
export function tickGame(g,dt){
 if(g.paused||g.result||!Number.isFinite(dt)||dt<=0)return;if(dt>.1){let left=dt;while(left>.00001){const step=Math.min(.1,left);tickGame(g,step);left-=step;if(g.result)break;}return;}
 g.time+=dt;compute(g);const player=g.units.filter(u=>u.team==='player'),home=player.filter(u=>u.server===g.faction&&!u.transit),cooling=home.filter(u=>u.role==='cooler'&&distance(u,point('intake',u.server))<85).length,clouds=home.filter(u=>u.role==='cloud'&&distance(u,point('intake',u.server))<85).length;
 const energy=g.energy<10?.4:1,thermal=g.heat>70?Math.max(.35,1-(g.heat-70)/45):1,computeFactor=Math.min(1,g.capacity/Math.max(1,g.used)),throughput=energy*thermal*computeFactor;
 g.energy=Math.max(0,g.energy-dt*(.16+player.length*.018+player.filter(u=>u.role==='model').length*.07));g.funds+=dt*(g.faction==='closed'?5.6:5);g.heat=Math.max(10,Math.min(100,g.heat+dt*((.13+player.filter(u=>u.role==='model').length*.19)*(g.faction==='broke'?1.18:1)-cooling*.8-clouds*.12)));
 if(g.queue.length){g.queue[0].remaining=Math.max(0,g.queue[0].remaining-dt*throughput);if(g.queue[0].remaining===0){const q=g.queue.shift();spawn(g,q.role);g.stats.deployed++;log(g,`${UNITS[g.faction][ROLES.find(r=>r.key===q.role).index].name} deployed at home.`);}}
 if(g.time>=g.nextWave)wave(g);
 for(const u of g.units){u.locked=Math.max(0,u.locked-dt);u.infected=Math.max(0,u.infected-dt);u.cooldown=Math.max(0,u.cooldown-dt);u.abilityCooldown=Math.max(0,u.abilityCooldown-dt);if(u.transit)continue;
  const type=typeFor(u),shield=g.units.some(f=>local(u,f)&&f.team===u.team&&f.role==='firewall'&&f.locked===0&&distance(f,u)<120);
  if(shield){u.infected=Math.max(0,u.infected-dt*3);u.locked=Math.max(0,u.locked-dt*2);}if(u.infected>0){u.hp-=dt*2;if(u.team==='player')g.quality=Math.max(30,g.quality-dt*.2);}if(u.locked>0)continue;
  const candidates=g.units.filter(e=>local(u,e)&&e.team!==u.team&&(u.team==='player'||e.team==='player')&&e.hp>0&&typeFor(e).domain===type.domain&&distance(u,e)<type.range).sort((a,b)=>a.id===u.target?-1:b.id===u.target?1:distance(a,u)-distance(b,u)),target=type.dps?candidates[0]:null;
  if(target){if(u.cooldown===0){const protectedTarget=g.units.some(f=>local(f,target)&&f.team===target.team&&f.role==='firewall'&&f.locked===0&&distance(f,target)<120);let damage=type.dps*(u.role==='firewall'&&target.role==='malware'?2.8:1)*(u.team==='player'?throughput:1);if(u.faction==='broke'&&u.role==='model')damage*=1.15;if(target.faction==='misanthropic')damage*=.92;if(protectedTarget&&u.role==='malware')damage*=.4;target.hp-=damage;if(u.role==='malware'&&!protectedTarget)target.infected=Math.max(target.infected,9);if(u.role==='agent'&&target.role==='researcher'&&!protectedTarget)target.locked=5;u.cooldown=1;g.effects.push({server:u.server,x:u.x,y:u.y,tx:target.x,ty:target.y,color:FACTIONS[u.faction].color,life:.24,max:.24});}}
  else{if(u.order==='attack'){const enemy=g.units.find(e=>e.id===u.target&&local(u,e)&&e.hp>0);if(enemy&&!u.path.length&&distance(u,enemy)>type.range)travel(u,enemy);}move(u,dt,u.team==='player'?energy*(u.role==='model'?thermal:1):1);
   if(u.order==='siege'&&u.server!==u.faction&&type.dps&&distance(u,point('campus',u.server))<125&&u.cooldown===0){let damage=type.dps*(u.team==='player'?throughput*(1+g.servers[g.faction].validation/500):.3);if(u.role==='agent'||u.role==='malware')damage*=1.25;g.servers[u.server].integrity=Math.max(0,g.servers[u.server].integrity-damage);u.cooldown=1;const p=point('campus',u.server);g.effects.push({server:u.server,x:u.x,y:u.y,tx:p.x,ty:p.y,color:FACTIONS[u.faction].color,life:.3,max:.3});}}
  if(u.role==='researcher'){for(const friend of g.units.filter(f=>local(f,u)&&f.team===u.team&&distance(f,u)<100))friend.hp=Math.min(friend.maxHp,friend.hp+dt*2.5);if(distance(u,point('lab',u.server))<95){g.servers[u.server].validation=Math.min(100,g.servers[u.server].validation+dt*(u.faction==='broke'?.65:.5));if(u.team==='player')g.quality=Math.min(100,g.quality+dt*.08);}}
  if(u.order==='harvest'&&!u.path.length&&u.server===g.faction){u.work+=dt;if(u.node==='grid'&&u.work>=4){u.cargo=40;u.work=0;travel(u,'campus');}if(u.node==='campus'&&u.cargo){g.energy=Math.min(160,g.energy+u.cargo);g.funds+=g.faction==='closed'?134:120;u.cargo=0;u.work=0;g.stats.deliveries++;travel(u,'grid');log(g,'Home battery delivered. +40 energy / +120 funds.');}}
 }
 transfers(g,dt);
 for(const u of g.units.filter(u=>u.hp<=0)){if(u.team!=='player')g.stats.contained++;g.effects.push({server:u.server,x:u.x,y:u.y-20,color:FACTIONS[u.faction].color,life:.7,max:.7,burst:true});if(u.role==='researcher'&&u.team==='player'){u.server=g.faction;Object.assign(u,point('campus',g.faction));u.node='campus';u.arrival=null;u.hp=u.maxHp;u.locked=12;u.infected=0;u.path=[];u.order='hold';u.raid=null;u.transit=false;u.evacuations++;log(g,'Researcher evacuated to home campus.');}}
 g.units=g.units.filter(u=>u.hp>0);g.effects=g.effects.filter(e=>(e.life-=dt)>0);g.campus=g.servers[g.faction].integrity;if(g.attackTarget)g.progress=Math.min(100,100*(1-g.servers[g.attackTarget].integrity/g.servers[g.attackTarget].maxIntegrity));
 const defeated=g.enemies.find(id=>g.servers[id].integrity<=0);if(defeated){g.attackTarget=defeated;g.activeServer=defeated;g.result='victory';g.progress=100;log(g,'Rival server offline. Your home continent remains online.');}else if(g.campus<=0){g.result='defeat';log(g,'Home inference endpoint collapsed.');}else if(g.time>=180){g.result='timeout';log(g,'Raid window expired.');}
}
