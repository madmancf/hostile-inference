import { INCIDENTS,UPGRADES } from './world.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createLab(faction='misanthropic'){
  if(!['misanthropic','closed','broke'].includes(faction))throw new Error('Unknown faction');
  return {version:2,faction,time:0,funds:1600,energy:112,cooling:105,compute:96,offshoreCompute:0,deliveries:[],workers:12,idlePower:14,unitCompute:8,quality:94,trust:78,heat:24,models:1,research:0,training:false,trainingCost:220,energyUnits:2,coolingShips:1,events:{},allocations:{inference:42,research:26,security:12},log:[{time:0,text:'Campus online. Power, clean data and staff are ready.'}],metrics:null};
}
function log(state,text){state.log.unshift({time:Math.floor(state.time),text});state.log=state.log.slice(0,8)}
export function measure(s){
  const active=key=>(s.events[key]||0)>0;
  const workers=Math.max(0,s.workers-(active('lockout')?4:0));
  const supply=Math.max(0,s.energy-(active('blackout')?45:0));
  const cooling=Math.max(0,s.cooling-(active('drought')?45:0));
  const requested=s.allocations.inference+s.allocations.research+s.allocations.security+s.unitCompute+(active('escape')?22:0)+(active('surge')?24:0);
  const thermal=s.heat<=65?1:clamp(1-(s.heat-65)*.018,.25,1);
  const connectedCompute=s.compute-(active('cable')?s.offshoreCompute:0);
  const effectiveCompute=connectedCompute*thermal;
  const scheduling=Math.min(1,effectiveCompute/Math.max(1,requested));
  const desiredPower=s.idlePower+requested*1.05+s.workers*.45;
  const powerFactor=Math.min(1,supply/Math.max(1,desiredPower));
  const served=requested*scheduling*powerFactor;
  const excess=Math.max(0,served*(s.faction==='broke'?1.18:1)-cooling);
  const income=(s.allocations.inference+(active('surge')?24:0))*scheduling*powerFactor*(.35+.65*s.quality/100)*(.35+.65*s.trust/100)*(s.faction==='closed'?1.12:1)*(active('cable')?(s.faction==='closed'?.55:.78):1)*.5;
  const workerFactor=Math.min(1,workers/12);
  const researchRate=s.allocations.research/18*scheduling*powerFactor*workerFactor*(.3+.7*s.quality/100)*(s.faction==='misanthropic'?.88:s.faction==='broke'?1.15:1);
  return{workers,supply,cooling,requested,effectiveCompute,desiredPower,scheduling,powerFactor,served,excess,income,researchRate,thermal};
}
export function setAllocation(state,key,value){
  if(!['inference','research','security'].includes(key)||!Number.isFinite(Number(value)))return false;
  state.allocations[key]=clamp(Math.round(Number(value)),0,100);return true;
}
export function triggerIncident(s,key){
  if(!INCIDENTS[key])return false;
  if(key==='poison'){s.quality=clamp(s.quality-(s.faction==='misanthropic'?20:28),0,100);s.events.infection=1}
  else if(key==='leak'){s.trust=clamp(s.trust-14,0,100);s.events.leaked=1}
  else s.events[key]=INCIDENTS[key].duration;
  log(s,INCIDENTS[key].name+'. '+INCIDENTS[key].summary);return true;
}
export function buyUpgrade(s,key){
  const upgrade=UPGRADES[key];if(!upgrade||s.funds<upgrade.cost)return false;
  s.funds-=upgrade.cost;
  if(key==='energy'){s.energy+=22;s.unitCompute+=1;s.energyUnits++}
  if(key==='cooling'){s.cooling+=30;s.unitCompute+=2;s.coolingShips++}
  if(key==='researcher'){s.workers+=1;s.idlePower+=1.55}
  if(key==='compute'){s.deliveries.push({remaining:25,compute:32,power:8})}
  if(key==='cloud'){s.compute+=24;s.offshoreCompute+=24;s.idlePower+=22}
  if(key==='audit'){s.quality=clamp(s.quality+26,0,100);delete s.events.infection;s.trust=clamp(s.trust+3,0,100)}
  if(key==='responder'){delete s.events.lockout;delete s.events.escape}
  log(s,upgrade.name+'. '+upgrade.summary);return true;
}
export function startTraining(s){
  if(s.training||s.funds<s.trainingCost)return false;
  s.funds-=s.trainingCost;s.training=true;s.research=0;log(s,'Training reserved: 220 funds. Researchers need clean data, compute and power.');return true;
}
export function cancelTraining(s){
  if(!s.training)return false;
  const refund=s.trainingCost*(1-s.research/100);s.funds+=refund;s.training=false;s.research=0;log(s,'Training cancelled. Unused work refunded.');return true;
}
export function tick(s,dt=1){
  if(!Number.isFinite(dt)||dt<=0||dt>1)throw new Error('Tick must be within (0,1]');
  s.time+=dt;
  const protection=measure(s).scheduling*measure(s).powerFactor*s.allocations.security;
  for(const delivery of s.deliveries)delivery.remaining-=dt;
  for(const delivery of s.deliveries.filter(d=>d.remaining<=0)){s.compute+=delivery.compute;s.idlePower+=delivery.power;log(s,'Chip convoy arrived. A commissioned data centre is now online. +32 compute, +8 MW idle demand.')}
  s.deliveries=s.deliveries.filter(d=>d.remaining>0);
  for(const key of Object.keys(s.events)){
    if(['infection','leaked'].includes(key))continue;
    const recovery=['lockout','escape'].includes(key)?1+protection/35:1;
    s.events[key]=Math.max(0,s.events[key]-dt*recovery);if(s.events[key]===0){delete s.events[key];log(s,INCIDENTS[key].name+' ended. Infrastructure is recovering.')}
  }
  const m=measure(s);
  s.funds+=m.income*dt;
  const surplus=Math.max(0,m.cooling-m.served*(s.faction==='broke'?1.18:1));
  s.heat=clamp(s.heat+(m.excess*.11-Math.min(1.3,surplus*.025)-.05)*dt,18,100);
  if(s.events.infection)s.quality=clamp(s.quality-.035*(1-clamp(protection/50,0,.85))*dt,0,100);
  else if(s.allocations.security>=10)s.quality=clamp(s.quality+.016*dt,0,100);
  if(s.heat>85)s.trust=clamp(s.trust-.06*dt,0,100);
  if(s.training){
    s.research=clamp(s.research+m.researchRate*dt,0,100);
    if(s.research===100){s.training=false;s.models++;s.unitCompute+=5;s.trust=clamp(s.trust+(s.quality>=80?4:s.faction==='broke'?-10:-6),0,100);if(s.quality>=80)delete s.events.leaked;log(s,'Model released. '+(s.quality>=80?'Validated output earns trust.':'Poor data caused a flawed release.')+' +5 compute upkeep.');}
  }
  s.metrics=measure(s);return s;
}
export function advance(s,seconds){if(!Number.isInteger(seconds)||seconds<0||seconds>3600)throw new Error('Invalid advance');for(let i=0;i<seconds;i++)tick(s);return s}
export function status(s){
  const m=measure(s),warnings=[];
  if(m.powerFactor<.95)warnings.push('Energy bottleneck');
  if(s.heat>65)warnings.push('Thermal throttling');
  if(m.requested>m.effectiveCompute)warnings.push('Compute overcommitted');
  if(s.events.lockout)warnings.push('Researchers locked out');
  if(s.events.infection)warnings.push('Persistent dataset infection');
  if(s.events.cable)warnings.push('Offshore cable disconnected');
  if(s.events.leaked)warnings.push('Model differentiation lost');
  return warnings;
}
