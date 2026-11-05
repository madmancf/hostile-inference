import { kit, unitType } from '../game/demo/faction-rules.js';
import assert from 'node:assert/strict';
import { createGame, spawn, tickGame, deploy, launchRaid, command, compute, holdPosition, point, ROLES, ability } from '../game/demo/engine.js';
import { createOperation, activateEconomy, directOperation, tickOperation, captureRelay, activateDoctrine, upgradeBuilding, cancelUpgrade, scoreOperation } from '../game/demo/operation.js';
import { LocalArchive } from '../game/demo/local-archive.js';
import { FrameMonitor, FrameAttribution, FrameCadence } from '../game/demo/frame-monitor.js';
import { RenderProfiler } from '../game/servers/render-profiler.js';
import { unitCallouts, buildingHealth, placeBuildingHealth } from '../game/demo/battlefield-hud.js';
import { openingChecklist, suggestedRaid, operationGuide } from '../game/demo/opening-guide.js';
import * as T from '../game/vendor/three/three.module.js';
import { parkHiddenMatrices } from '../game/servers/visible-matrices.js';

const tests = [], check = (name, fn) => { fn(); tests.push(name); };
const factions = ['misanthropic', 'closed', 'broke'];
const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k), map }; };

check('Opening guidance follows real economy, production and selected-team transfer without spending or issuing orders',()=>{
 for(const faction of factions){
  const g=createOperation(faction),initial=JSON.stringify(g);
  assert.equal(operationGuide(g).action,'economy');assert.ok(openingChecklist(g).every(x=>!x.done));
  assert.equal(JSON.stringify(g),initial,'Guidance is read-only');
  activateEconomy(g);assert.ok(openingChecklist(g).every(x=>x.done));assert.equal(operationGuide(g).action,'deploy');
  const k=kit(faction);g.funds=5000;
  for(const [role,count] of k.openingPlan){
    while(g.units.filter(u=>u.team==='player'&&u.role===role).length+g.queue.filter(q=>q.role===role).length<count)assert.ok(deploy(g,role).ok);
    assert.equal(operationGuide(g).action,'queue');
    for(let i=0;i<1000&&g.units.filter(u=>u.team==='player'&&u.role===role).length<count;i++)tickOperation(g,.05);
  }
  assert.equal(operationGuide(g).action,'select');const ids=suggestedRaid(g),left=g.units.filter(u=>u.team==='player'&&!ids.includes(u.id));
  assert.ok(ids.length>=2);assert.ok(left.some(u=>u.role==='model'));assert.ok(left.some(u=>u.role==='firewall'));
  assert.equal(operationGuide(g,ids).action,'transfer');launchRaid(g,g.operation.rival,ids);assert.equal(operationGuide(g,ids).action,'watch');
  g.operation.homeThreat=true;assert.equal(operationGuide(g,ids).action,'defend','Home danger takes precedence over onboarding');
 }
});

check('A compute-blocked opening teaches cloud deployment, connection and resuming production',()=>{
 const g=createOperation('misanthropic');activateEconomy(g);spawn(g,'model');spawn(g,'malware');spawn(g,'harvester');compute(g);
 assert.equal(g.used,42);assert.equal(operationGuide(g).suggested,'cloud');assert.match(operationGuide(g).task,/42 of 44/);
 g.funds=2000;assert.ok(deploy(g,'cloud').ok);assert.equal(operationGuide(g).action,'queue');assert.match(operationGuide(g).title,/Offshore compute/);
 g.queue=[];const cloud=spawn(g,'cloud');compute(g);assert.equal(operationGuide(g).action,'economy');assert.match(operationGuide(g).title,/Connect/);
 Object.assign(cloud,point('intake',g.faction));compute(g);assert.equal(operationGuide(g).suggested,'firewall');assert.equal(operationGuide(g).action,'deploy');
});

check('Lost raids offer home rebuilding instead of a relay order with no surviving units',()=>{
 const g=createOperation();activateEconomy(g);g.operation.enteredRival=true;g.activeServer=g.operation.rival;
 assert.equal(operationGuide(g).action,'home');g.activeServer=g.faction;assert.equal(operationGuide(g).action,'deploy');
 const raider=spawn(g,'agent','player','gate',g.operation.rival);g.activeServer=g.operation.rival;
 assert.equal(operationGuide(g,[raider.id]).action,'relay');
});

