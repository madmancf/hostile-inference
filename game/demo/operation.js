import {initEnemyAI,tickEnemyAI} from './enemy-ai.js';
import {initInfrastructure,directInfrastructure,techBonuses,heatThreshold,techCost} from './faction-tech.js';
import { kit, unitType, abilityProblem, castFactionAbility } from './faction-rules.js';
import { FACTIONS, UNITS } from '../v2/world.js';
import { createGame, tickGame, command, spawn, compute, point, distance, ROLES, deploy, launchRaid, ability } from './engine.js';

export const OPERATION_VERSION = 1;
export const UPGRADES = {
  grid: { name: 'Battery reserve', site: 'grid', cost: 350, seconds: 20, effect: '15% less energy use per level.' },
  research: { name: 'Validation pipeline', site: 'lab', cost: 420, seconds: 24, effect: '35% faster validation per level.' },
  containment: { name: 'Incident response', site: 'campus', cost: 400, seconds: 22, effect: 'Researchers repair faster; campus recovers slowly.' },
  fabric: { name: 'Compute annex', site: 'homeDock', cost: 650, seconds: 30, effect: '+16 compute per level, alongside offshore clouds.' }
};
export const DOCTRINES = {
  misanthropic: { name: 'Constitutional shelter', effect: 'Cleanse your team and reduce incoming unit damage by 35% for 20 seconds.' },
  closed: { name: 'Priority scheduling', effect: 'Double contract income and accelerate production by 40% for 20 seconds.' },
  broke: { name: 'Unfiltered release', effect: '35% more field damage for 20 seconds. Adds 12 heat immediately.' }
};

function event(g, text) {
  g.events.unshift({ time: g.time, text });
  g.events.length = Math.min(g.events.length, 8);
}

export function createOperation(faction = 'misanthropic', rival, difficulty = 'standard') {
  const g = createGame(faction, difficulty);
  rival ||= g.enemies[0];
  if (!g.enemies.includes(rival)) throw new Error('Choose a different rival laboratory.');
  g.enemies = [rival];
  g.units = g.units.filter(u => u.team === 'player' || u.faction === rival);
  g.preview = true; // The operation owns its 900-second ending and AI budget.
  g.nextWave = Infinity;
  g.funds = 1800;
  const home = g.servers[faction], enemy = g.servers[rival];
  home.integrity = home.maxIntegrity = 3200;
  enemy.integrity = enemy.maxIntegrity = difficulty === 'relaxed' ? 6000 : 8000;
  g.campus = home.integrity;
  g.operation = {
    version: OPERATION_VERSION, name: 'Blackout Protocol', rival, limit: 900,
    upgrades: { grid: 0, research: 0, containment: 0, fabric: 0 }, construction: null,
    relay: { node: 'grid', progress: 0, captured: false, contested: false },
    enemyFunds: 900, enemyHeat:30, nextTactic:0, nextAttack: difficulty === 'relaxed' ? 270 : 210, nextGuard: 105,
    attacks: 0, warningFor: null, boostUntil: 0, doctrineReady: 0,
    homeThreat: false, phase: 'establish', enteredRival: false, lost: 0, staffReturnAt: 0, productionPaused: true
  };
  event(g, 'BLACKOUT PROTOCOL — keep home online; raid the rival endpoint. Optional: secure its data relay.');
  initInfrastructure(g);
  // Each opponent starts with a small supplied garrison; all reinforcements are paid.
  for(const role of ['harvester','cooler','model'])spawn(g,role,rival,undefined,rival);
  initEnemyAI(g);compute(g);
  return g;
}

export function activateEconomy(g) {
  if (g.result || g.paused) return { ok: false, reason: 'Resume an active operation first.' };
  let count = 0;
  for (const [role, order, node] of [['researcher', 'research', 'lab'], ['harvester', 'harvest', 'grid'], ['cooler', 'cool', 'intake'], ['cloud', 'cool', 'intake']]) {
    count += command(g, g.units.filter(u => u.team === 'player' && u.server === g.faction && u.role === role).map(u => u.id), order, node);
  }
  return { ok: count > 0, reason: 'Deploy logistics units at home first.' };
}

export function upgradeBuilding(g, kind) {
  const op = g.operation, rule = Object.hasOwn(UPGRADES,kind)?UPGRADES[kind]:null;
  if (!op || !rule || g.result || g.paused) return { ok: false, reason: 'Choose an active home infrastructure project.' };
  if (op.construction) return { ok: false, reason: 'Finish or cancel the current infrastructure project.' };
  const level = op.upgrades[kind];
  if (level >= 2) return { ok: false, reason: 'This building is fully upgraded.' };
  const cost = rule.cost * (level + 1);
  if (g.funds < cost) return { ok: false, reason: 'Insufficient funds for this infrastructure upgrade.' };
  g.funds -= cost;
  op.construction = { kind, cost, remaining: rule.seconds, total: rule.seconds };
  event(g, `${rule.name} level ${level + 1} started at home.`);
  return { ok: true };
}

