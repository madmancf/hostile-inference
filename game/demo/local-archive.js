import {migrateTutorial,validTutorial} from './tutorial.js';
import {initEnemyAI,validEnemyAI} from './enemy-ai.js';
import {initInfrastructure,validInfrastructure} from './faction-tech.js';
import { unitType } from './faction-rules.js';
import { FACTIONS } from '../v2/world.js';
import { ROLES, SERVERS } from './engine.js';
import { OPERATION_VERSION, scoreOperation } from './operation.js';

const SAVE_KEY = 'hostile-inference.local-save.v1';
const HISTORY_KEY = 'hostile-inference.local-results.v1';
const SETTINGS_KEY = 'hostile-inference.local-settings.v1';
const SAVE_VERSION = 1;
const MAX_BYTES = 600_000;
const finite = value => typeof value === 'number' && Number.isFinite(value);

// Archive writes are isolated from play: unavailable storage never stops a match.
export class LocalArchive {
  constructor(storage) { this.storage = storage; this.error = null; }
  read(key) {
    try {
      const text = this.storage.getItem(key);
      if (!text) return null;
      if (text.length > MAX_BYTES) throw new Error('Local archive is too large.');
      return JSON.parse(text);
    } catch (error) { this.error = error.message; return null; }
  }
  write(key, value) {
    try { this.storage.setItem(key, JSON.stringify(value)); this.error = null; return true; }
    catch (error) { this.error = error.message; return false; }
  }
  clearSave() {
    try { this.storage.removeItem(SAVE_KEY); return true; }
    catch (error) { this.error = error.message; return false; }
  }
  save(game, meta = {}) {
    if (game.result || game.preview && !game.operation && !game.tutorial) return false;
    const copy = structuredClone(game);
    copy.effects = [];
    copy.paused = true;
    // JSON represents Infinity as null. Only this deliberate timer is restored.
    if (copy.nextWave === Infinity) copy.nextWave = null;
    const record = { version: SAVE_VERSION, savedAt: Date.now(), game: copy, meta: { camera: meta.camera || null, selected: meta.selected || [], runId: meta.runId || null } };
    if (!validSave(record)) { this.error = 'This running state cannot be saved safely.'; return false; }
    return this.write(SAVE_KEY, record);
  }
  load() {
    const record = this.read(SAVE_KEY);
    if (!record) return null;
    if (!validSave(record)) { this.error = 'The saved operation is incompatible or damaged. Start a new mission.'; return null; }
    if (record.game.nextWave === null) record.game.nextWave = Infinity;
    // v0.8 saves keep their orders, queue, damage fraction and elapsed time.
    // Apply new maximum HP once; never heal an injured unit during migration.
    if(!record.game.rulesVersion){
      for(const u of record.game.units){const hp=unitType(u.faction,u.role).hp;u.hp=hp*u.hp/u.maxHp;u.maxHp=hp;}
      record.game.rulesVersion=2;
    }
    initInfrastructure(record.game);migrateTutorial(record.game);if(record.game.operation)initEnemyAI(record.game);record.game.effects=[];
    record.game.paused = true;
    return record;
  }
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
  if(!record.meta||!Array.isArray(record.meta.selected)||record.meta.selected.length>64||record.meta.selected.some(id=>!Number.isInteger(id))||record.meta.runId!==null&&typeof record.meta.runId!=='string')return false;
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
