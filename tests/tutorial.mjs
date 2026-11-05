import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tickGame,point,command,deploy} from '../game/demo/engine.js';
import {tree,facilitySite,techBonuses,startProject,damageFacility} from '../game/demo/faction-tech.js';
import {LocalArchive} from '../game/demo/local-archive.js';
import {createTutorial,tutorialAction,updateTutorial,advanceTutorial,tutorialAllows,tutorialAbility,inspectTutorial,chooseTutorialBranch,tutorialPhase,LESSONS,UNIT_GUIDE} from '../game/demo/tutorial.js';
const factions=['misanthropic','closed','broke'],results=[],checkpoints=[];
const storage=()=>({data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);},removeItem(k){this.data.delete(k);}});
export function guide(g,branch=0,finalBranch=branch){
 const p=tutorialPhase(g),t=g.tutorial;
 if(p==='build'&&t.opening===null)chooseTutorialBranch(g,branch);
 if(p==='expand'&&t.support===null)chooseTutorialBranch(g,(branch+1)%3);
 if(p==='specialize'&&t.final===null)chooseTutorialBranch(g,finalBranch);
 tutorialAction(g);
 if(p==='formation'&&t.formationRallied){const role=g.faction==='broke'?(t.formationCasts.includes('model')?'cooler':'model'):'firewall';const u=g.units.find(u=>u.team==='player'&&u.role===role&&!u.path.length&&u.abilityCooldown===0);if(u)tutorialAbility(g,[u.id]);}
}
for(const faction of factions)for(const rival of factions.filter(r=>r!==faction))for(let branch=0;branch<3;branch++){
 const g=createTutorial(faction,rival),seen=new Set();assert.equal(advanceTutorial(g),false);assert.equal(tutorialAllows(g,'model'),false);
 let lastAction=-1;
 for(let i=0;i<20000&&!g.tutorial.complete;i++){
  const p=tutorialPhase(g),t=g.tutorial;
  if(!seen.has(p)){
   seen.add(p);
   if(p==='models'&&branch===(faction==='broke'?2:0)&&rival===factions[(factions.indexOf(faction)+1)%3]){const archive=new LocalArchive(storage());assert.ok(archive.save(g));checkpoints.push({faction,rival,phase:p,record:JSON.parse(archive.storage.getItem('hostile-inference.local-save.v1'))});}
   if(branch===0&&rival===factions[(factions.indexOf(faction)+1)%3]&&['build','specialize','formation','counter','recon','sabotage','endpoint'].includes(p)){
    const archive=new LocalArchive(storage());assert.ok(archive.save(g),archive.error);checkpoints.push({faction,rival,phase:p,record:JSON.parse(archive.storage.getItem('hostile-inference.local-save.v1'))});
   }
  }
  if(g.time>=lastAction+.8){guide(g,branch);lastAction=g.time;}
  tickGame(g,.05);updateTutorial(g);
  if(t.ready){if(t.freezeOnReady){const time=g.time,integrity=g.servers[rival].integrity;tickGame(g,3);assert.equal(g.time,time);assert.equal(g.servers[rival].integrity,integrity);}
   advanceTutorial(g);
  }
 }
 assert.equal(g.result,'victory',`${faction} vs ${rival} branch ${branch} stuck: ${JSON.stringify(g.tutorial)} units ${g.units.filter(u=>u.team==='player').map(u=>[u.role,u.hp,u.order,u.path])}`);
 assert.equal(seen.size,LESSONS.length);assert.equal(g.infrastructure[faction].specialization,tree(faction).branches[branch].research[1].id);
 assert.ok(g.tutorial.counterUsed);assert.ok(g.stats.deliveries>0);assert.ok(g.campus>0);assert.equal(g.infrastructure[rival].buildings[facilitySite(rival==='broke'?2:0)].hp,0);
 results.push({faction,rival,branch,specialization:g.infrastructure[faction].specialization,lessons:seen.size,seconds:Math.round(g.time),deployed:g.stats.deployed,home:g.campus});
}
// A single guided swarm order must not depend on UI sampling a transient shot or repeated clicks.
const cadence=structuredClone(checkpoints.find(c=>c.faction==='closed'&&c.phase==='counter').record.game);cadence.paused=false;cadence.nextWave=Infinity;tutorialAction(cadence);for(let i=0;i<2400&&!cadence.tutorial.ready;i++){tickGame(cadence,.05);if(i%4===0)updateTutorial(cadence);}assert.ok(cadence.tutorial.counterUsed&&cadence.tutorial.ready,'Swarm counter completes with 5 Hz UI updates and one order');
// A final choice may come from a third branch; the guided order must build its prerequisites.
const switched=[];
for(const faction of factions){const g=createTutorial(faction);let action=-1;for(let i=0;i<18000&&!g.tutorial.complete;i++){if(g.time>=action+.8){guide(g,0,2);action=g.time;}tickGame(g,.05);updateTutorial(g);if(g.tutorial.ready)advanceTutorial(g);}assert.equal(g.result,'victory',faction+' can switch final branches');assert.equal(g.infrastructure[faction].specialization,tree(faction).branches[2].research[1].id);assert.ok(Object.values(g.infrastructure[faction].buildings).every(b=>b.hp>0));switched.push(faction);}
const step=(g,id)=>{g.tutorial.step=LESSONS.findIndex(l=>l.id===id);g.tutorial.ready=false;};
const g=createTutorial('closed','broke');step(g,'build');assert.equal(tutorialAction(g).ok,false,'No unchosen branch is auto-built');assert.equal(g.infrastructure.closed.project,null);chooseTutorialBranch(g,0);const funds=g.funds;assert.ok(tutorialAction(g).ok);assert.equal(g.funds,funds-tree('closed').branches[0].cost);assert.equal(chooseTutorialBranch(g,1),false,'Paid project choice locked until cancelled or complete');tickGame(g,20);updateTutorial(g);assert.ok(g.tutorial.ready);assert.ok(advanceTutorial(g));assert.ok(tutorialAction(g).ok);assert.equal(g.infrastructure.closed.project.id,'latency-market');
const bad=createTutorial('misanthropic');step(bad,'formation');const h=bad.units.find(u=>u.team==='player'&&u.role==='harvester');assert.ok(tutorialAbility(bad,[h.id]).ok);updateTutorial(bad);assert.equal(bad.tutorial.ready,false,'An unrelated ability cannot complete the faction exercise');
const cash=createTutorial('broke');step(cash,'cloud');cash.funds=0;assert.equal(tutorialAction(cash).ok,false);updateTutorial(cash);assert.equal(cash.tutorial.ready,false);
const other=createTutorial('closed','broke');step(other,'recon');inspectTutorial(other,'facility3');updateTutorial(other);assert.equal(other.tutorial.ready,false,'Inspecting a home facility cannot complete rival recon');other.activeServer='broke';inspectTutorial(other,'facility3');updateTutorial(other);assert.ok(other.tutorial.ready);
// Staff lockout pauses research; a manually queued project still satisfies the normal objective.
const staffing=createTutorial('closed');step(staffing,'build');chooseTutorialBranch(staffing,0);tutorialAction(staffing);tickGame(staffing,22);updateTutorial(staffing);advanceTutorial(staffing);startProject(staffing,'latency-market');const staff=staffing.units.find(u=>u.team==='player'&&u.role==='researcher');staff.locked=30;const remaining=staffing.infrastructure.closed.project.remaining;tickGame(staffing,2);assert.equal(staffing.infrastructure.closed.project.remaining,remaining);staff.locked=0;tickGame(staffing,25);updateTutorial(staffing);assert.ok(staffing.tutorial.ready);
// The facility lesson cannot be bypassed by ordering an early endpoint siege.
const recon=structuredClone(checkpoints.find(c=>c.phase==='recon').record.game);recon.nextWave=Infinity;recon.paused=false;command(recon,recon.units.filter(u=>u.team==='player').map(u=>u.id),'siege','campus');const integrity=recon.servers[recon.tutorial.rival].integrity;tickGame(recon,80);assert.equal(recon.servers[recon.tutorial.rival].integrity,integrity);
// Round-trip every checkpoint, including new post-step-9 states and paid choices.
for(const {record} of checkpoints){const store=storage(),archive=new LocalArchive(store);store.setItem('hostile-inference.local-save.v1',JSON.stringify(record));const restored=archive.load();assert.ok(restored,archive.error);assert.equal(restored.game.tutorial.step,record.game.tutorial.step);assert.deepEqual(restored.game.infrastructure,record.game.infrastructure);}
// Old saves retain every paid project, HP, unit order and wallet; migration is idempotent.
for(let oldStep=0;oldStep<10;oldStep++){
 const old=createTutorial('closed');old.tutorial={step:oldStep,ready:false,complete:false,inspected:['campus'],threats:[],abilityUsed:false,baseline:0};startProject(old,'exchange');const store=storage(),archive=new LocalArchive(store);assert.ok(archive.save(old));const restored=archive.load();assert.ok(restored);assert.equal(restored.game.funds,old.funds);assert.deepEqual(restored.game.infrastructure.closed,old.infrastructure.closed);assert.equal(restored.game.tutorial.version,2);assert.ok(archive.save(restored.game));assert.deepEqual(archive.load().game.tutorial,restored.game.tutorial);
}
// Research progress and irreversible final selection persist; final bonuses actually disappear on destruction.
const paid=createTutorial('broke');step(paid,'specialize');chooseTutorialBranch(paid,1);for(const id of ['foundry','reactor','salvage-rights','run-hot']){command(paid,paid.units.filter(u=>u.role==='researcher'&&u.team==='player').map(u=>u.id),'research','lab');assert.ok(startProject(paid,id).ok);let work=0;while(paid.infrastructure.broke.project&&work++<4000)tickGame(paid,.05);}assert.ok(techBonuses(paid).burstDamage);damageFacility(paid,'broke','facility2',9999);assert.equal(techBonuses(paid).burstDamage,undefined);
const paused=createTutorial('misanthropic');paused.paused=true;tickGame(paused,10);assert.equal(paused.time,0);assert.equal(Object.keys(UNIT_GUIDE).length,8);
const paths=['game/demo/tutorial.js','game/demo/engine.js','game/demo/faction-tech.js','game/demo/faction-rules.js','game/demo/local-archive.js','tests/tutorial.mjs'];
const sourceSHA256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])));
await fs.mkdir('output/playwright',{recursive:true});await fs.writeFile('output/playwright/tutorial-checkpoints-v0.12.json',JSON.stringify(checkpoints));
const report={status:'passed',switchedFinalBranches:switched,at:new Date().toISOString(),tutorials:results,properties:['All 18 faction/rival/branch combinations finish 17 lessons','Explicit branch choice, paid costs and prerequisite progress','Wrong ability and wrong continent do not pass objectives','Arrival and sabotage wait for Continue','All expanded checkpoints save and resume','All 10 legacy steps migrate without losing paid state','Destroyed research branches lose actual bonuses','Pause and insufficient funds respected'],sourceSHA256};await fs.writeFile('output/playwright/tutorial-mechanics-v0.12.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
