import { FACTIONS,UNITS,SPECIALISTS,STRUCTURES,SHARED_STRUCTURES,DISTRICTS,MAPS,INCIDENTS,UPGRADES } from './world.js';
import { SERVERS,SERVER_WORLD,serverSites } from '../servers/territories.js';
import { createLab,measure,setAllocation,triggerIncident,buyUpgrade,startTraining,cancelTraining,tick,advance,status } from './simulation.js';
const el=id=>document.getElementById(id);
const state={view:'world',faction:'misanthropic',unit:4,filter:'All',building:0,map:'misanthropic',district:'campus',zoom:1,panX:0,panY:0,labels:true,liveWorld:true};
let lab=createLab(),running=false,lastFrame=0,accumulator=0,history=[24],lastHistoryTime=-1,spriteId=0,entityFrame=0,entityFrameTime=0;
const time=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;
const format=value=>Math.round(value).toLocaleString('en-US');

function sprite(faction,index,building=false){
 const file=building?'assets/infrastructure-v2.png':`../servers/assets/${faction}-motion-v1.png`,w=building?1446:887,h=building?1087:1774,cols=4,rows=building?3:8,col=building?index:0,row=building?Object.keys(FACTIONS).indexOf(faction):index,x=col*w/cols,y=row*h/rows,cw=w/cols,ch=h/rows,clip='sprite-cell-'+(++spriteId);
 return `<svg viewBox="${x} ${y} ${cw} ${ch}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${cw}" height="${ch}"/></clipPath></defs><image href="${file}" width="${w}" height="${h}" clip-path="url(#${clip})"/></svg>`;
}
function applyFaction(){const f=FACTIONS[state.faction];document.documentElement.style.setProperty('--accent',f.color);document.documentElement.style.setProperty('--accent-ink',f.dark);document.documentElement.style.setProperty('--faction-paper',f.paper)}
function factionSwitchers(){
  for(const id of ['map-factions','unit-factions','building-factions','system-factions']){
    el(id).innerHTML=Object.entries(FACTIONS).map(([key,f])=>`<button data-faction="${key}" aria-pressed="${key===state.faction}" style="--swatch:${f.color}"><i aria-hidden="true"></i><span>${f.name}</span><small>${f.code} / ${f.accentLabel.toUpperCase()}</small></button>`).join('');
    el(id).querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      if(state.faction===b.dataset.faction)return;
      state.faction=b.dataset.faction;lab=createLab(state.faction);history=[lab.heat];lastHistoryTime=-1;running=false;accumulator=0;
      render();
    }));
  }
}
function mapTransform(){
  if(el('map-viewport').offsetParent===null)return;
  const maxX=el('map-viewport').clientWidth*(state.zoom-1)/2,maxY=Math.max(0,(el('map-canvas').clientHeight*state.zoom-el('map-viewport').clientHeight)/2);
  state.panX=Math.max(-maxX,Math.min(maxX,state.panX));state.panY=Math.max(-maxY,Math.min(maxY,state.panY));
  el('map-canvas').style.transform=`translate(-50%,-50%) translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`;
  el('zoom-value').textContent=Math.round(state.zoom*100)+'%';el('zoom-out').disabled=state.zoom<=1;el('zoom-in').disabled=state.zoom>=3;
  positionMapLabels();
}
function positionMapLabels(){
 if(el('map-viewport').offsetParent===null)return;const width=el('map-canvas').clientWidth,sites=serverSites(state.faction);
 for(const button of el('map-markers').querySelectorAll('button')){const p=sites.find(s=>s.id===button.dataset.district),half=button.offsetWidth/2;button.style.left=Math.max(half+6,Math.min(width-half-6,width*p.x/SERVER_WORLD.width))+'px';}
}
function renderDistrict(){
 const sites=serverSites(state.faction),d=sites.find(s=>s.id===state.district)||sites[0];state.district=d.id;el('district-details').style.setProperty('--district-color',d.color);
 el('district-details').innerHTML=`<span class="district-category">${FACTIONS[state.faction].name.toUpperCase()} / ${d.kind}</span><h3>${d.name}</h3><p>${d.story}</p><div class="district-benefit">${d.benefit}</div><dl><div><dt>PRESSURE POINT</dt><dd>${d.risk}</dd></div><div><dt>COUNTERPLAY</dt><dd>${d.counter}</dd></div></dl>`;
 el('map-markers').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.district===state.district)));positionMapLabels();
}
function renderMap(){
 const map=SERVERS[state.faction],sites=serverSites(state.faction);el('server-live').hidden=!state.liveWorld;el('map-canvas').hidden=state.liveWorld;el('zoom-out').hidden=el('zoom-in').hidden=el('zoom-value').hidden=el('zoom-reset').hidden=el('labels-toggle').hidden=state.liveWorld;el('live-mode').textContent=state.liveWorld?'Illustration':'Live world';const frameURL=state.view==='world'&&state.liveWorld?'../demo/index.html?preview='+state.faction:'about:blank';if(el('server-live').getAttribute('src')!==frameURL)el('server-live').src=frameURL;state.map=state.faction;el('map-select').value=state.faction;
 el('world-image').src='../servers/assets/'+map.image;el('world-image').alt=`${FACTIONS[state.faction].name}'s own server continent: ${map.geography}`;
 el('map-tag').textContent=map.tag;el('map-name').textContent=map.name;el('map-cells').textContent='Owned by '+FACTIONS[state.faction].name;el('map-focus').textContent=map.geography;
 el('map-rules').innerHTML=`<p>${map.rule}</p><dl><dt>TERRITORY</dt><dd>One laboratory’s own server continent. No shared rival district.</dd><dt>ROUTES</dt><dd>${map.edges.land.length} local road links · ${map.edges.sea.length} local water links · separate uplink transfers</dd></dl>`;
 el('map-markers').innerHTML=sites.map(d=>`<button data-district="${d.id}" aria-label="Inspect ${d.name}" aria-pressed="${d.id===state.district}" style="left:${d.x/SERVER_WORLD.width*100}%;top:${d.y/SERVER_WORLD.height*100}%;--marker:${d.color}"><i></i><span>${d.name}</span></button>`).join('');el('map-markers').hidden=!state.labels;
 el('map-markers').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.district=b.dataset.district;renderDistrict()}));renderDistrict();mapTransform();
}

