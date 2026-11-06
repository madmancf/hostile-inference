import {migrateTutorial,validTutorial,TUTORIAL_ORDER} from './tutorial.js';
import {initEnemyAI,validEnemyAI} from './enemy-ai.js';
import {initInfrastructure,validInfrastructure} from './faction-tech.js';
import { unitType } from './faction-rules.js';
import { FACTIONS } from '../v2/world.js';
import { ROLES, SERVERS } from './engine.js';
import { OPERATION_VERSION, scoreOperation } from './operation.js';

export const SAVE_KEY = 'hostile-inference.local-save.v1';
export const TUTORIAL_SAVE_KEY='hostile-inference.tutorial-save.v3';
const HISTORY_KEY = 'hostile-inference.local-results.v1';
const SETTINGS_KEY = 'hostile-inference.local-settings.v1';
const SAVE_VERSION = 1;
export const MAX_SAVE_CHARACTERS = 600_000;
const finite = value => typeof value === 'number' && Number.isFinite(value);

const messages={
 HI_ACCOUNT_UNAVAILABLE:'Account service unavailable. Practice remains available.',HI_STANDINGS_UNAVAILABLE:'Current standings are unavailable; your verified result is unchanged.',HI_ORDER_BLOCKED:'The order needs a prerequisite. Follow the visible field instruction.',HI_ENCOUNTER_FAILED:'The encounter failed. Retry its named checkpoint.',HI_STORAGE_UNAVAILABLE:'Browser storage is unavailable. Continue this session or retry saving.',HI_SAVE_TOO_LARGE:'This save exceeds the local limit. Earlier saved progress is intact.',HI_SAVE_INVALID:'The save is damaged or incompatible. Earlier bytes are intact.',HI_SAVE_CHOICE:'Two saved missions are available. Choose which one to continue.',HI_SAVE_CHANGED:'Another session changed this save. Load the current mission or explicitly replace it.',HI_SAVE_BUSY:'Another tab owns tutorial saving. This session is unsaved.',HI_LOCK_UNAVAILABLE:'Safe saving is unavailable in this browser. Training can continue for this session.',HI_CHECKPOINT_PREPARE:'Recovery point could not be prepared. The encounter has not started.',HI_CHECKPOINT_INVALID:'This recovery point is invalid or belongs to another mission.',HI_CHECKPOINT_RESTORE:'Recovery failed. Your current mission is unchanged.',HI_MIGRATION_INVALID_STATE:'The old save could not be migrated safely. Original bytes are intact.',HI_TRANSITION:'The order could not finish safely. Pause and retry the current order.'
};
const clone=value=>structuredClone(value);
const checkpointNames=new Set(['Defend preparation','Defend contact','Sustain campus','Breach counter','Rival breach']);
const fingerprint=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return text.length+':'+(h>>>0).toString(16);};
function bounded(value){let nodes=0;const seen=new Set();const visit=(x,depth)=>{if(++nodes>60000||depth>16)return false;if(!x||typeof x!=='object')return typeof x!=='number'||Number.isFinite(x);if(seen.has(x))return false;seen.add(x);const ok=Object.entries(x).every(([k,v])=>!['__proto__','constructor','prototype','checkpoint','legacyOriginal'].includes(k)&&visit(v,depth+1));seen.delete(x);return ok;};return visit(value,0);}
function snapshot(game,meta={}){
 const copy=clone(game);copy.effects=[];copy.paused=true;if(copy.nextWave===Infinity)copy.nextWave=null;
 return {version:SAVE_VERSION,savedAt:Date.now(),game:copy,meta:{camera:meta.camera?clone(meta.camera):null,selected:[...(meta.selected||[])],runId:meta.runId||null}};
}
function validateRecord(r){return bounded(r)&&validSave(r);}
function validCheckpoint(c){return c&&c.version===1&&checkpointNames.has(c.id)&&TUTORIAL_ORDER.includes(c.objectiveId)&&typeof c.runId==='string'&&c.runId.length<=80&&c.faction===c.game?.faction&&c.rival===c.game?.tutorial?.rival&&c.objectiveId===c.game?.tutorial?.objectiveId&&!c.game?.operation&&c.game?.tutorial?.version===3&&validateRecord({version:1,savedAt:0,game:c.game,meta:c.meta});}
function validEnvelope(e){return e&&e.version===3&&['active','completed'].includes(e.kind)&&typeof e.runId==='string'&&e.runId.length<=80&&Number.isSafeInteger(e.revision)&&e.revision>=0&&(e.legacyOriginal===null||typeof e.legacyOriginal==='string'&&e.legacyOriginal.length<=MAX_SAVE_CHARACTERS)&&(e.legacyOriginal===null?e.legacyFingerprint===null:e.legacyFingerprint===fingerprint(e.legacyOriginal))&&(e.kind==='completed'||validateRecord(e.record)&&e.record.game.tutorial?.version===3&&e.record.meta.runId===e.runId)&&(!e.failure||e.failure.runId===e.runId&&e.failure.outcome==='defeat'&&TUTORIAL_ORDER.includes(e.failure.objectiveId))&&(!e.checkpoint||validCheckpoint(e.checkpoint)&&e.checkpoint.runId===e.runId);}