check('UI invalidation cannot inject early active frames into the 60 Hz cadence',()=>{
 const c=new FrameCadence(60);let draws=0,previous=-Infinity,minimum=Infinity;
 for(let i=0;i<1200;i++){const now=i*1000/120,dirty=i%30===0;c.callback(now);if(c.due(now,true,dirty)){draws++;minimum=Math.min(minimum,now-previous);previous=now;c.drawn(now);}}
 assert.equal(draws,600);assert.ok(minimum>=1000/60-.001);
 assert.equal(c.due(previous+1,true,true),false,'continuous render remains paced even after UI changes');
 assert.equal(c.due(previous+1,false,true),true,'paused/menu interaction stays immediate');
 c.drawn(previous+5000);assert.ok(c.next>previous+5000&&c.next<=previous+5000+1000/60+.001,'long interruption resets phase without a catchup burst');
});
check('60 Hz callback jitter cannot halve render throughput',()=>{
 const c=new FrameCadence(60);let now=0,draws=0;
 for(let i=0;i<600;i++){now+=1000/60+(i%2?.8:-.8);c.callback(now);if(c.due(now,true,i%15===0)){draws++;c.drawn(now);}}
 assert.equal(draws,600,'every delivered callback at native 60 Hz must draw');
});

check('Killed attackers do not get a final same-tick shot', () => {
  const g = createGame(); g.units = []; g.nextWave = Infinity;
  const a = spawn(g, 'model'), b = spawn(g, 'agent', 'closed', 'campus', g.faction);
  Object.assign(b, { x: a.x + 10, y: a.y, hp: 1 });
  tickGame(g, .05);
  assert.equal(a.hp, a.maxHp); assert.equal(b.shot, 0); assert.ok(!g.units.includes(b));
});
check('Killed researchers cannot heal and killed firewalls cannot shield', () => {
  for (const role of ['researcher', 'firewall']) {
    const g = createGame(); g.units = []; g.nextWave = Infinity;
    const attacker = spawn(g, 'model'), dead = spawn(g, role, 'closed', 'campus', g.faction), friend = spawn(g, 'model', 'closed', 'campus', g.faction);
    Object.assign(dead, { x: attacker.x + 10, y: attacker.y, hp: 1 });
    Object.assign(friend, { x: attacker.x + 40, y: attacker.y, hp: 100 });
    if (role === 'firewall') { const worm = spawn(g, 'malware'); Object.assign(worm, { x: attacker.x + 20, y: attacker.y }); }
    tickGame(g, .05);
    assert.ok(!g.units.includes(dead));
    assert.equal(friend.hp, role === 'researcher' ? 100 : 92);
  }
});
check('Infection death stops work during the same tick', () => {
  const g = createGame(); g.units = []; g.nextWave = Infinity;
  const researcher = spawn(g, 'researcher'), model = spawn(g, 'model');
  Object.assign(researcher, { hp: .05, infected: 10, x: model.x, y: model.y }); model.hp = 100;
  tickGame(g, .05); assert.equal(model.hp, 100);
});
check('Mutual endpoint destruction is defeat and never claims home survived', () => {
  const g = createGame(); g.units = []; g.nextWave = Infinity;
  g.servers[g.faction].integrity = g.servers.closed.integrity = 1;
  for (const [team, server] of [['player', 'closed'], ['closed', g.faction]]) { const u = spawn(g, 'model', team, 'campus', server); Object.assign(u, point('campus', server)); u.order = 'siege'; }
  tickGame(g, .05); assert.equal(g.campus, 0); assert.equal(g.servers.closed.integrity, 0); assert.equal(g.result, 'defeat'); assert.match(g.events[0].text, /Both endpoints/);
});
check('Infrastructure reserves funds, refunds unused work, stops on pause and changes capacity', () => {
  const g = createOperation(); const before = g.funds;
  assert.equal(upgradeBuilding(g,'constructor').ok,false);assert.equal(g.funds,before);
  assert.ok(upgradeBuilding(g, 'fabric').ok); assert.equal(g.funds, before - 650); assert.equal(upgradeBuilding(g, 'grid').ok, false);
  g.paused = true; tickOperation(g, 20); assert.equal(g.operation.construction.remaining, 30);
  g.paused = false; tickOperation(g, 10); const funds = g.funds; assert.ok(cancelUpgrade(g)); assert.ok(Math.abs(g.funds - funds - 650 * 20 / 30) < .01);
  g.funds = 3000; upgradeBuilding(g, 'fabric'); tickOperation(g, 31); assert.equal(g.operation.upgrades.fabric, 1); assert.equal(compute(g).capacity, 60);
});
check('Faction doctrines have distinct effects and enforce their costs/cooldowns', () => {
  for (const faction of factions) {
    const g = createOperation(faction), u = g.units.find(u => u.team === 'player' && u.role === 'model'); u.hp -= 100; u.infected = 5;
    const funds = g.funds, heat = g.heat; assert.ok(activateDoctrine(g).ok); assert.equal(g.funds, funds - 150); assert.equal(activateDoctrine(g).ok, false);
    if (faction === 'misanthropic') { assert.ok(u.hp > u.maxHp - 100); assert.equal(u.infected, 0); }
    if (faction === 'broke') assert.equal(g.heat, heat + 12);
    if (faction === 'closed') { const money = g.funds; tickOperation(g, 1); assert.ok(Math.abs(g.funds - money - 10)<.01); }
  }
});
check('An infiltrating agent actually stops production; containment restores paid work', () => {
  const g = createOperation(); activateEconomy(g); deploy(g, 'model');
  const staff = g.units.find(u => u.team === 'player' && u.role === 'researcher'), firewall = g.units.find(u => u.team === 'player' && u.role === 'firewall');
  const enemy = spawn(g, 'agent', g.operation.rival, 'lab', g.faction); Object.assign(enemy, { x: staff.x + 10, y: staff.y });
  tickOperation(g, .05); assert.ok(staff.locked > 0); const remaining = g.queue[0].remaining;
  tickOperation(g, .5); assert.equal(g.queue[0].remaining, remaining); assert.equal(g.operation.productionPaused, true);
  Object.assign(firewall, { x: staff.x + 20, y: staff.y }); assert.ok(ability(g, [firewall.id]).ok);
  tickOperation(g, .2); assert.ok(g.queue[0].remaining < remaining); assert.equal(g.operation.productionPaused, false);
});
check('Disrupting rival researchers interrupts reinforcements and replacement costs funds', () => {
  const g = createOperation(), staff = g.units.find(u => u.team !== 'player' && u.role === 'researcher'); staff.locked = 10; g.operation.nextAttack = 0;
  tickOperation(g, 5); assert.equal(g.operation.attacks, 0); assert.equal(g.operation.enemyAI.produced,0); const remaining=g.operation.enemyQueue[0].remaining; tickOperation(g, 6); assert.ok(g.operation.enemyQueue[0].remaining<remaining); assert.equal(g.operation.attacks,0,'A staffed lab still has to finish paid assembly and form a squad');
  const h = createOperation(); h.units = h.units.filter(u => !(u.team !== 'player' && u.role === 'researcher'));
  tickOperation(h, 20); assert.equal(h.units.some(u => u.team !== 'player' && u.role === 'researcher'), false);
  tickOperation(h, 20); assert.equal(h.units.filter(u => u.team !== 'player' && u.role === 'researcher').length, 1); assert.ok(h.operation.enemyFunds < 900 + 40 * 8);
});
check('Relay captures once, pauses under contest and weakens endpoint shielding', () => {
  const g = createOperation(), op = g.operation, a = g.units.find(u => u.team === 'player' && u.role === 'agent');
  a.server = op.rival; Object.assign(a, point('grid', op.rival)); a.node = 'grid'; assert.ok(captureRelay(g, [a.id]).ok);
  const enemy = spawn(g, 'firewall', op.rival, 'grid', op.rival); enemy.locked = 100; enemy.hp = 20000; enemy.maxHp = 20000;
  tickOperation(g, 5); assert.equal(op.relay.progress, 0); assert.equal(op.relay.contested, true);
  g.units = g.units.filter(u => u.id !== enemy.id); tickOperation(g, 35); assert.equal(op.relay.captured, true);
  const money = g.funds; tickOperation(g, .05); assert.ok(g.funds - money < 1); assert.equal(captureRelay(g, [a.id]).ok, false);
});
check('Hold cancels staging and movement without teleporting', () => {
  const g = createOperation(), u = g.units.find(u => u.role === 'model' && u.team === 'player'); const p = { x: u.x, y: u.y };
  launchRaid(g, g.operation.rival, [u.id]); assert.equal(holdPosition(g, [u.id]), 1); tickOperation(g, 1);
  assert.equal(u.server, g.faction); assert.equal(u.raid, null); assert.deepEqual(u.path, []); assert.ok(Math.hypot(u.x - p.x, u.y - p.y) < 15);
});
check('Local save resumes a real running operation with identical future state', () => {
  const storage = memory(), archive = new LocalArchive(storage), g = createOperation(); activateEconomy(g); tickOperation(g, 35); upgradeBuilding(g, 'research');
  assert.ok(archive.save(g, { runId: 'fixture', selected: [g.units[0].id] })); const saved = archive.load(); assert.ok(saved); assert.equal(saved.game.nextWave, Infinity); assert.equal(saved.game.paused, true);
  saved.game.paused = false; tickOperation(g, 10); tickOperation(saved.game, 10); assert.deepEqual(saved.game, g);
});
check('Transit and tutorial state survive reload; damaged saves cannot crash play', () => {
  const storage = memory(), archive = new LocalArchive(storage), g = createOperation(); activateEconomy(g); launchRaid(g, g.operation.rival);
  for (let i = 0; i < 1500 && !g.units.some(u => u.transit); i++) tickOperation(g, .05);
  assert.ok(g.units.some(u => u.transit)); assert.ok(archive.save(g)); assert.ok(archive.load().game.units.some(u => u.transit));
  const text = [...storage.map.values()][0], data = JSON.parse(text); data.game.units[0].path = ['does-not-exist']; storage.setItem([...storage.map.keys()][0], JSON.stringify(data)); assert.equal(archive.load(), null);
  storage.setItem([...storage.map.keys()][0], '{broken'); assert.equal(archive.load(), null);
});
check('Storage errors are isolated and repeated result writes award only one record', () => {
  const unavailable = new LocalArchive({ getItem() { throw new Error('storage disabled'); }, setItem() { throw new Error('quota'); } });
  assert.equal(unavailable.load(), null); assert.equal(unavailable.save(createOperation()), false);
  const failed=createOperation();failed.result='victory';assert.equal(unavailable.record(failed,'no-storage','Test'),null);
  const archive = new LocalArchive(memory()), g = createOperation(); g.result = 'victory'; g.time = 600; g.operation.relay.captured = true;
  archive.record(g, 'same-run', '<b>Test</b>'); archive.record(g, 'same-run', 'Different'); assert.equal(archive.history().length, 1); assert.equal(archive.standings()[0].score, 9333);
  g.result = 'defeat'; archive.record(g, 'failed-run', 'Test'); assert.equal(archive.history()[0].score, 0); assert.equal(archive.standings().length, 1);
});
check('Complete-session frame metrics include stalls and survive a bounded trace', () => {
  const m = new FrameMonitor(); for (let i = 0; i < 45000; i++) m.record(1000 / 48, 4);
  assert.equal(m.summary().frames, 45000); assert.ok(m.summary().minimumCompleteSecond >= 46); assert.ok(m.window.length < 400);
  m.record(1200, 800); assert.equal(m.summary().minimumCompleteSecond, 0); assert.equal(m.summary().gapsOver100ms, 1); assert.equal(m.summary().maximumGapMs, 1200);
  m.interrupt(); for (let i = 0; i < 48; i++) m.record(1000 / 48); assert.equal(m.summary().maximumGapMs, 1200);
});
check('A slow draw is attributed to the following callback and draw interval', () => {
  const a=new FrameAttribution(),first=a.draw({frameId:1,rafAt:20,drawStart:21,drawEnd:271});
  a.callback(280,281);const second=a.draw({frameId:2,rafAt:280,drawStart:282,drawEnd:286});
  assert.equal(first.followingCallbackGapMs,260);assert.equal(first.nextRafAt,280);
  assert.equal(first.followingDrawGapMs,260);assert.equal(second.previousFrameId,1);
  a.callback(300,301);a.callback(320,321);assert.equal(second.nextRafAt,300);
  a.reset();a.callback(5000,5001);assert.equal(second.nextRafAt,300);
});
check('Real siege damage exposes exact headquarters HP for every faction', () => {
  for(const owner of factions){const g=createGame(owner);g.units=[];g.nextWave=Infinity;const home=g.servers[owner],before=home.integrity;
   assert.equal(buildingHealth(home),null);assert.equal(buildingHealth(home,{inspected:true}).hp,before);
   const rival=factions.find(f=>f!==owner),attacker=spawn(g,'model',rival,'campus',owner);attacker.order='siege';tickGame(g,.05);
   const health=buildingHealth(home,{attacked:g.effects.some(e=>e.kind==='siege'&&e.server===owner)});
   assert.ok(home.integrity<before);assert.equal(health.hp,home.integrity);assert.equal(health.maxHp,home.maxIntegrity);assert.equal(health.attacked,true);assert.equal(health.ratio,home.integrity/home.maxIntegrity);
  }
  assert.equal(buildingHealth({}),null);
});
check('Building health stays clear of map controls and other health panels at viewport edges',()=>{
 for(const [width,height]of [[940,376],[1026,424],[1540,716],[2002,1019]]){
  const blocked=[{x:14,y:12,width:280,height:65},{x:width-214,y:12,width:200,height:36},{x:14,y:height-126,width:164,height:114}];
  for(const anchor of [{x:width-45,y:35},{x:60,y:40},{x:60,y:height-15}]){
   const box=placeBuildingHealth(anchor,{width,height,blocked});assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   for(const b of blocked)assert.ok(box.x+box.width<=b.x||box.x>=b.x+b.width||box.y+box.height<=b.y||box.y>=b.y+b.height,'Health overlaps HUD');blocked.push(box);
  }
 }
});