export function cancelUpgrade(g) {
  const project = g.operation?.construction;
  if (!project || g.result || g.paused) return false;
  g.funds += project.cost * project.remaining / project.total;
  g.operation.construction = null;
  event(g, 'Infrastructure project cancelled; unused work refunded.');
  return true;
}

export function activateDoctrine(g) {
  const op = g.operation;
  if (!op || g.result || g.paused) return { ok: false, reason: 'Resume an active operation first.' };
  if (g.time < op.doctrineReady) return { ok: false, reason: `Doctrine recharges in ${Math.ceil(op.doctrineReady - g.time)} seconds.` };
  if (g.funds < 150) return { ok: false, reason: 'Faction doctrine requires 150 funds.' };
  g.funds -= 150;
  op.boostUntil = g.time + 20;
  op.doctrineReady = g.time + 90;
  if (g.faction === 'broke') g.heat = Math.min(100, g.heat + 12);
  if (g.faction === 'misanthropic') for (const u of g.units.filter(u => u.team === 'player' && u.hp > 0)) {
    u.infected = u.locked = 0;
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .15);
  }
  const p = point('campus', g.faction);
  g.effects.push({ server: g.faction, ...p, color: FACTIONS[g.faction].color, life: 1, max: 1, ring: true });
  event(g, `${DOCTRINES[g.faction].name} active for 20 seconds.`);
  return { ok: true };
}

export function captureRelay(g, ids) {
  const op = g.operation;
  if (!op || g.result || g.paused || op.relay.captured) return { ok: false, reason: 'The relay is already secured or the operation is paused.' };
  const team = g.units.filter(u => ids.includes(u.id) && u.team === 'player' && u.server === op.rival && !u.transit && u.hp > 0 && ['agent', 'malware', 'firewall', 'model'].includes(u.role));
  if (!team.length) return { ok: false, reason: 'Select a combat unit on the rival continent first.' };
  const count = command(g, team.map(u => u.id), 'capture', op.relay.node);
  return { ok: count > 0, reason: 'No safe land route to the relay.' };
}

function updateRelay(g, dt) {
  const relay = g.operation.relay;
  if (relay.captured) return;
  const p = point(relay.node, g.operation.rival);
  const nearby = g.units.filter(u => u.hp > 0 && !u.transit && u.server === g.operation.rival && distance(u, p) < 105);
  const team = nearby.some(u => u.team === 'player' && u.locked === 0 && u.order === 'capture');
  relay.contested = nearby.some(u => u.team !== 'player' && ROLES.find(r => r.key === u.role).dps > 0);
  if (team && !relay.contested) relay.progress = Math.min(30, relay.progress + dt);
  else if (!team) relay.progress = Math.max(0, relay.progress - dt * .25);
  if (relay.progress >= 30) {
    relay.captured = true;
    g.funds += 350;
    event(g, 'DATA RELAY SECURED — +350 funds; rival endpoint shielding weakened. Rally back to its campus.');
    g.effects.push({ server: g.operation.rival, ...p, color: FACTIONS[g.faction].color, life: 1, max: 1, ring: true });
  }
}

export function tickOperation(g, dt) {
  if (!g.operation) { tickGame(g, dt); return; }
  if (g.paused || g.result || !Number.isFinite(dt) || dt <= 0) return;
  if (dt > .05 + 1e-8) {
    let remaining = dt;
    while (remaining > 1e-8 && !g.result) { const step = Math.min(.05, remaining); tickOperation(g, step); remaining -= step; }
    return;
  }
  dt = Math.min(dt, Math.max(0, g.operation.limit - g.time));
  if (dt <= 1e-8) { g.result = 'timeout'; event(g, 'Operation deadline reached. Both continents remain contested.'); return; }
  const before = g.units.filter(u => u.team === 'player' && u.role !== 'researcher').length;
  tickGame(g, dt);
  const op = g.operation;
  op.lost += Math.max(0, before - g.units.filter(u => u.team === 'player' && u.role !== 'researcher').length);
  if (g.result) return;
  tickEnemyAI(g, dt);
  updateRelay(g, dt);
  const project = op.construction;
  if (project) {
    const factor = g.energy < 10 ? .4 : g.heat > 70 ? .6 : 1;
    project.remaining = Math.max(0, project.remaining - dt * factor);
    if (project.remaining < 1e-8) {
      op.upgrades[project.kind]++;
      event(g, `${UPGRADES[project.kind].name} completed. Level ${op.upgrades[project.kind]}.`);
      op.construction = null;
      compute(g);
    }
  }
  const home = g.servers[g.faction];
  const staff = g.units.some(u => u.team === 'player' && u.role === 'researcher' && u.server === g.faction && u.hp > 0 && u.locked === 0 && u.order === 'research');
  if (staff && op.upgrades.containment && !g.units.some(u => u.team !== 'player' && u.server === g.faction && !u.transit)) {
    home.integrity = Math.min(home.maxIntegrity, home.integrity + dt * op.upgrades.containment * 1.5);
    g.campus = home.integrity;
  }
  op.homeThreat = g.units.some(u => u.team !== 'player' && u.server === g.faction && !u.transit && u.hp > 0);
  op.enteredRival ||= g.visited.includes(op.rival);
  op.phase = g.time >= 720 ? 'final' : op.homeThreat ? 'defend' : op.enteredRival ? 'raid' : g.time >= 120 ? 'stage' : 'establish';
  if (g.time >= op.limit - 1e-7) {
    g.time = op.limit;
    g.result = 'timeout';
    event(g, 'The fifteen-minute operation ended. Preserve your economy and commit to the endpoint earlier.');
  }
}