// One owner for serialization, recovery and version-isolated tutorial storage.
export class LocalArchive {
 constructor(storage){this.storage=storage;this.error=null;this.errorCode=null;this.diagnostics=[];this.checkpoint=null;this.legacyOriginal=null;this.expectedRevision=null;this.owned=typeof window==='undefined';this.releaseLock=null;this.prepareRetries=0;this.activeRunId=null;}
 fail(code,operation='archive',error=null){this.errorCode=code;this.error=messages[code]||messages.HI_TRANSITION;const entry={code,operation:String(operation).replace(/[^a-zA-Z.-]/g,'').slice(0,40),at:Date.now()};
  // No raw stack/message/cause survives. Unexpected failures expose only module/line hints.
  if(error?.stack)entry.trace=String(error.stack).split('\n').slice(1,6).map(x=>{const m=x.match(/([a-zA-Z0-9_-]+\.(?:m?js)):(\d+):/);return m?m[1]+':'+m[2]:'local function';});
  this.diagnostics.push(entry);this.diagnostics=this.diagnostics.slice(-20);return false;
 }
 clearError(){this.error=this.errorCode=null;}
 read(key){let text;try{text=this.storage.getItem(key);}catch{this.fail('HI_STORAGE_UNAVAILABLE','read');return null;}if(!text)return null;if(text.length>MAX_SAVE_CHARACTERS){this.fail('HI_SAVE_TOO_LARGE','read');return null;}try{return JSON.parse(text);}catch{this.fail('HI_SAVE_INVALID','read');return null;}}
 write(key,value){try{const text=JSON.stringify(value);if(text.length>MAX_SAVE_CHARACTERS)return this.fail('HI_SAVE_TOO_LARGE','write');this.storage.setItem(key,text);this.clearError();return true;}catch{return this.fail('HI_STORAGE_UNAVAILABLE','write');}}
 async claim(){if(this.owned)return true;if(this.claiming)return this.claiming;
  if(!globalThis.navigator?.locks){this.ownershipError='HI_LOCK_UNAVAILABLE';return this.fail(this.ownershipError,'claim');}
  this.claiming=new Promise(resolve=>{navigator.locks.request(TUTORIAL_SAVE_KEY,{ifAvailable:true},async lock=>{if(!lock){this.ownershipError='HI_SAVE_BUSY';resolve(this.fail(this.ownershipError,'claim'));return;}this.owned=true;this.ownershipError=null;resolve(true);await new Promise(done=>{this.releaseLock=done;});this.owned=false;}).catch(()=>resolve(this.fail('HI_LOCK_UNAVAILABLE','claim')));});
  const ok=await this.claiming;this.claiming=null;return ok;
 }
 release(){this.releaseLock?.();this.releaseLock=null;this.owned=typeof window==='undefined';}
 beginTutorial(runId,{replace=false}={}){this.clearError();const e=this.read(TUTORIAL_SAVE_KEY);if(this.error)return false;if(e&&!validEnvelope(e))return this.fail('HI_SAVE_INVALID','begin');if(e?.kind==='active'&&e.runId!==runId&&!replace)return this.fail('HI_SAVE_CHANGED','begin');this.expectedRevision=e?.revision??0;this.activeRunId=runId;this.replaceRunId=replace?e?.runId:null;this.checkpoint=null;this.prepareRetries=0;this.legacyOriginal=e?.legacyOriginal??null;return true;}
 writeTutorial(envelope){if(!this.owned)return this.fail(this.ownershipError||'HI_SAVE_BUSY','save');this.clearError();const current=this.read(TUTORIAL_SAVE_KEY);if(this.error)return false;if(current&&!validEnvelope(current))return this.fail('HI_SAVE_INVALID','save');if(current?.kind==='active'&&current.runId!==this.activeRunId&&current.runId!==this.replaceRunId)return this.fail('HI_SAVE_CHANGED','save');const revision=current?.revision??0;if(this.expectedRevision!==null&&revision!==this.expectedRevision)return this.fail('HI_SAVE_CHANGED','save');envelope.revision=revision+1;if(!validEnvelope(envelope))return this.fail('HI_SAVE_INVALID','save');if(!this.write(TUTORIAL_SAVE_KEY,envelope))return false;this.expectedRevision=envelope.revision;this.replaceRunId=null;return true;}
 clearSave(game=null){
  if(game?.tutorial?.version===3){const prior=this.read(TUTORIAL_SAVE_KEY);if(!validEnvelope(prior))return this.fail('HI_SAVE_INVALID','complete');if(prior.runId!==this.activeRunId)return this.fail('HI_SAVE_CHANGED','complete');return this.writeTutorial({...prior,kind:'completed',record:null,checkpoint:null});}
  try{this.storage.removeItem(SAVE_KEY);return true;}catch{return this.fail('HI_STORAGE_UNAVAILABLE','clear');}
 }
 markTrainingDefeat(game,runId){const e=this.read(TUTORIAL_SAVE_KEY);if(!validEnvelope(e)||e.runId!==runId||!game.tutorial||game.result!=='defeat')return this.fail('HI_SAVE_INVALID','defeat');return this.writeTutorial({...e,failure:{outcome:'defeat',runId,objectiveId:game.tutorial.objectiveId}});}
 save(game,meta={}){if(game.result||game.preview&&!game.operation&&!game.tutorial)return false;
  let record;try{record=snapshot(game,meta);if(!validateRecord(record))return this.fail('HI_SAVE_INVALID','save');}catch(e){return this.fail('HI_TRANSITION','save',e);}
  if(game.tutorial?.version!==3)return this.write(SAVE_KEY,record);
  const runId=meta.runId||this.activeRunId||'local-training';if(this.activeRunId===null)this.activeRunId=runId;record.meta.runId=runId;if(this.activeRunId!==runId)return this.fail('HI_SAVE_CHANGED','save');
  return this.writeTutorial({version:3,kind:'active',runId,revision:0,record,checkpoint:this.checkpoint,legacyOriginal:this.legacyOriginal,legacyFingerprint:this.legacyOriginal===null?null:fingerprint(this.legacyOriginal)});
 }
 savedChoices(){const out=[],e=this.read(TUTORIAL_SAVE_KEY),old=this.read(SAVE_KEY);if(e?.kind==='active'&&validEnvelope(e))out.push({source:'tutorial',record:e.record});if(old&&validateRecord(old)){let raw;try{raw=this.storage.getItem(SAVE_KEY);}catch{}if(!e||raw!==e.legacyOriginal)out.push({source:'legacy',record:old});}return out;}
 load(source='auto'){
  this.clearError();if(source==='auto'&&this.savedChoices().length>1){this.fail('HI_SAVE_CHOICE','load');return null;}let envelope=null,record=null,raw=null;
  let v3,old;try{v3=this.storage.getItem(TUTORIAL_SAVE_KEY);old=this.storage.getItem(SAVE_KEY);}catch{this.fail('HI_STORAGE_UNAVAILABLE','load');return null;}
  try{
   if(source!=='legacy'&&v3){envelope=this.read(TUTORIAL_SAVE_KEY);if(!validEnvelope(envelope)){this.fail('HI_SAVE_INVALID','load');return null;}if(envelope.kind==='active')record=clone(envelope.record);else if(old===envelope.legacyOriginal)return null;}
   if(!record){if(!old)return null;raw=old;record=this.read(SAVE_KEY);}
   if(!record)return null;if(!validateRecord(record)){this.fail('HI_SAVE_INVALID','load');return null;}
   const legacy=record.game.tutorial&&record.game.tutorial.version!==3;
   if(record.game.nextWave===null)record.game.nextWave=Infinity;
   if(!record.game.rulesVersion){for(const u of record.game.units){const hp=unitType(u.faction,u.role).hp;u.hp=hp*u.hp/u.maxHp;u.maxHp=hp;}record.game.rulesVersion=2;}
   initInfrastructure(record.game);migrateTutorial(record.game);if(record.game.operation)initEnemyAI(record.game);record.game.effects=[];record.game.paused=true;
   if(!validateRecord(snapshot(record.game,record.meta))){this.fail('HI_MIGRATION_INVALID_STATE','load');return null;}
   if(envelope?.failure)record.game.tutorial.failure='The campus went offline. Retry the named training checkpoint.';
   if(record.game.tutorial){this.activeRunId=record.meta.runId||'migrated-training';record.meta.runId=this.activeRunId;this.replaceRunId=source==='legacy'?this.read(TUTORIAL_SAVE_KEY)?.runId:null;this.checkpoint=envelope?.checkpoint?clone(envelope.checkpoint):null;this.legacyOriginal=legacy?raw:envelope?.legacyOriginal??null;this.expectedRevision=this.read(TUTORIAL_SAVE_KEY)?.revision??0;}
   return {...record,source:envelope?'tutorial':'legacy'};
  }catch(e){this.fail('HI_MIGRATION_INVALID_STATE','load',e);return null;}
 }
 prepareCheckpoint(game,meta,label){
  if(this.prepareRetries>=2)return this.fail('HI_CHECKPOINT_PREPARE','prepare');
  if(!game.tutorial||game.operation||game.result||game.tutorial.failure)return this.fail('HI_CHECKPOINT_INVALID','prepare');
  const needed=['researcher','harvester','cooler',...(label==='Defend preparation'||label==='Defend contact'||label==='Breach counter'?['model','firewall']:[]),...(label==='Breach counter'&&game.faction==='closed'?['agent']:[])];if(game.campus<=0||needed.some(role=>!game.units.some(u=>u.team==='player'&&u.role===role&&u.hp>0))||game.funds<60)return this.fail('HI_CHECKPOINT_INVALID','prepare');
  try{const r=snapshot(game,meta),c={version:1,id:String(label).slice(0,80),objectiveId:game.tutorial.objectiveId,runId:meta.runId,faction:game.faction,rival:game.tutorial.rival,game:r.game,meta:r.meta};
   if(!validCheckpoint(c))return this.fail('HI_CHECKPOINT_INVALID','prepare');const e={version:3,kind:'active',runId:c.runId,revision:0,record:r,checkpoint:c,legacyOriginal:this.legacyOriginal,legacyFingerprint:this.legacyOriginal===null?null:fingerprint(this.legacyOriginal)};if(JSON.stringify(e).length>MAX_SAVE_CHARACTERS)return this.fail('HI_SAVE_TOO_LARGE','prepare');
   this.checkpoint=c;this.prepareRetries=0;this.clearError();return true;
  }catch(e){this.prepareRetries++;return this.fail('HI_CHECKPOINT_PREPARE','prepare',e);}
 }
 restoreCheckpoint(game,runId){try{const c=this.checkpoint;if(!game.tutorial||game.operation||!validCheckpoint(c)||c.runId!==runId||c.faction!==game.faction||c.rival!==game.tutorial.rival){this.fail('HI_CHECKPOINT_INVALID','restore');return null;}const r=clone({game:c.game,meta:c.meta});if(r.game.nextWave===null)r.game.nextWave=Infinity;r.game.paused=true;r.game.tutorial.failure=null;migrateTutorial(r.game);if(!validateRecord(snapshot(r.game,r.meta))){this.fail('HI_CHECKPOINT_INVALID','restore');return null;}this.clearError();return r;}catch(e){this.fail('HI_CHECKPOINT_RESTORE','restore',e);return null;}}
  settings() {
    const saved = this.read(SETTINGS_KEY);
    return { callsign: typeof saved?.callsign === 'string' ? saved.callsign.slice(0, 24) : 'Commander', faction: FACTIONS[saved?.faction] ? saved.faction : 'misanthropic', sound: saved?.sound === true };
  }
  updateSettings(next) {
    const current = this.settings();
    return this.write(SETTINGS_KEY, { ...current, ...next, callsign: String(next.callsign ?? current.callsign).trim().slice(0, 24) || 'Commander', faction: FACTIONS[next.faction] ? next.faction : current.faction });
  }
  history() {
    const data = this.read(HISTORY_KEY);
    return Array.isArray(data) ? data.filter(validResult).slice(0, 100) : [];
  }
  record(game, runId, callsign) {
    const result = scoreOperation(game);
    if (!result || !runId) return null;
    const history = this.history(), prior = history.find(r => r.id === runId);
    if (prior) return prior;
    const record = { id: runId, at: Date.now(), callsign: String(callsign || 'Commander').slice(0, 24), faction: game.faction, rival: game.operation.rival, difficulty: game.difficulty, seconds: game.time, outcome: game.result, score: result.score, medal: result.medal, breakdown: result.breakdown, relay: game.operation.relay.captured };
    return this.write(HISTORY_KEY, [record, ...history].slice(0, 100)) ? record : null;
  }
  standings() {
    return this.history().filter(r => r.outcome === 'victory' && r.difficulty === 'standard').sort((a, b) => b.score - a.score || a.seconds - b.seconds || a.at - b.at).slice(0, 12);
  }
}

