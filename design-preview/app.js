const directions = {
  A: { name: 'Blacksite', material: 'WEATHERED MACHINES · BASALT · AMBER GLASS', theme: 'theme-a' },
  B: { name: 'Signal ’97', material: 'PIXEL CLUSTERS · STEEL CONSOLE · ELECTRIC COLOUR', theme: 'theme-b' },
  C: { name: 'Corporate Apocalypse', material: 'CERAMIC GEOMETRY · LIMESTONE · SOFT SHADOWS', theme: 'theme-c' }
};
const factions = {
  misanthropic: { name: 'MISANTHROPIC', symbol: '⬡', color: '#dca167', doctrine: 'Safety through superiority.', type: 'CONTROL / FORTIFY', copy: 'A fortress with a conscience. Shielded machines, layered defences, and the firm conviction that nobody else should be in charge.', units: [
    { name:'CENSURE', cost:900, role:'HEAVY / AREA DENIAL', desc:'Slow armour. Wide control. Makes crossing the line expensive.', hp:1100, supply:5, row:3 },
    { name:'WARDEN', cost:360, role:'LIGHT / ESCORT', desc:'A compact guard vehicle. Protects harvesters and holds the perimeter.', hp:420, supply:2, row:2 },
    { name:'COLLECTOR', cost:300, role:'ECONOMY / HARVESTER', desc:'Extracts data from mineral seams. Needs an escort beyond the walls.', hp:500, supply:3, row:1 },
    { name:'CITADEL', cost:1800, role:'STRUCTURE / HEADQUARTERS', desc:'Nested defensive rings around a compute core. The heart of the laboratory.', hp:4800, supply:0, row:0 }
  ]},
  closed: { name:'CLOSED AI', symbol:'▣', color:'#77c8d7', doctrine:'The future is proprietary.', type:'PRECISION / SCALE', copy:'The immaculate machine. Sealed compute towers and disciplined hover armour. Every weakness is someone else’s access problem.', units:[
    { name:'MONOPOLY', cost:900, role:'HEAVY / DIRECT FIRE', desc:'Concentrated fire from a sealed weapons platform. Built to win the main engagement.', hp:1050, supply:5, row:3 },
    { name:'GATEKEEPER', cost:360, role:'LIGHT / SKIRMISHER', desc:'A fast precision platform. Its clean silhouette hides a dirty job.', hp:380, supply:2, row:2 },
    { name:'EXTRACTOR', cost:300, role:'ECONOMY / HARVESTER', desc:'A sealed mining chassis. Turns contested data into proprietary advantage.', hp:500, supply:3, row:1 },
    { name:'BLACK BOX', cost:1800, role:'STRUCTURE / HEADQUARTERS', desc:'An opaque core inside a precision shell. No one outside knows what happens in there.', hp:4800, supply:0, row:0 }
  ]},
  broke: { name:'BROKE LABS', symbol:'⨯', color:'#b7dc70', doctrine:'Ship first. Survive eventually.', type:'RAID / OVERCLOCK', copy:'A glorious engineering liability. Exposed engines, scavenged armour, and dangerously fast machines that always seem one patch from exploding.', units:[
    { name:'HOTFIX', cost:900, role:'HEAVY / SIEGE', desc:'An oversized improvised gun on an undersized chassis. Hits hard. Needs cover.', hp:900, supply:5, row:3 },
    { name:'REPLY GUY', cost:360, role:'LIGHT / RAIDER', desc:'A loud, fast attacker. Excellent at finding trouble behind enemy lines.', hp:340, supply:2, row:2 },
    { name:'SCRAPER', cost:300, role:'ECONOMY / HARVESTER', desc:'A resource hauler assembled from almost-compatible parts. Surprisingly persistent.', hp:500, supply:3, row:1 },
    { name:'LAUNCH PAD', cost:1800, role:'STRUCTURE / HEADQUARTERS', desc:'A cathedral to shipping before thinking. Its generators are also its warning lights.', hp:4800, supply:0, row:0 }
  ]}
};
const mapData = {
  forked: { name:'Forked Grid', copy:'Two crossings, three laboratories, and a relay worth leaving the safety of your base for. A readable first battlefield with a long flanking route.', facts:[['PLAYERS','2–3 skirmish'],['ECONOMY','Home seams + risky expansions'],['CONTROL','Central compute relay']], waterways:'M190 0 Q280 140 185 250 T220 460', routes:['M118 334 L183 273 L266 253 L305 168 L394 124','M394 124 L402 236 L432 334','M432 334 L300 353 L118 334'], objective:[267,247] },
  thermal: { name:'Thermal Divide', copy:'A fractured cooling field splits the map. Bridge control buys time; the longer perimeter route punishes players who defend only the centre.', facts:[['PLAYERS','2–3 skirmish'],['ECONOMY','Safe home seams, exposed flanks'],['CONTROL','Two bridge approaches']], waterways:'M0 220 Q140 120 260 220 T550 190', routes:['M118 334 L100 201 L222 146 L394 124','M394 124 L425 208 L432 334','M432 334 L309 281 L118 334'], objective:[280,211] },
  cache: { name:'Cache Valley', copy:'Open lanes and generous expansion space. Small armies can raid everywhere, but holding the valley requires a real economy and a flexible defence.', facts:[['PLAYERS','2–3 skirmish'],['ECONOMY','Four contested expansion seams'],['CONTROL','Wide central relay field']], waterways:'M500 0 Q380 130 480 225 T540 460', routes:['M118 334 L160 220 L282 190 L394 124','M394 124 L348 252 L432 334','M432 334 L270 342 L118 334'], objective:[270,236] }
};
const state = { direction:'A', faction:'misanthropic', view:'battlefield', category:'units', unit:0, map:'forked' };
const el = id => document.getElementById(id);