function renderUnit(){
  const f=FACTIONS[state.faction],u=UNITS[state.faction][state.unit];
  el('entity-art').innerHTML=`<span class="entity-corner">${f.code} / ENTITY ${String(u.index+1).padStart(2,'0')}</span>${sprite(state.faction,u.index)}<span class="entity-size-note"><span>CERAMIC UNIT / ANIMATED</span><span>FOUR-FRAME MOTION CYCLE</span></span>`;
  el('entity-details').innerHTML=`<span class="entity-role">${u.category.toUpperCase()} / ${u.role.toUpperCase()}</span><h2>${u.name}</h2><p>${u.job}</p><div class="entity-statline"><span><small>FUNDS</small>${u.cost}</span><span><small>COMPUTE</small>${u.compute<0?'+'+Math.abs(u.compute):u.compute}</span><span><small>MW</small>${u.power}</span><span><small>INTEGRITY</small>${u.integrity}</span></div><div class="ability"><small>SIGNATURE ABILITY</small><strong>${u.ability}</strong><p>${u.effect}</p><p class="tradeoff">${u.tradeoff}</p></div><div class="counterplay"><small>COUNTERPLAY</small><p>${u.counter}</p></div><div class="unlock"><small>REQUIRES</small><p>${u.unlock}</p></div><button class="lab-link" id="open-systems">Explore the operating model ↗</button>`;
  el('open-systems').addEventListener('click',()=>switchView('systems'));
  el('roster-list').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.unit)===state.unit)));
  el('doctrine-strip').innerHTML=`<div><small>${f.name.toUpperCase()} / DOCTRINE</small><h3>${f.doctrine}</h3></div><div><small>ADVANTAGE & LIABILITY</small><p>${f.strength} ${f.weakness}</p></div><div><small>${f.mechanic.toUpperCase()}</small><p>${f.effect} Initial tuning; faction balance remains untested.</p></div>`;
}
function renderRoster(){
  const units=UNITS[state.faction].filter(u=>state.filter==='All'||u.category===state.filter);
  if(!units.some(u=>u.index===state.unit)&&units.length)state.unit=units[0].index;
  el('roster-list').innerHTML=units.map(u=>`<button data-unit="${u.index}" aria-label="Inspect ${u.name}" aria-pressed="${u.index===state.unit}"><span class="roster-thumb">${sprite(state.faction,u.index)}</span><span><strong>${u.name}</strong><small>${u.role.toUpperCase()}</small></span></button>`).join('');
  el('roster-list').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.unit=Number(b.dataset.unit);renderUnit()}));renderUnit();
}
function renderBuildings(){
  el('building-gallery').innerHTML=STRUCTURES.map((s,i)=>`<button class="building-card" data-building="${i}" aria-pressed="${state.building===i}" aria-label="Inspect ${s.name}">${sprite(state.faction,s.col,true)}<h3>${s.name}</h3><small>${s.cost} FUNDS / ${FACTIONS[state.faction].code}</small></button>`).join('');
  el('building-gallery').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.building=Number(b.dataset.building);renderBuildings()}));
  const s=STRUCTURES[state.building];el('infrastructure-details').innerHTML=`<div><span class="eyebrow">STRUCTURE / OPERATING ROLE</span><h3>${s.name}</h3><p>${s.job}</p></div><div><small>OPERATING DEPENDENCY</small><p>${s.dependency}</p></div><div><small>FAILURE & RECOVERY</small><p>${s.failure}</p></div>`;
}
function pipelineGraphic(m){
  const f=FACTIONS[lab.faction];const rect=(x,y,w,h,label,value,color)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${color}" stroke="#b7c3ac"/><text x="${x+w/2}" y="${y+18}" text-anchor="middle" fill="#60745c" font-family="monospace" font-size="14">${label}</text><text x="${x+w/2}" y="${y+39}" text-anchor="middle" fill="#30462f" font-family="Arial" font-size="18">${value}</text>`;
  return `<svg viewBox="0 0 650 215" role="img" aria-label="Energy and cooling feed compute; compute runs research and inference; inference funds the campus"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 10 5 0 10" fill="#8a9f79"/></marker></defs><path d="M144 53H190V101H222 M144 150H190V108H222 M374 102H410V45H440 M374 108H410V158H440 M532 186V201H298V164" fill="none" stroke="#8a9f79" stroke-width="2" marker-end="url(#arrow)"/>${rect(12,25,132,55,'ENERGY',Math.round(m.supply)+' MW',m.powerFactor<.95?'#efdbcd':'#e6ebd6')}${rect(12,122,132,55,'COOLING',Math.round(m.cooling)+' CAP',lab.heat>65?'#efdbcd':'#dfece4')}${rect(222,67,152,72,'COMPUTE',Math.round(m.effectiveCompute)+' / '+Math.round(m.requested),f.paper)}${rect(440,16,172,56,'RESEARCH',Math.round(m.workers)+' ACTIVE PEOPLE','#e7e3ec')}${rect(440,130,172,56,'INFERENCE',Math.round(m.income*60)+' FUNDS / MIN','#e7ead8')}<text x="298" y="158" text-anchor="middle" fill="${lab.heat>65?'#aa6747':'#698363'}" font-family="monospace" font-size="14">${Math.round(m.powerFactor*100)}% POWER · ${Math.round(m.thermal*100)}% THERMAL CAPACITY</text><text x="298" y="214" fill="#7a8d6d" font-family="monospace" font-size="14">REINVEST IN PEOPLE, POWER AND PLUMBING</text></svg><ul class="pipeline-values" aria-label="Operating dependencies"><li><span>Energy</span><strong>${Math.round(m.supply)} MW</strong></li><li><span>Cooling</span><strong>${Math.round(m.cooling)} capacity</strong></li><li><span>Compute</span><strong>${Math.round(m.effectiveCompute)} / ${Math.round(m.requested)}</strong></li><li><span>Research</span><strong>${Math.round(m.workers)} active people</strong></li><li><span>Inference</span><strong>${Math.round(m.income*60)} funds / min</strong></li></ul>`;
}
function renderSystems(){
  const m=measure(lab),warnings=status(lab);
  el('sim-clock').textContent=time(lab.time);el('run-toggle').textContent=running?'Ⅱ Pause':'▶ Run';el('run-toggle').setAttribute('aria-pressed',String(running));
  const resources=[['FUNDS',format(lab.funds),format(m.income*60)+'/min',false],['COMPUTE',Math.round(m.effectiveCompute)+' / '+Math.round(m.requested),'available / demand',m.effectiveCompute<m.requested],['ENERGY',Math.round(m.supply)+' MW',Math.round(m.desiredPower)+' MW requested',m.powerFactor<.95],['COOLING',Math.round(m.cooling),Math.round(m.served)+' load',lab.heat>65],['PEOPLE',m.workers+' / '+lab.workers,'active / employed',m.workers<lab.workers],['DATA / TRUST',Math.round(lab.quality)+' / '+Math.round(lab.trust),'quality / public trust',lab.quality<80]];
  el('resource-hud').innerHTML=resources.map(([name,value,detail,warning])=>`<div class="${warning?'warning':''}"><small>${name}</small><strong>${value}</strong><em>${detail}</em></div>`).join('');
  el('pipeline').innerHTML=pipelineGraphic(m);el('network-status').textContent=warnings.length?'DEGRADED / '+warnings.length:'ONLINE';el('network-status').style.color=warnings.length?'#ad704b':'#67885a';
  el('heat-caption').textContent=Math.round(lab.heat)+' / 100 / '+(lab.heat>65?'THROTTLED':'NOMINAL');
  const samples=history.length===1?[history[0],history[0]]:history;
  const points=samples.map((v,i)=>`${i*600/Math.max(1,samples.length-1)},${100-v}`).join(' ');
  el('heat-chart').innerHTML=`<path d="M0 35H600" stroke="#c1a98c" stroke-dasharray="4 5"/><text x="4" y="28" fill="#9a7f61" font-family="monospace" font-size="14">THROTTLING THRESHOLD</text><path d="M0 82H600" stroke="#d5ddc7"/><polyline points="${points}" fill="none" stroke="${lab.heat>65?'#b57050':FACTIONS[lab.faction].color}" stroke-width="2"/>`;
  el('lab-warnings').textContent=warnings.length?warnings.join(' · '):'All operating dependencies are available.';el('lab-warnings').classList.toggle('good',!warnings.length);
  el('training-caption').textContent=lab.training?`${Math.round(lab.research)}% / ${m.researchRate.toFixed(2)} progress per second`:'Awaiting a training job';el('training-progress').style.width=(lab.training?lab.research:0)+'%';
  el('train-model').disabled=lab.training||lab.funds<lab.trainingCost;el('cancel-training').disabled=!lab.training;el('model-count').textContent=lab.models+' released model'+(lab.models===1?'':'s');
  for(const key of ['inference','research','security']){el(key+'-value').textContent=lab.allocations[key];el(key+'-range').value=lab.allocations[key]}
  el('allocation-summary').innerHTML=`${Math.round(m.requested)} requested / ${Math.round(m.effectiveCompute)} effective compute<br>${lab.unitCompute} committed to running units<br>${Math.round(m.scheduling*100)}% scheduler throughput${lab.deliveries.length?'<br>Chip delivery in '+Math.ceil(Math.min(...lab.deliveries.map(d=>d.remaining)))+'s':''}`;
  el('upgrade-actions').querySelectorAll('button').forEach(b=>b.disabled=lab.funds<UPGRADES[b.dataset.upgrade].cost);
  el('event-log').innerHTML=lab.log.map(entry=>`<li><time>${time(entry.time)}</time>${entry.text}</li>`).join('');
}
function renderActions(){
  el('upgrade-actions').innerHTML=Object.entries(UPGRADES).map(([id,u])=>`<button data-upgrade="${id}" aria-label="${u.name}, ${u.cost} funds"><strong>${u.name}<span>${u.cost}</span></strong><small>${u.summary}</small></button>`).join('');
  el('upgrade-actions').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{buyUpgrade(lab,b.dataset.upgrade);renderSystems()}));
  el('incident-actions').innerHTML=Object.entries(INCIDENTS).map(([id,i])=>`<button data-incident="${id}" aria-label="Simulate ${i.name}"><strong>${i.name}</strong><small>${i.target.toUpperCase()} / ${i.duration?i.duration+' seconds':'PERSISTENT'}</small></button>`).join('');
  el('incident-actions').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{triggerIncident(lab,b.dataset.incident);renderSystems()}));
}
function switchView(view){state.view=view;if(view!=='systems')running=false;render();el(view+'-view').scrollIntoView({behavior:'instant',block:'start'})}
function render(){
  applyFaction();factionSwitchers();
  for(const view of ['world','units','infrastructure','systems'])el(view+'-view').hidden=state.view!==view;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
  el('view-note').textContent={world:'3 FACTIONS / 3 OWNED SERVER CONTINENTS',units:'24 CORE ENTITIES / 9 SPECIALISTS',infrastructure:'12 ILLUSTRATED STRUCTURES / 8 SHARED ROLES',systems:'LIVE CAUSAL MODEL / BALANCE UNVERIFIED'}[state.view];
  renderMap();renderRoster();renderBuildings();renderSystems();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
el('live-mode').addEventListener('click',()=>{state.liveWorld=!state.liveWorld;renderMap()});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='inspect-server-site'||e.data.server!==state.faction)return;state.district=e.data.id;renderDistrict()});
el('map-select').addEventListener('change',e=>{state.faction=e.target.value;state.zoom=1;state.panX=state.panY=0;lab=createLab(state.faction);running=false;render()});
el('role-filter').addEventListener('change',e=>{state.filter=e.target.value;renderRoster()});
el('zoom-in').addEventListener('click',()=>{state.zoom=Math.min(3,state.zoom+.25);mapTransform()});el('zoom-out').addEventListener('click',()=>{state.zoom=Math.max(1,state.zoom-.25);mapTransform()});el('zoom-reset').addEventListener('click',()=>{state.zoom=1;state.panX=state.panY=0;mapTransform()});
el('labels-toggle').addEventListener('click',()=>{state.labels=!state.labels;el('map-markers').hidden=!state.labels;el('labels-toggle').setAttribute('aria-pressed',String(state.labels));positionMapLabels()});
let drag=null;
el('map-viewport').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,panX:state.panX,panY:state.panY};el('map-viewport').setPointerCapture(e.pointerId);el('map-viewport').classList.add('dragging')});
el('map-viewport').addEventListener('pointermove',e=>{if(!drag)return;state.panX=drag.panX+e.clientX-drag.x;state.panY=drag.panY+e.clientY-drag.y;mapTransform()});
for(const event of ['pointerup','pointercancel'])el('map-viewport').addEventListener(event,()=>{drag=null;el('map-viewport').classList.remove('dragging')});
el('map-viewport').addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(1,Math.min(3,state.zoom+(e.deltaY<0?.1:-.1)));mapTransform()},{passive:false});
window.addEventListener('resize',mapTransform);
for(const key of ['inference','research','security'])el(key+'-range').addEventListener('input',e=>{setAllocation(lab,key,e.target.value);renderSystems()});
el('run-toggle').addEventListener('click',()=>{running=!running;accumulator=0;renderSystems()});el('advance').addEventListener('click',()=>{advance(lab,30);history.push(lab.heat);history=history.slice(-90);renderSystems()});
el('reset-lab').addEventListener('click',()=>{lab=createLab(state.faction);running=false;accumulator=0;history=[lab.heat];renderSystems()});
el('train-model').addEventListener('click',()=>{startTraining(lab);renderSystems()});el('cancel-training').addEventListener('click',()=>{cancelTraining(lab);renderSystems()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;accumulator=0;renderSystems()}});
function frame(t){
  if(state.view==='units'&&!document.hidden&&t-entityFrameTime>125){entityFrameTime=t;entityFrame=(entityFrame+1)%4;const svg=el('entity-art').querySelector('svg');if(svg){const x=entityFrame*887/4,y=state.unit*1774/8;svg.setAttribute('viewBox',`${x} ${y} ${887/4} ${1774/8}`);svg.querySelector('clipPath rect').setAttribute('x',x);}}
  const delta=Math.min(.2,(t-lastFrame)/1000);lastFrame=t;
  if(running){accumulator+=delta;while(accumulator>=.1){tick(lab,.1);accumulator-=.1}if(Math.floor(lab.time)!==lastHistoryTime){lastHistoryTime=Math.floor(lab.time);history.push(lab.heat);history=history.slice(-90);renderSystems()}}
  requestAnimationFrame(frame);
}
el('specialists').innerHTML=SPECIALISTS.map(s=>`<article class="specialist"><h4>${s.name}</h4><small>${s.role.toUpperCase()}</small><p>${s.purpose}</p><p class="counter">${s.counter}</p></article>`).join('');
el('shared-structures').innerHTML=SHARED_STRUCTURES.map(([name,job])=>`<div><h4>${name}</h4><p>${job}</p></div>`).join('');
renderActions();render();requestAnimationFrame(frame);
