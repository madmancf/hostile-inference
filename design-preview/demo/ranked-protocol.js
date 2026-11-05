// Shared, renderer-free command contract. A tick is a completed 50 ms step;
// actions at tick N are applied in recorded order before step N + 1.
import {createOperation,tickOperation,scoreOperation,activateEconomy,activateDoctrine,captureRelay} from './operation.js';
import {deploy,cancelDeployment,command,ability,holdPosition,launchRaid,returnHome,SERVERS,ROLES,WORLD} from './engine.js';
import {startProject,repairFacility,cancelProject,nodeInfo} from './faction-tech.js';

export const PROTOCOL=1, STEP=.05, MAX_TICKS=18000, MAX_ACTIONS=10000, MAX_BATCH_ACTIONS=256;
export const FACTION_IDS=['misanthropic','closed','broke'];
const shapes={economy:[],deploy:['role'],cancelDeployment:['index'],order:['ids','kind','target'],ability:['ids'],hold:['ids'],raid:['ids','target'],return:['ids','source'],capture:['ids'],project:['id'],repair:['site'],cancelProject:[],doctrine:[]};
export function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Unexpected or missing fields');
}
export function integer(n,min,max){if(!Number.isInteger(n)||n<min||n>max)throw Error('Integer out of range');return n;}
export function validateConfig(c){exact(c,['faction','rival','difficulty']);if(!FACTION_IDS.includes(c.faction)||!FACTION_IDS.includes(c.rival)||c.faction===c.rival||c.difficulty!=='standard')throw Error('Unknown standard matchup');return c;}
export function validateAction(a){
 if(!a||!Object.hasOwn(shapes,a.type))throw Error('Unknown action');exact(a,['type',...shapes[a.type]]);
 if('ids'in a){if(!Array.isArray(a.ids)||a.ids.length>24||new Set(a.ids).size!==a.ids.length)throw Error('Invalid unit selection');a.ids.forEach(id=>integer(id,1,100000));}
 if(a.type==='deploy'&&!ROLES.some(r=>r.key===a.role))throw Error('Unknown role');
 if(a.type==='cancelDeployment')integer(a.index,0,3);
 if(a.type==='order'){
  if(!['move','attack','sabotage','harvest','cool','research','siege','capture'].includes(a.kind))throw Error('Unknown order');
  if(a.kind==='attack')integer(a.target,1,100000);
  else if(a.kind==='move'&&typeof a.target==='object'){exact(a.target,['x','y']);if(!Number.isFinite(a.target.x)||!Number.isFinite(a.target.y)||a.target.x<0||a.target.x>WORLD.width||a.target.y<0||a.target.y>WORLD.height)throw Error('Point outside world');}
  else if(typeof a.target!=='string'||!Object.hasOwn(SERVERS.misanthropic.nodes,a.target))throw Error('Unknown site');
  const targets={sabotage:['facility1','facility2','facility3'],harvest:['grid'],cool:['intake'],research:['lab'],siege:['campus'],capture:['grid']};
  if(targets[a.kind]&&!targets[a.kind].includes(a.target))throw Error('Order/site mismatch');
 }
 if(a.type==='raid'&&!FACTION_IDS.includes(a.target)||a.type==='return'&&!FACTION_IDS.includes(a.source))throw Error('Unknown continent');
 if(a.type==='project'&&(typeof a.id!=='string'||a.id.length>64))throw Error('Invalid project');
 if(a.type==='repair'&&!['facility1','facility2','facility3'].includes(a.site))throw Error('Unknown facility');
 return a;
}
export function applyAction(g,a){
 validateAction(a);if(g.result||g.paused)throw Error('Commands require an active operation');
 if(a.ids?.some(id=>{const u=g.units.find(u=>u.id===id);return u&&u.team!=='player';}))throw Error('Cannot command rival units');
 switch(a.type){
  case 'economy':return activateEconomy(g);
  case 'deploy':return deploy(g,a.role);
  case 'cancelDeployment':return cancelDeployment(g,a.index);
  case 'order':return a.kind==='capture'?Number(captureRelay(g,a.ids).ok):command(g,a.ids,a.kind,a.target);
  case 'ability':return ability(g,a.ids);
  case 'hold':return holdPosition(g,a.ids);
  case 'raid':return launchRaid(g,a.target,a.ids);
  case 'return':{if(!g.visited.includes(a.source))throw Error('Continent not visited');const previous=g.activeServer;g.activeServer=a.source;try{return returnHome(g,a.ids);}finally{g.activeServer=previous;}}
  case 'capture':return captureRelay(g,a.ids);
  case 'project':if(!nodeInfo(g.faction,a.id))throw Error('Unknown faction project');return startProject(g,a.id);
  case 'repair':return repairFacility(g,a.site);
  case 'cancelProject':return cancelProject(g);
  case 'doctrine':return activateDoctrine(g);
 }
}
export const createRankedGame=config=>{validateConfig(config);return createOperation(config.faction,config.rival,'standard');};
// Visual/UI fields never affect the verifier. Keep movement, combat and AI state.
const omit=new Set(['effects','events','activeServer','visited','heading','aim','shot','hit','animDistance','hitUntil']);
export function canonical(value,gameplay=false){
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*1e6)/1e6:null;
 if(Array.isArray(value))return value.map(v=>canonical(v,gameplay));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined&&(!gameplay||!omit.has(k))).map(k=>[k,canonical(value[k],gameplay)]));
 return value;
}
export const canonicalState=g=>JSON.stringify(canonical(g,true));
export async function stateDigest(g){const data=new TextEncoder().encode(canonicalState(g));return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function replay(config,actions,throughTick=MAX_TICKS){
 integer(throughTick,0,MAX_TICKS);if(actions.length>MAX_ACTIONS)throw Error('Command limit');const g=createRankedGame(config);let index=0,tick=0,previous=-1;
 for(const item of actions){exact(item,['tick','action']);integer(item.tick,0,MAX_TICKS-1);if(item.tick<previous)throw Error('Commands out of order');previous=item.tick;validateAction(item.action);}
 while(tick<throughTick&&!g.result){while(index<actions.length&&actions[index].tick===tick)applyAction(g,actions[index++].action);tickOperation(g,STEP);tick++;}
 if(index<actions.length&&actions[index].tick<throughTick)throw Error('Commands after terminal state');
 return {game:g,tick,consumed:index,score:scoreOperation(g)};
}