function tacticalMap(map='forked', small=false) {
  const m = mapData[map];
  const light = state.direction === 'C';
  const ground=light?'#d5dec7':'#1e3025', line=light?'#b1c0a5':'#304932', water=light?'#9dbfba':'#142426', route=light?'#778d6d':'#667e53', text=light?'#344b32':'#c7d3b5';
  return `<svg viewBox="0 0 550 460" role="img" aria-label="${m.name} tactical layout proposal"><defs><pattern id="grid${small?'s':'l'}" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="${line}" stroke-width=".7"/></pattern></defs><rect width="550" height="460" fill="${ground}"/><rect width="550" height="460" fill="url(#grid${small?'s':'l'})"/><path d="${m.waterways}" fill="none" stroke="${water}" stroke-width="45"/><path d="M45 85 104 56 146 88 135 137 79 133Z M315 376 344 390 362 430 298 439 283 414Z M444 44 490 35 523 75 498 94 464 83Z" fill="${line}" opacity=".7"/>${m.routes.map(p=>`<path d="${p}" fill="none" stroke="${route}" stroke-width="${small?4:2}" stroke-dasharray="8 6"/>`).join('')}<path d="M170 275 208 244 M170 160 211 170" stroke="${light?'#bcaa89':'#8c8562'}" stroke-width="12"/>${[[118,334,'#dfa16c','MISANTHROPIC'],[394,124,'#75bccb','CLOSED AI'],[432,334,'#b8d172','BROKE LABS']].map(([x,y,c,n])=>`<circle cx="${x}" cy="${y}" r="34" fill="${c}" opacity=".09" stroke="${c}" stroke-width="2"/><rect x="${x-9}" y="${y-9}" width="18" height="18" fill="${c}"/>${!small?`<text x="${x}" y="${y+55}" text-anchor="middle" fill="${text}" font-family="monospace" font-size="9">${n}</text>`:''}`).join('')}${[[95,292],[373,164],[398,346],[298,310],[250,115],[130,205],[323,376]].map(([x,y])=>`<path d="M${x} ${y-8}l9 8-9 8-9-8z" fill="${light?'#88a567':'#a4bc76'}"/>`).join('')}<path d="M${m.objective[0]} ${m.objective[1]-17}l17 17-17 17-17-17z" fill="none" stroke="${light?'#87704f':'#e3dcb0'}" stroke-width="3"/>${!small?`<text x="${m.objective[0]}" y="${m.objective[1]+36}" text-anchor="middle" fill="${text}" font-family="monospace" font-size="8">COMPUTE RELAY</text><text x="18" y="23" fill="${text}" font-family="monospace" font-size="8">LAYOUT STUDY / NOT TO SCALE</text>`:''}</svg>`;
}
function renderUnits() {
  const f = factions[state.faction];
  const col = ['misanthropic','closed','broke'].indexOf(state.faction);
  const visible = state.category === 'structures' ? [3] : [0,1,2,3];
  const [sheetWidth,sheetHeight]=state.direction==='A'?[1536,1024]:[1672,941];
  el('unit-grid').innerHTML = visible.map(i=>{const u=f.units[i];return `<button class="unit-card" data-unit="${i}" aria-label="Inspect ${u.name}" aria-pressed="${state.unit===i}"><span class="unit-thumb"><svg viewBox="${col*sheetWidth/3} ${u.row*sheetHeight/4} ${sheetWidth/3} ${sheetHeight/4}" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><image href="assets/${state.direction}-assets.png" width="${sheetWidth}" height="${sheetHeight}"/></svg></span><span class="unit-card-label"><span>${u.name}</span><b>${u.cost}</b></span></button>`}).join('');
  document.querySelectorAll('[data-unit]').forEach(button=>button.addEventListener('click',()=>{state.unit=Number(button.dataset.unit);renderUnits()}));
  const u=f.units[state.unit];
  el('unit-role').textContent=u.role;
  el('unit-name').textContent=u.name;
  el('unit-description').textContent=u.desc;
  el('unit-stats').innerHTML=`<span>HP <b>${u.hp}</b></span><span>SUP <b>${u.supply}</b></span><span>CR <b>${u.cost}</b></span>`;
}
function renderFactions() {
  el('faction-list').innerHTML=Object.entries(factions).map(([id,f])=>`<button class="faction-row" data-faction="${id}" aria-pressed="${state.faction===id}" style="--row-color:${f.color}" aria-label="Preview ${f.name} faction"><span class="faction-symbol" aria-hidden="true">${f.symbol}</span><span><strong>${f.name}</strong><small>${f.copy}</small></span><span class="faction-type">${f.type.replace(' / ','<br>')}</span></button>`).join('');
  document.querySelectorAll('[data-faction]').forEach(b=>b.addEventListener('click',()=>{state.faction=b.dataset.faction;render();el('stage').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'})}));
}
function renderMap() {
  const m=mapData[state.map];
  el('map-title').textContent=m.name;
  el('map-summary').textContent=m.copy;
  el('map-diagram').innerHTML=tacticalMap(state.map);
  el('map-facts').innerHTML=m.facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  el('minimap').innerHTML=tacticalMap('forked',true);
}
function render() {
  const d=directions[state.direction],f=factions[state.faction];
  el('stage').className=`stage ${d.theme} faction-${state.faction}`;
  el('stage').setAttribute('aria-label',`${d.name} ${state.view} preview`);
  el('battlefield-art').src=`assets/${state.direction}-battlefield.png`;
  el('battlefield-art').alt=`${d.name} concept: three rival AI laboratories on the Forked Grid map`;
  el('asset-art').src=`assets/${state.direction}-assets.png`;
  el('asset-art').alt=`${d.name}: headquarters, harvesters, light and heavy combat vehicle concepts for three factions`;
  el('direction-caption').textContent=`${state.direction} / ${d.name.toUpperCase()}`;
  el('asset-direction').textContent=`${state.direction} / ${d.name.toUpperCase()}`;
  el('direction-material').textContent=d.material;
  el('hud-faction').textContent=f.name;
  document.querySelectorAll('.faction-mark,.selection-icon').forEach(x=>x.textContent=f.symbol);
  el('hud-doctrine').textContent=f.doctrine;
  for(const name of ['battlefield','assets','maps']) el(`${name}-view`).hidden=state.view!==name;
  document.querySelectorAll('[data-direction]').forEach(x=>{const selected=x.dataset.direction===state.direction;x.setAttribute('aria-pressed',String(selected));x.classList.toggle('active',selected)});
  document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.view===state.view)));
  document.querySelectorAll('[data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.category===state.category)));
  el('preview-label').textContent={battlefield:'CONCEPT ART + INTERACTIVE HUD',assets:'CONCEPT PLATES / NOT ANIMATED SPRITES',maps:'TACTICAL LAYOUT PROPOSALS'}[state.view];
  el('review-choice').textContent=`Your preference: ${state.direction} / ${d.name}`;
  el('direction-select').value=state.direction;
  renderUnits();renderFactions();renderMap();
}
document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>{state.direction=button.dataset.direction;render();el('stage').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'})}));
el('direction-select').addEventListener('change',e=>{state.direction=e.target.value;render()});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;render()}));
document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{state.category=button.dataset.category;state.unit=state.category==='structures'?3:0;renderUnits();document.querySelectorAll('[data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.category===state.category)))}));
el('map-select').addEventListener('change',e=>{state.map=e.target.value;renderMap()});
el('review-open').addEventListener('click',()=>{el('feedback-status').textContent='Saves locally for the next design pass.';el('review-dialog').showModal()});
el('review-close').addEventListener('click',()=>el('review-dialog').close());
el('review-dialog').addEventListener('click',e=>{if(e.target===el('review-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
el('review-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;
  try {const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferred:state.direction,faction:state.faction,overall:el('feedback').value})});if(!response.ok)throw new Error('Save failed');el('feedback-status').textContent=`Saved: ${directions[state.direction].name}. Tell me here when you’re ready for the next pass.`;} catch {el('feedback-status').textContent='Could not save. Please share your choice and notes in the chat.';} finally{button.disabled=false}
});
el('expand-preview').addEventListener('click',async()=>{
  if(document.fullscreenElement){await document.exitFullscreen();return}
  if(el('stage').requestFullscreen){try{await el('stage').requestFullscreen();return}catch{}}
  document.body.classList.toggle('expanded');el('expand-preview').textContent=document.body.classList.contains('expanded')?'Collapse preview ↙':'Expand preview ↗';
});
document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();state.view='battlefield';render();window.scrollTo({top:0,behavior:'smooth'})});
render();
