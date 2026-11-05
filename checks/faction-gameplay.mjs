import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createGame,spawn,ability,command,tickGame,point,compute,deploy,launchRaid } from '../design-preview/demo/engine.js';
import { kit,unitType,updateFactionState,warded,linked,attackPower,receiveDamage,castFactionAbility,onHit } from '../design-preview/demo/faction-rules.js';
import { createOperation,directOperation,tickOperation,activateEconomy } from '../design-preview/demo/operation.js';
import { LocalArchive } from '../design-preview/demo/local-archive.js';
const tests=[],test=(name,fn)=>{fn();tests.push(name);},factions=['misanthropic','closed','broke'];
function arena(faction){const g=createGame(faction);g.units=[];g.nextWave=Infinity;g.preview=true;g.funds=5000;return g;}
function at(u,x=800,y=400){Object.assign(u,{x,y,path:[],arrival:null});return u;}
function store(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('Faction production has real HP, cost, assembly and compute differences',()=>{
 const models=factions.map(f=>{const g=arena(f),u=spawn(g,'model');assert.equal(u.maxHp,unitType(f,'model').hp);const money=g.funds;assert.ok(deploy(g,'model').ok);assert.equal(money-g.funds,unitType(f,'model').cost);assert.equal(g.queue[0].total,unitType(f,'model').time);assert.equal(compute(g).used,2*unitType(f,'model').compute);return u;});
 assert.equal(new Set(models.map(u=>u.hp)).size,3);assert.ok(unitType('broke','malware').compute<unitType('closed','malware').compute);
});
test('Misanthropic wards require time, reduce damage and collapse on movement, lockout or death',()=>{
 const g=arena('misanthropic'),f=at(spawn(g,'firewall')),m=at(spawn(g,'model'),850);
 updateFactionState(g,2.9);assert.equal(warded(g,m),false);updateFactionState(g,.1);assert.equal(warded(g,m),true);
 const hp=m.hp;receiveDamage(g,m,100);assert.equal(hp-m.hp,80);assert.equal(attackPower(g,m,99,20),24);
 command(g,[f.id],'move','gate');assert.equal(warded(g,m),false);
 f.path=[];f.settled=3;f.locked=1;assert.equal(warded(g,m),false);f.locked=0;f.hp=0;assert.equal(warded(g,m),false);
});
test('ClosedAI ramps only while linked to a live local Gatekeeper and resets on target switches',()=>{
 const g=arena('closed'),f=at(spawn(g,'firewall')),m=at(spawn(g,'model'),850);
 updateFactionState(g,.05);assert.equal(linked(g,m),true);assert.deepEqual([0,1,2,3,4].map(()=>attackPower(g,m,90,20)),[20,27,34,41,41]);
 assert.equal(attackPower(g,m,91,20),20);f.x=1100;updateFactionState(g,.05);assert.equal(m.focusStacks,0);assert.equal(ability(g,[m.id]).ok,false);
 f.x=800;f.hp=0;assert.equal(linked(g,m),false);f.hp=f.maxHp;f.server='broke';assert.equal(linked(g,m),false);
});
test('Broker marks amplify only linked allies of the marking faction',()=>{
 const run=mark=>{const g=arena('closed'),m=at(spawn(g,'model')),f=at(spawn(g,'firewall'),740),e=at(spawn(g,'model','broke','campus','closed'),900);f.cooldown=10;e.cooldown=10;if(mark){e.markedUntil=8;e.markedBy=mark;}const hp=e.hp;tickGame(g,.05);return hp-e.hp;};
 assert.ok(Math.abs(run('closed')/run(null)-1.25)<.001);assert.equal(run('misanthropic'),run(null));
});
test('Broke bursts create heat, have a real recovery penalty and cannot be chained on cooldown',()=>{
 const g=arena('broke'),m=at(spawn(g,'model'));g.heat=30;assert.ok(ability(g,[m.id]).ok);assert.equal(g.heat,38);assert.equal(ability(g,[m.id]).ok,false);
 assert.equal(attackPower(g,m,90,20),31);g.time=6.1;assert.equal(attackPower(g,m,90,20),12);g.time=11.1;assert.equal(attackPower(g,m,90,20),20);assert.ok(g.heat>38);
 const c=spawn(g,'cooler');assert.equal(ability(g,[c.id]).ok,false);at(c,...Object.values(point('intake',g.faction)));c.order='cool';g.heat=90;assert.ok(ability(g,[c.id]).ok);assert.equal(g.heat,62);
});
test('Reply Swarms punish crowds while spacing avoids splash; quarantine blocks suppression and theft',()=>{
 const g=arena('broke'),u=at(spawn(g,'malware')),target=at(spawn(g,'model','closed','campus','broke'),900),near=at(spawn(g,'agent','closed','campus','broke'),940),far=at(spawn(g,'agent','closed','campus','broke'),1030);
 onHit(g,u,target,20);assert.equal(near.maxHp-near.hp,7);assert.equal(far.hp,far.maxHp);target.hp=0;onHit(g,u,target,20);assert.equal(near.maxHp-near.hp,14,'A killing hit still splashes nearby targets');
 const a=arena('misanthropic'),worm=at(spawn(a,'malware')),e=at(spawn(a,'model','closed','campus','misanthropic'),900),f=at(spawn(a,'firewall','closed','campus','misanthropic'),950);
 onHit(a,worm,e,8);assert.equal(e.suppressedUntil,undefined);f.hp=0;onHit(a,worm,e,8);assert.equal(e.suppressedUntil,4);
 const b=arena('closed'),leech=at(spawn(b,'malware')),victim=at(spawn(b,'model','broke','campus','closed'),900);leech.hp-=20;const money=b.funds;onHit(b,leech,victim,8);assert.equal(b.funds-money,4);assert.equal(leech.hp,leech.maxHp-14);
});
test('Cloud capacity and delivery loops produce different faction economies',()=>{
 for(const faction of factions){const g=arena(faction),c=spawn(g,'cloud');Object.assign(c,point('intake',faction));assert.equal(compute(g).capacity,38+kit(faction).cloudCapacity);const h=spawn(g,'harvester');command(g,[h.id],'harvest','grid');for(let i=0;i<1800&&g.stats.deliveries===0;i++)tickGame(g,.05);assert.ok(g.stats.deliveries>0);assert.ok(g.energy>90);}
});
test('Paid group abilities charge per ready unit, reject insufficient funds and pause safely',()=>{
 const g=arena('misanthropic'),a=at(spawn(g,'firewall')),b=at(spawn(g,'model'));g.funds=119;assert.equal(ability(g,[a.id,b.id]).ok,false);assert.equal(g.funds,119);assert.equal(a.abilityCooldown,0);g.funds=120;assert.ok(ability(g,[a.id,b.id]).ok);assert.equal(g.funds,0);g.paused=true;a.abilityCooldown=0;assert.equal(ability(g,[a.id]).ok,false);
});
test('New tactical timers persist, legacy saves migrate once, malformed timers are rejected',()=>{
 const g=createOperation('broke','closed');const m=g.units.find(u=>u.team==='player'&&u.role==='model');ability(g,[m.id]);const archive=new LocalArchive(store());assert.ok(archive.save(g));assert.equal(archive.load().game.units.find(u=>u.id===m.id).recoveryUntil,11);
 delete g.rulesVersion;m.maxHp=460;m.hp=230;assert.ok(archive.save(g));const saved=archive.load().game;assert.equal(saved.rulesVersion,2);assert.equal(saved.units.find(u=>u.id===m.id).hp,195);assert.ok(archive.save(saved));assert.equal(archive.load().game.units.find(u=>u.id===m.id).hp,195);m.boostUntil=Infinity;assert.equal(archive.save(g),false);
});
test('The same tactical rules affect opponents without charging or heating the player',()=>{
 const g=createOperation('closed','broke'),u=spawn(g,'model','broke','campus','closed'),heat=g.heat,money=g.funds;castFactionAbility(g,u);attackPower(g,u,1,20);assert.equal(g.heat,heat);assert.equal(g.funds,money);assert.ok(g.operation.enemyHeat>38);
});
test('Focused attacks resume the endpoint order after their target dies',()=>{
 const g=arena('broke'),m=at(spawn(g,'model','player','campus','closed')),enemy=at(spawn(g,'agent','closed','campus','closed'),m.x+40,m.y);m.order='siege';command(g,[m.id],'attack',enemy.id);enemy.hp=0;tickGame(g,.05);assert.equal(m.order,'siege');
});
test('Quarantine cancels its own staging order without stranding the rest of a transfer',()=>{
 const g=arena('misanthropic'),m=spawn(g,'model'),f=spawn(g,'firewall');launchRaid(g,'closed');assert.ok(f.raid);assert.ok(ability(g,[f.id]).ok);assert.equal(f.raid,null);assert.equal(f.order,'hold');for(let i=0;i<2000&&g.stats.transfers===0;i++)tickGame(g,.05);assert.equal(m.server,'closed');assert.equal(f.server,'misanthropic');assert.equal(g.stats.transfers,1);
});
test('Crowded uplinks release a mixed escort instead of wedging on their centre',()=>{
 for(const faction of factions){const g=arena(faction);for(const role of ['model','model','model','firewall','agent','malware'])spawn(g,role);const rival=factions.find(f=>f!==faction);launchRaid(g,rival);for(let i=0;i<2000&&g.stats.transfers===0;i++)tickGame(g,.05);assert.equal(g.stats.transfers,1);assert.ok(g.units.every(u=>u.server===rival));}
});
const matchups=[];
for(const faction of factions)for(const rival of factions.filter(x=>x!==faction)){
 const g=createOperation(faction,rival);let maxHeat=0;for(let i=0;i<18010&&!g.result;i++){directOperation(g);tickOperation(g,.05);maxHeat=Math.max(maxHeat,g.heat);}
 matchups.push({faction,rival,result:g.result,seconds:Math.round(g.time*10)/10,home:g.campus,enemy:g.servers[rival].integrity,relay:g.operation.relay.captured,losses:g.operation.lost,maxHeat:Math.round(maxHeat)});
}
await fs.writeFile('output/playwright/faction-gameplay-v0.11.json',JSON.stringify({tests,matchups},null,2)+'\n');
for(const m of matchups)assert.equal(m.result,'victory',JSON.stringify(m));
console.log(JSON.stringify({status:'passed',checks:tests.length,tests,matchups},null,2));