export function operationStatus(g) {
  const op = g.operation;
  if (!op) return null;
  if (op.homeThreat) return { title: 'Home intrusion', task: 'Inspect home and intercept the attackers. Your raid continues while you defend.', action: 'Inspect home' };
  if (!g.units.some(u => u.team === 'player' && u.role === 'harvester' && u.order === 'harvest')) return { title: 'Establish your economy', task: 'Start battery deliveries, research and cooling. Then choose what to deploy.', action: 'Activate home economy' };
  if (g.units.some(u=>u.team==='player'&&u.role==='researcher'&&u.locked>0))return {title:'Research lockout',task:'A locked researcher cannot produce units. Protect the lab and cleanse lockouts with a firewall pulse or your containment doctrine.',action:'Inspect home'};
  if (!g.units.some(u=>u.team==='player'&&u.role==='researcher'&&u.order==='research'&&u.locked===0))return {title:'Staff your research lab',task:'Production needs an active home researcher. Restart validation before committing to the raid.',action:'Activate home economy'};
  if (!op.enteredRival) return { title: 'Prepare the breach', task: 'Leave a firewall or model defending home. Transfer the selected combat team through the uplink.', action: 'Stage selected team' };
  if (!op.relay.captured) return { title: 'Choose your approach', task: 'Disable the endpoint directly, or secure the data relay to weaken its shielding and earn a bonus.', action: 'Show data relay' };
  return { title: 'Finish the operation', task: 'Relay secured. Rally your combat team at the rival campus and keep home online.', action: 'Rally at endpoint' };
}

export function scoreOperation(g) {
  if (!g.operation || !g.result) return null;
  const win = g.result === 'victory' && g.servers[g.faction].integrity > 0;
  const breakdown = {
    victory: win ? 6000 : 0,
    relay: win && g.operation.relay.captured ? 2000 : 0,
    survival: win ? Math.floor(1000 * Math.max(0, Math.min(1, g.campus / g.servers[g.faction].maxIntegrity))) : 0,
    speed: win ? Math.floor(1000 * Math.max(0, 1 - g.time / g.operation.limit)) : 0
  };
  const score = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
  return { score, breakdown, medal: !win ? 'Debrief' : score >= 9000 ? 'Gold' : score >= 7500 ? 'Silver' : 'Bronze' };
}

