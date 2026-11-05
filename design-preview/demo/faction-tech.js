import {BUILDING_TREES,tree,branchAt,nodeInfo,facilitySite} from './building-catalog.js';
import {serverPoint} from '../servers/territories.js';
export {tree,branchAt,nodeInfo,facilitySite};
const EMPTY=Object.freeze({}),cache=new WeakMap();
const tell=(g,text)=>{g.events.unshift({time:g.time,text});g.events.length=Math.min(8,g.events.length);};
export function initInfrastructure(g){
 g.infrastructure??={};
 for(const faction of Object.keys(BUILDING_TREES))g.infrastructure[faction]??={revision:0,buildings:Object.fromEntries(tree(faction).branches.map((b,i)=>[facilitySite(i),{built:false,hp:0,maxHp:b.hp,hitUntil:0}])),completed:[],specialization:null,project:null};
 return g.infrastructure;
}
export function techBonuses(g,faction=g.faction){
 const state=g.infrastructure?.[faction];if(!state)return EMPTY;
 const prior=cache.get(state);if(prior?.revision===state.revision)return prior.bonus;
 const bonus={};const add=b=>{for(const [key,value]of Object.entries(b))bonus[key]=(bonus[key]||0)+value;};
 for(const [i,b]of tree(faction).branches.entries())if(state.buildings[facilitySite(i)].hp>0){add(b.bonus);for(const r of b.research)if(state.completed.includes(r.id))add(r.bonus);}
 cache.set(state,{revision:state.revision,bonus});return bonus;
}
export const techCost=(g,faction,role,base)=>Math.max(1,base-(role==='malware'?(techBonuses(g,faction).malwareDiscount||0):0));
export const techCompute=(g,faction,role,base)=>Math.max(0,base+(role==='model'?(techBonuses(g,faction).modelCompute||0):0));
export const heatThreshold=(g,faction=g.faction)=>70+(techBonuses(g,faction).heatThreshold||0);
function wallet(g,faction){return faction===g.faction?g.funds:g.operation?.rival===faction?g.operation.enemyFunds:0;}
function pay(g,faction,amount){if(faction===g.faction)g.funds-=amount;else g.operation.enemyFunds-=amount;}
export function projectProblem(g,id,faction=g.faction){
 const state=g.infrastructure?.[faction],node=nodeInfo(faction,id);
 if(!state||!node||!g.operation&&!g.tutorial)return 'Start an operation or guided mission first.';
 if(g.paused||g.result)return 'Resume an active mission first.';
 if(state.project)return 'Finish or cancel the current campus project.';
 const building=state.buildings[node.site];
 if(node.type==='build'&&building.hp>0)return 'This facility is already online.';
 if(node.type==='research'){
  if(state.completed.includes(id))return 'Research completed.';
  if(building.hp<=0)return `Build or restore ${node.branch.name} first.`;
  if(node.tier===3){
   if(state.specialization&&state.specialization!==id)return 'Another final specialization was chosen for this mission.';
   if(!state.completed.includes(node.branch.research[0].id))return `Requires ${node.branch.research[0].name}.`;
   if(Object.values(state.buildings).filter(b=>b.hp>0).length<2)return 'Requires two online facilities.';
  }
 }
 const cost=node.type==='build'&&building.built?Math.ceil(node.cost*.65):node.cost;
 return wallet(g,faction)<cost?`Requires ${cost} funds.`:null;
}
export function startProject(g,id,faction=g.faction){
 const reason=projectProblem(g,id,faction);if(reason)return {ok:false,reason};
 const n=nodeInfo(faction,id),s=g.infrastructure[faction],restoring=n.type==='build'&&s.buildings[n.site].built,cost=restoring?Math.ceil(n.cost*.65):n.cost;
 pay(g,faction,cost);s.project={id,type:n.type,site:n.site,cost,total:n.seconds,remaining:n.seconds};s.revision++;
 tell(g,`${faction===g.faction?'HOME':'RIVAL'} — ${restoring?'Rebuilding ':''}${n.name} started.`);return {ok:true};
}
export function repairFacility(g,site,faction=g.faction){
 const s=g.infrastructure?.[faction],b=s?.buildings[site],def=branchAt(faction,site);
 if(!b||!def||g.paused||g.result||s.project)return {ok:false,reason:'Finish the current project or resume play first.'};
 if(b.hp<=0)return startProject(g,def.id,faction);
 if(b.hp>=b.maxHp)return {ok:false,reason:'This facility is at full integrity.'};
 const fraction=1-b.hp/b.maxHp,cost=Math.max(40,Math.ceil(def.cost*fraction*.5)),seconds=Math.max(6,def.seconds*fraction);
 if(wallet(g,faction)<cost)return {ok:false,reason:`Repairs require ${cost} funds.`};
 pay(g,faction,cost);s.project={id:def.id,type:'repair',site,cost,total:seconds,remaining:seconds};s.revision++;return {ok:true};
}
export function cancelProject(g,faction=g.faction){
 const s=g.infrastructure?.[faction],p=s?.project;if(!p||g.paused||g.result)return false;
 pay(g,faction,-p.cost*p.remaining/p.total);s.project=null;s.revision++;return true;
}
export function researchStaffed(g,faction){
 const p=serverPoint('lab',faction);return g.units.some(u=>u.hp>0&&u.faction===faction&&u.server===faction&&!u.transit&&!u.locked&&u.role==='researcher'&&(faction!==g.faction||u.order==='research')&&Math.hypot(u.x-p.x,u.y-p.y)<95);
}
export function projectWait(g,faction=g.faction){
 const s=g.infrastructure?.[faction],p=s?.project;if(!p||p.type!=='research')return null;
 if(s.buildings[p.site].hp<=0)return 'Facility offline. Cancel this project, then rebuild.';
 if(!researchStaffed(g,faction))return 'Waiting for an active researcher at the lab.';
 if(nodeInfo(faction,p.id).tier===3&&Object.values(s.buildings).filter(b=>b.hp>0).length<2)return 'Requires two online facilities. Cancel to rebuild the lost facility.';
 return null;
}
export function tickInfrastructure(g,dt){
 if(!g.infrastructure||g.result||g.paused)return;
 for(const faction of [g.faction,...(g.operation?[g.operation.rival]:[])]){
  const s=g.infrastructure[faction],p=s.project;if(!p)continue;
  if(projectWait(g,faction))continue;
  const thermal=faction===g.faction?g.heat:(g.operation.enemyHeat||30),factor=((faction===g.faction?g.energy:(g.operation.enemyEnergy??100))<10?.4:1)*(thermal>heatThreshold(g,faction)?.6:1);
  p.remaining=Math.max(0,p.remaining-dt*factor);if(p.remaining>1e-8)continue;
  const node=nodeInfo(faction,p.id),b=s.buildings[p.site];
  if(p.type==='research'){s.completed.push(p.id);if(node.tier===3)s.specialization=p.id;}
  else{b.built=true;b.hp=b.maxHp;}
  s.project=null;s.revision++;tell(g,`${faction===g.faction?'HOME':'RIVAL'} — ${node.name}${p.type==='research'?' research complete':' online'}.`);
  g.effects.push({server:faction,...serverPoint(p.site,faction),color:faction==='misanthropic'?'#d8815f':faction==='closed'?'#4eac93':'#8bbfc9',life:1,max:1,ring:true});
 }
}
export function damageFacility(g,faction,site,damage){
 const s=g.infrastructure?.[faction],b=s?.buildings[site];if(!b||b.hp<=0||!Number.isFinite(damage)||damage<=0)return 0;
 const actual=Math.min(b.hp,damage);b.hp-=actual;b.hitUntil=g.time+3;
 if(b.hp<=0){if(s.project?.type==='repair'&&s.project.site===site){const p=s.project;pay(g,faction,-p.cost*p.remaining/p.total);s.project=null;}s.revision++;tell(g,`${branchAt(faction,site).name} OFFLINE — its benefits are disabled until rebuilt.`);g.effects.push({server:faction,...serverPoint(site,faction),color:'#dc795e',life:.8,max:.8,burst:true});}
 return actual;
}
// Paid opponents follow the same prerequisites, staffing and destruction rules.
export function directInfrastructure(g,faction=g.faction){
 const s=g.infrastructure?.[faction];if(!s||g.result||g.paused)return;if(s.project?.type==='research'&&(s.buildings[s.project.site].hp<=0||nodeInfo(faction,s.project.id).tier===3&&Object.values(s.buildings).filter(b=>b.hp>0).length<2))cancelProject(g,faction);if(s.project)return;
 const own=faction===g.faction;if(g.time<(own?12:185))return;
 const b=tree(faction).branches,chosen=0;
 const broken=Object.entries(s.buildings).find(([,v])=>v.built&&v.hp<=0);
 if(broken){startProject(g,branchAt(faction,broken[0]).id,faction);return;}
 const first=b[chosen],second=b[faction==='broke'?2:(chosen+1)%3],sequence=[first.id,first.research[0].id];
 if(g.time>180)sequence.push(second.id,first.research[1].id);
 const next=sequence.find(id=>{const n=nodeInfo(faction,id);return n.type==='build'?!s.buildings[n.site].built:!s.completed.includes(id);});
 if(!next)return;
 const cost=nodeInfo(faction,next).cost,reserve=g.time<60?0:own?80:0;
 if(wallet(g,faction)>=cost+reserve)startProject(g,next,faction);
}
export function validInfrastructure(g){
 if(g.infrastructure===undefined)return true;
 if(!g.infrastructure||typeof g.infrastructure!=='object')return false;
 for(const faction of Object.keys(BUILDING_TREES)){
  const s=g.infrastructure[faction];if(!s||!Number.isInteger(s.revision)||s.revision<0||!Array.isArray(s.completed)||s.completed.length>6||new Set(s.completed).size!==s.completed.length)return false;
  if(s.completed.some(id=>nodeInfo(faction,id)?.type!=='research'))return false;
  const finals=s.completed.filter(id=>nodeInfo(faction,id).tier===3);if(finals.length>1||s.specialization!==(finals[0]||null))return false;
  for(const [i,d]of tree(faction).branches.entries()){
   const b=s.buildings?.[facilitySite(i)];if(!b||typeof b.built!=='boolean'||!Number.isFinite(b.hp)||b.hp<0||b.hp>d.hp||b.maxHp!==d.hp||!Number.isFinite(b.hitUntil)||b.hitUntil<0||!b.built&&b.hp!==0)return false;
   if(d.research.some(r=>s.completed.includes(r.id))&&!b.built)return false;
   if(s.completed.includes(d.research[1].id)&&!s.completed.includes(d.research[0].id))return false;
  }
  const p=s.project;if(p){const n=nodeInfo(faction,p.id);if(p.type==='research'&&(s.completed.includes(p.id)||!s.buildings[p.site]?.built||n?.tier===3&&(s.specialization||!s.completed.includes(n.branch.research[0].id))))return false;if(!n||!['build','research','repair'].includes(p.type)||p.site!==n.site||p.type==='research'&&n.type!=='research'||p.type!=='research'&&n.type!=='build'||!Number.isFinite(p.cost)||p.cost<0||!Number.isFinite(p.total)||p.total<=0||!Number.isFinite(p.remaining)||p.remaining<0||p.remaining>p.total)return false;}
 }
 return true;
}
