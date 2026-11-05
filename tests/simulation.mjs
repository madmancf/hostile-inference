import assert from 'node:assert/strict';
import { createLab,measure,setAllocation,triggerIncident,buyUpgrade,startTraining,cancelTraining,tick,advance,status } from '../game/v2/simulation.js';

let count=0;
const check=(name,fn)=>{fn();count++;console.log('PASS '+name)};
check('unstarted and partially trained jobs reconcile cancellation refunds',()=>{
 const s=createLab();const initial=s.funds;assert(startTraining(s));assert(cancelTraining(s));assert.equal(s.funds,initial);
 assert(startTraining(s));advance(s,20);const before=s.funds,progress=s.research;assert(cancelTraining(s));assert(Math.abs(s.funds-before-220*(1-progress/100))<1e-8);
});
check('insufficient funds cannot buy support or reserve training',()=>{const s=createLab();s.funds=0;const before=JSON.stringify(s);assert.equal(buyUpgrade(s,'energy'),false);assert.equal(startTraining(s),false);assert.equal(JSON.stringify(s),before)});
check('research stops when every employed researcher is locked out',()=>{const s=createLab();s.workers=4;startTraining(s);triggerIncident(s,'lockout');advance(s,10);assert.equal(s.research,0);buyUpgrade(s,'responder');advance(s,5);assert(s.research>0)});
check('poisoning persists until the paid audit removes it',()=>{const s=createLab('closed');triggerIncident(s,'poison');const q=s.quality;advance(s,90);assert(s.events.infection);assert(s.quality<q);buyUpgrade(s,'audit');assert(!s.events.infection);assert(s.quality>q)});
check('a brownout reduces served research and energy logistics restore it',()=>{const s=createLab();const baseline=measure(s);triggerIncident(s,'blackout');const damaged=measure(s);assert(damaged.powerFactor<baseline.powerFactor);assert(damaged.researchRate<baseline.researchRate);buyUpgrade(s,'energy');assert(measure(s).powerFactor>damaged.powerFactor)});
check('cooling reduces heat under an active drought',()=>{const s=createLab();triggerIncident(s,'drought');advance(s,25);assert(s.heat>65);const control=structuredClone(s);buyUpgrade(s,'cooling');advance(s,10);advance(control,10);assert(s.heat<control.heat)});
check('extra compute requires a physical chip delivery delay',()=>{const s=createLab();const old=s.compute;buyUpgrade(s,'compute');assert.equal(s.compute,old);advance(s,24);assert.equal(s.compute,old);advance(s,1);assert.equal(s.compute,old+32);assert.equal(s.deliveries.length,0)});
check('a cable cut disconnects floating compute while local capacity remains',()=>{const s=createLab();buyUpgrade(s,'cloud');assert.equal(s.offshoreCompute,24);const before=measure(s).effectiveCompute;triggerIncident(s,'cable');assert.equal(measure(s).effectiveCompute,before-24);assert.equal(measure(s).effectiveCompute,96)});
check('valid training releases a model and reserves ongoing compute',()=>{const s=createLab();assert(startTraining(s));advance(s,120);assert.equal(s.models,2);assert.equal(s.unitCompute,13);assert.equal(s.training,false)});
check('Broke speed and heat are an explicit tradeoff',()=>{const a=createLab('misanthropic'),b=createLab('broke');assert(measure(b).researchRate>measure(a).researchRate);a.cooling=b.cooling=50;advance(a,20);advance(b,20);assert(b.heat>a.heat)});
check('zero capacity and invalid ticks remain well-defined',()=>{const s=createLab();s.compute=s.energy=s.workers=0;for(const key of ['inference','research','security'])setAllocation(s,key,0);tick(s);assert(Object.values(measure(s)).every(v=>Number.isFinite(v)));assert.throws(()=>tick(s,Infinity));assert.throws(()=>tick(s,-1));assert.throws(()=>createLab('unknown'))});

function run(seed){
 let random=seed;const rng=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296};
 const s=createLab(['misanthropic','closed','broke'][seed%3]);
 const incidents=['blackout','drought','poison','lockout','surge','escape','cable','leak'];
 const upgrades=['energy','cooling','researcher','compute','cloud','audit','responder'];
 for(let second=0;second<600;second++){
  if(second%19===0)setAllocation(s,['inference','research','security'][Math.floor(rng()*3)],Math.floor(rng()*101));
  if(second%37===0)triggerIncident(s,incidents[Math.floor(rng()*incidents.length)]);
  if(second%29===0)buyUpgrade(s,upgrades[Math.floor(rng()*upgrades.length)]);
  if(second%31===0)startTraining(s);if(second%89===0)cancelTraining(s);
  tick(s);
  for(const value of ['funds','energy','cooling','compute','workers','heat','quality','trust','research'])assert(Number.isFinite(s[value])&&s[value]>=0,seed+' invalid '+value);
  assert(s.heat<=100&&s.quality<=100&&s.trust<=100&&s.research<=100);
  assert(measure(s).powerFactor<=1&&measure(s).scheduling<=1);assert(Array.isArray(status(s)));
 }
 return JSON.stringify(s);
}
check('100 seeded adversarial operating runs preserve bounds and determinism',()=>{for(let seed=1;seed<=100;seed++)assert.equal(run(seed),run(seed))});
console.log(JSON.stringify({passed:count,seededScenarios:100,repeatedRuns:200,simulatedSeconds:120000,tacticalBalanceTested:false}));