check('Crowded enemies have no permanent banners and group selection has one context', () => {
  const enemies=Array.from({length:40},(_,id)=>({id,team:'closed',role:'model',transit:false}));
  assert.deepEqual(unitCallouts(enemies,new Set()),[]);
  const people=[{id:101,team:'player',role:'researcher'},{id:102,team:'player',role:'researcher'},{id:103,team:'player',role:'model'}];
  assert.equal(unitCallouts([...enemies,...people],new Set([101])).length,1);
  assert.equal(unitCallouts([...enemies,...people],new Set([101,102,103])).length,0);
  assert.equal(unitCallouts([...enemies,...people],new Set([101,102]),'researcher').length,1);
});
check('GPU queries retain originating frames, disjoint status and bounded history', () => {
  const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};let disjoint=false,deleted=0;
  const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension:()=>ext,createQuery:()=>({}),beginQuery(){},endQuery(){},getParameter:()=>disjoint,getQueryParameter:(_,p)=>p===3?true:7000000,deleteQuery(){deleted++;}};
  const p=new RenderProfiler({getContext:()=>gl}),pass={render(){return 42;}};p.attach(pass,'scene');
  for(let i=0;i<4;i++)p.beginFrame({server:'broke',reflectionDue:true,shadowDue:false});assert.equal(pass.render(),42);
  p.beginFrame({server:'closed'});const r=p.stats().gpuRecords[0];assert.equal(r.frameId,4);assert.equal(r.server,'broke');assert.equal(r.reflectionDue,true);assert.equal(r.shadowDue,false);assert.equal(r.elapsedNs,7000000);assert.ok(r.resolvedAt>=r.issuedAt);assert.equal(deleted,1);
  for(let i=0;i<3;i++)p.beginFrame();pass.render();disjoint=true;p.beginFrame();assert.equal(p.stats().gpuRecords.at(-1).disjoint,true);assert.equal(p.stats().gpuRecords.at(-1).elapsedNs,null);assert.deepEqual(p.stats().gpuStagesMs,{});disjoint=false;
  for(let i=0;i<2500;i++){p.beginFrame();pass.render();}p.beginFrame();assert.equal(p.stats().gpuRecords.length,512);p.dispose();assert.equal(p.pending.length,0);
});
check('Profiler teardown restores pass, GL, extension and skeleton hooks twice', () => {
  const ext={multiDrawElementsWEBGL(){},multiDrawArraysWEBGL(){}},draw=ext.multiDrawElementsWEBGL;
  const gl={getExtension:name=>name==='WEBGL_multi_draw'?ext:null,clear(){}};
  const clear=gl.clear,skeleton=T.Skeleton.prototype.update,pass={render(){return 'original';}},render=pass.render;
  for(let i=0;i<2;i++){const p=new RenderProfiler({getContext:()=>gl},{detail:true});p.attach(pass,'scene');assert.notEqual(ext.multiDrawElementsWEBGL,draw);assert.equal(pass.render(),'original');p.dispose();p.dispose();assert.equal(ext.multiDrawElementsWEBGL,draw);assert.equal(gl.clear,clear);assert.equal(pass.render,render);assert.equal(T.Skeleton.prototype.update,skeleton);}
});
check('Parked scene hierarchies preserve complete bone transforms when they re-enter', () => {
  const scene = new T.Scene(), root = parkHiddenMatrices(new T.Group()), bone = new T.Bone(), child = new T.Object3D();
  scene.add(root); root.add(bone); bone.add(child); root.position.x = 5; bone.position.y = 2; child.position.z = 3;
  scene.updateMatrixWorld(); const before = child.matrixWorld.clone();
  root.visible = false; root.position.x = 9; bone.position.y = 4; scene.updateMatrixWorld(true);
  assert.deepEqual(child.matrixWorld.elements, before.elements);
  root.visible = true; scene.updateMatrixWorld(true); assert.deepEqual(new T.Vector3().setFromMatrixPosition(child.matrixWorld).toArray(), [9, 4, 3]);
});

