import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createOperation,directOperation,tickOperation,activateEconomy} from '../game/demo/operation.js';
import {LocalArchive} from '../game/demo/local-archive.js';
const factions=['misanthropic','closed','broke'],matches=[],idle=[],checkpoints=[];
for(const difficulty of ['standard','relaxed'])for(const faction of factions)for(const rival of factions.filter(f=>f!==faction)){
 const g=createOperation(faction,rival,difficulty);let minimumCash=Infinity,maxHeat=0,maxField=0,firstRaid=null,firstBuild=null,peakUsed=0;
 while(!g.result){directOperation(g);tickOperation(g,.05);minimumCash=Math.min(minimumCash,g.operation.enemyFunds);maxHeat=Math.max(maxHeat,g.operation.enemyHeat);maxField=Math.max(maxField,g.units.filter(u=>u.team===rival).length+g.operation.enemyQueue.length);peakUsed=Math.max(peakUsed,g.operation.enemyAI.abilities);if(firstRaid===null&&g.operation.attacks)firstRaid=g.time;if(firstBuild===null&&Object.values(g.infrastructure[rival].buildings).some(b=>b.built))firstBuild=g.time;
  if(!checkpoints.some(c=>c.faction===faction&&c.rival===rival)&&difficulty==='standard'&&g.time>=260&&g.time<260.051&&[['misanthropic','closed'],['closed','broke'],['broke','misanthropic']].some(([f,r])=>faction===f&&rival===r)){
   const store=new Map(),archive=new LocalArchive({getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)});assert.ok(archive.save(g));checkpoints.push({faction,rival,record:JSON.parse(store.get('hostile-inference.local-save.v1'))});
  }
 }
 const row={difficulty,faction,rival,outcome:g.result,seconds:Math.round(g.time*10)/10,home:Math.round(g.campus),rivalHP:Math.round(g.servers[rival].integrity),relay:g.operation.relay.captured,firstRaid:firstRaid===null?null:Math.round(firstRaid),firstBuilding:Math.round(firstBuild),enemy:{produced:g.operation.enemyAI.produced,losses:g.operation.enemyAI.losses,deliveries:g.operation.enemyAI.deliveries,abilities:peakUsed,raids:g.operation.attacks,repairs:g.operation.enemyAI.repairs,retreats:g.operation.enemyAI.retreats,buildings:Object.values(g.infrastructure[rival].buildings).filter(b=>b.built).length,research:g.infrastructure[rival].completed,specialization:g.infrastructure[rival].specialization,maxHeat:Math.round(maxHeat),minimumFunds:minimumCash,maxField}};
 matches.push(row);console.log(JSON.stringify(row));assert.ok(g.time<=900);assert.ok(minimumCash>=0);assert.ok(maxField<=20);assert.equal(g.result,'victory',faction+' vs '+rival+' '+difficulty);
}
for(const rival of factions){const g=createOperation(rival==='broke'?'closed':'broke',rival);activateEconomy(g);while(!g.result)tickOperation(g,.05);assert.equal(g.result,'defeat','An idle base must fall to a sustained invasion');assert.ok(g.operation.attacks>0);idle.push({rival,outcome:g.result,time:Math.round(g.time),home:Math.round(g.campus),raids:g.operation.attacks,research:g.infrastructure[rival].completed});}
const paths=['game/demo/enemy-ai.js','game/demo/engine.js','game/demo/faction-tech.js','game/demo/faction-rules.js','game/demo/operation.js'];const sourceSHA256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));
await fs.writeFile('output/playwright/enemy-ai-balance-v0.11.json',JSON.stringify({status:'passed',at:new Date().toISOString(),scope:'Deterministic paid-command simulation, not human balance approval or FPS certification',matches,idle,sourceSHA256},null,2)+'\n');
await fs.writeFile('output/playwright/enemy-ai-checkpoints-v0.11.json',JSON.stringify(checkpoints)+'\n');