// A real-time demonstration policy: ordinary paid deployments and field orders,
// no extra money, accelerated clock, stronger units or tutorial allowances.
export function directOperation(g) {
  const op = g.operation;
  if (!op || g.result || g.paused) return;
  if (!op.director) {
    op.director = { nextDecision: 0, defender: g.units.find(u => u.team === 'player' && u.role === 'model')?.id, shield: g.units.find(u => u.team === 'player' && u.role === 'firewall')?.id };
    activateEconomy(g);
  }
  const policy = op.director;
  if (g.time < policy.nextDecision) return;
  policy.nextDecision = g.time + 1;
  directInfrastructure(g);
  const own = g.units.filter(u => u.team === 'player');
  for(const [key,role] of [['defender','model'],['shield','firewall']])if(!own.some(u=>u.id===policy[key]))policy[key]=own.find(u=>u.role===role&&u.server===g.faction&&!u.raid&&!u.transit)?.id;
  const count = role => own.filter(u => u.role === role).length + g.queue.filter(q => q.role === role).length;
  const k=kit(g.faction),capacity=compute(g);
  // Build a mixed force before replenishing losses; cheap raiders must not starve its models.
  if(g.faction==='broke'&&!own.some(u=>u.id===policy.secondDefender))policy.secondDefender=own.find(u=>u.role==='model'&&u.server===g.faction&&!u.raid&&!u.transit&&u.id!==policy.defender)?.id;
  const targets={...k.army,model:g.faction==='broke'?5:k.army.model,harvester:2,cooler:g.faction==='broke'&&g.heat>48?2:1};
  const priority=g.faction==='misanthropic'?['model','firewall','agent','malware','harvester']:g.faction==='closed'?['model','firewall','agent','malware','harvester']:['model','firewall','malware','agent','harvester'];
  const planned=count('cooler')<targets.cooler?'cooler':count('harvester')<2?'harvester':priority.filter(r=>count(r)<targets[r]).sort((a,b)=>count(a)/targets[a]-count(b)/targets[b])[0];
  const want=planned&&capacity.capacity-g.used<unitType(g.faction,planned).compute&&count('cloud')<2?'cloud':planned;
  const savingForSpecialization=g.time>180&&!g.infrastructure[g.faction].specialization&&own.filter(u=>u.role==='model').length>=3&&!op.homeThreat;
  if (want&&!savingForSpecialization&&(!op.homeThreat||g.funds>=unitType(g.faction,want).cost+60)) deploy(g, want);
  activateEconomy(g);
  const ids = own.filter(u => u.server === g.faction && !u.transit && !u.raid && ROLES.find(r => r.key === u.role).dps > 0 && ![policy.defender, policy.shield,policy.secondDefender].includes(u.id)).map(u => u.id);
  const hasRaid=own.some(u=>u.server===op.rival&&!u.transit&&u.role==='model');
  if (g.time > 100 && ids.length && (own.filter(u=>ids.includes(u.id)&&u.role==='model').length>=2&&ids.length>=4&&own.some(u=>ids.includes(u.id)&&u.role==='firewall')||hasRaid&&ids.length>=2)) launchRaid(g, op.rival, ids);
  if(hasRaid&&g.time%40<1&&ids.length>=2)launchRaid(g,op.rival,ids);
  const agent = own.find(u => u.role === 'agent' && u.server === op.rival && !u.transit && !u.raid);
  if (agent && !op.relay.captured && agent.order !== 'capture') captureRelay(g, [agent.id]);
  if (op.relay.captured && agent?.order === 'capture') command(g, [agent.id], 'siege', 'campus');
  if ((op.homeThreat||own.some(u=>u.server===op.rival)) && g.time >= op.doctrineReady) activateDoctrine(g);
  for(const u of own){
    if(op.homeThreat&&u.server===g.faction&&!u.raid&&!u.transit&&['model','firewall'].includes(u.role)){const intruder=g.units.filter(e=>e.team!=='player'&&e.hp>0&&!e.transit&&e.server===g.faction).sort((a,b)=>distance(a,u)-distance(b,u))[0];if(intruder&&u.target!==intruder.id)command(g,[u.id],'attack',intruder.id);}
    if(u.role==='model'&&u.server===op.rival&&!u.transit&&!u.raid){
      const threat=g.units.filter(e=>e.team!=='player'&&e.hp>0&&!e.transit&&(g.faction!=='misanthropic'||unitType(e.faction,e.role).dps>0)&&unitType(e.faction,e.role).domain==='land'&&e.server===u.server&&distance(e,u)<(g.faction==='misanthropic'?170:190)).sort((a,b)=>(a.role==='firewall'?-1:0)-(b.role==='firewall'?-1:0)||a.hp-b.hp)[0];
      if(threat&&u.target!==threat.id)command(g,[u.id],'attack',threat.id);
      else if(g.faction==='misanthropic'&&!threat&&u.order==='attack')command(g,[u.id],'siege','campus');
    }
    if(u.faction==='misanthropic'&&u.role==='firewall'&&u.server===op.rival&&u.order==='hold'&&!g.units.some(e=>e.team!=='player'&&e.hp>0&&e.server===u.server&&distance(e,u)<165))command(g,[u.id],'siege','campus');
    if(u.raid||abilityProblem(g,u)||g.funds<60)continue;
    const savingForUnit=want&&!g.queue.length&&g.funds<techCost(g,g.faction,want,unitType(g.faction,want).cost)+60;
    if(savingForUnit&&!(g.faction==='broke'&&u.role==='model')&&u.role!=='cooler'&&!(u.role==='firewall'&&u.hp<u.maxHp*.5))continue;
    const contact=g.units.some(e=>e.team!=='player'&&e.hp>0&&!e.transit&&unitType(e.faction,e.role).domain==='land'&&e.server===u.server&&distance(e,u)<125);
    if(u.role==='cooler'&&g.heat>55||!u.moving&&contact&&['model','agent','malware','firewall'].includes(u.role))ability(g,[u.id]);
  }
}