export function playOperation(faction, rival, checkpoint = false) {
  let g = createOperation(faction, rival); activateEconomy(g);
  const defender = g.units.find(u => u.role === 'model' && u.team === 'player').id, shield = g.units.find(u => u.role === 'firewall' && u.team === 'player').id;
  let restored = false;
  for (let i = 0; i < 18000 && !g.result; i++) {
    if (checkpoint && !restored && g.time > 100) { const archive = new LocalArchive(memory()); assert.ok(archive.save(g)); g = archive.load().game; g.paused = false; restored = true; }
    directOperation(g);
    tickOperation(g, .05);
    assert.ok(g.units.length <= 48); assert.ok(g.funds >= 0); assert.ok(g.energy >= 0); assert.ok(g.heat >= 10 && g.heat <= 100);
  }
  return g;
}
const matchups = [];
check('All six full operations are winnable under 15 minutes and reproduce after save/resume', () => {
  for (const faction of factions) for (const rival of factions.filter(id => id !== faction)) {
    const g = playOperation(faction, rival), restored = playOperation(faction, rival, true);
    assert.equal(g.result, 'victory',faction+' vs '+rival+' enemy HP '+g.servers[rival].integrity); assert.ok(g.time > 180 && g.time <= 900); assert.deepEqual(restored, g);
    matchups.push({ faction, rival, seconds: Math.round(g.time), score: scoreOperation(g).score, relay: g.operation.relay.captured });
  }
});
check('Idle operations cannot win and every operation resolves at the hard deadline', () => {
  for (const faction of factions) { const g = createOperation(faction); tickOperation(g, 1000); assert.ok(['defeat', 'timeout'].includes(g.result)); assert.ok(g.time <= 900); assert.equal(scoreOperation(g).score, 0); }
  const g = createOperation(); g.units = []; g.operation.enemyFunds = 0; g.operation.nextAttack = g.operation.nextGuard = 5000; tickOperation(g, 1000); assert.equal(g.result, 'timeout'); assert.equal(g.time, 900);
});
console.log(JSON.stringify({ status: 'passed', checks: tests.length, tests, matchups }, null, 2));