function validResult(r) {
  return r && typeof r.id === 'string' && typeof r.callsign === 'string' && FACTIONS[r.faction] && FACTIONS[r.rival] && r.faction !== r.rival && finite(r.score) && r.score >= 0 && r.score <= 10000 && finite(r.seconds) && r.seconds >= 0 && r.seconds <= 900 && finite(r.at) && ['victory', 'defeat', 'timeout'].includes(r.outcome);
}

function validSave(record) {
  const g = record?.game;
  if (record?.version !== SAVE_VERSION || !finite(record.savedAt) || !g || !FACTIONS[g.faction] || !SERVERS[g.activeServer] || g.result) return false;
  if (!['standard', 'relaxed'].includes(g.difficulty) || !Array.isArray(g.enemies) || g.enemies.some(id => !FACTIONS[id] || id === g.faction)) return false;
  if (!Array.isArray(g.visited) || !g.visited.includes(g.activeServer) || g.visited.some(id => !SERVERS[id])) return false;
  for (const key of ['time', 'nextId', 'nextRaid', 'funds', 'energy', 'heat', 'quality', 'progress', 'campus', 'capacity', 'used']) if (!finite(g[key]) || g[key] < 0) return false;
  if(!validInfrastructure(g))return false;
  if(g.rulesVersion!==undefined&&g.rulesVersion!==2)return false;
  if(g.priorityUntil!==undefined&&(!finite(g.priorityUntil)||g.priorityUntil<0))return false;
  if (g.nextWave !== null && !finite(g.nextWave)) return false;
  if (!Array.isArray(g.units) || g.units.length > 64 || !Array.isArray(g.queue) || g.queue.length > 4 || !Array.isArray(g.raids) || g.raids.length > 64 || !Array.isArray(g.events) || !g.stats) return false;
  if(record.meta?.camera&&(!['x','y','zoom'].every(k=>finite(record.meta.camera[k]))||record.meta.camera.zoom<=0))return false;
  if(!record.meta||!Array.isArray(record.meta.selected)||record.meta.selected.length>64||record.meta.selected.some(id=>!Number.isInteger(id))||record.meta.runId!==null&&(typeof record.meta.runId!=='string'||record.meta.runId.length>80))return false;
  for(const key of ['deployed','contained','deliveries','transfers'])if(!Number.isInteger(g.stats[key])||g.stats[key]<0)return false;
  if(g.events.length>8||g.events.some(e=>!e||!finite(e.time)||typeof e.text!=='string'||e.text.length>2000))return false;
  const ids = new Set();
  for (const u of g.units) {
    if (!Number.isInteger(u.id) || u.id <= 0 || ids.has(u.id) || !ROLES.some(r => r.key === u.role) || !FACTIONS[u.faction] || !SERVERS[u.server] || !['player', ...Object.keys(FACTIONS)].includes(u.team)) return false;
    ids.add(u.id);if(u.order==='sabotage'&&(!['facility1','facility2','facility3'].includes(u.target)||!SERVERS[u.server].nodes[u.target]))return false;
    if(!Number.isInteger(u.rank)||u.rank<0||typeof u.transit!=='boolean'||!['hold','guard','move','attack','sabotage','siege','transfer','capture','research','harvest','cool'].includes(u.order))return false;
    for (const key of ['x', 'y', 'hp', 'maxHp', 'locked', 'infected', 'cooldown', 'abilityCooldown', 'work', 'cargo', 'currentSpeed', 'heading', 'animDistance']) if (!finite(u[key])) return false;
    for(const key of ['evacuatedUntil','settled','focusStacks','boostUntil','recoveryUntil','armourUntil','suppressedUntil','markedUntil'])if(u[key]!==undefined&&(!finite(u[key])||u[key]<0))return false;
    if (u.hp <= 0 || u.maxHp <= 0 || u.hp > u.maxHp || !Array.isArray(u.path) || u.path.length > 100 || u.path.some(node => !SERVERS[u.server].nodes[node]) || !SERVERS[u.server].nodes[u.node] || u.arrival && !SERVERS[u.server].nodes[u.arrival]) return false;
  }
  if(!Number.isInteger(g.nextId)||g.nextId<=Math.max(0,...ids)||!Number.isInteger(g.nextRaid)||g.nextRaid<1)return false;
  for (const q of g.queue) if (!ROLES.some(r => r.key === q.role) || !finite(q.cost) || !finite(q.total) || !finite(q.remaining) || q.remaining < 0 || q.remaining > q.total || q.total <= 0) return false;
  for (const raid of g.raids) if (!SERVERS[raid.source] || !SERVERS[raid.target] || !Array.isArray(raid.ids) || !finite(raid.remaining) || !['staging', 'transit'].includes(raid.state)) return false;
  for (const id of Object.keys(FACTIONS)) for (const key of ['integrity', 'maxIntegrity', 'validation']) if (!finite(g.servers?.[id]?.[key]) || g.servers[id][key] < 0) return false;
  if (g.operation) {
    const op = g.operation;
    if(!validEnemyAI(op))return false;
    if (op.version !== OPERATION_VERSION || !FACTIONS[op.rival] || op.rival === g.faction || op.limit !== 900 || g.time > 900 || !op.relay || !SERVERS[op.rival].nodes[op.relay.node]) return false;
    for (const key of ['enemyFunds', 'nextAttack', 'nextGuard', 'attacks', 'boostUntil', 'doctrineReady', 'lost']) if (!finite(op[key]) || op[key] < 0) return false;
    for(const key of ['enemyHeat','nextTactic'])if(op[key]!==undefined&&(!finite(op[key])||op[key]<0))return false;
    for (const key of ['grid', 'research', 'containment', 'fabric']) if (!Number.isInteger(op.upgrades?.[key]) || op.upgrades[key] < 0 || op.upgrades[key] > 2) return false;
    if (!finite(op.relay.progress) || op.relay.progress < 0 || op.relay.progress > 30) return false;
    if (op.construction && (!['grid','research','containment','fabric'].includes(op.construction.kind) || !finite(op.construction.remaining) || !finite(op.construction.total) || !finite(op.construction.cost) || op.construction.remaining < 0 || op.construction.remaining > op.construction.total || op.construction.total <= 0)) return false;
  }
  if (!validTutorial(g)) return false;
  return !!(g.operation || g.tutorial);
}
