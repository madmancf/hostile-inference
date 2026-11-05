import { FACTIONS, UNITS } from '../v2/world.js';
import { WORLD, ROLES, SERVERS, launchRaid, returnHome, viewServer, createGame, tickGame, deploy, cancelDeployment, command, ability, point, distance, compute } from './engine.js';
import { LiveWorld } from '../servers/live-world.js';
import { serverSites } from '../servers/territories.js';

const $=id=>document.getElementById(id),canvas=$('world'),overlay=$('world-overlay'),ctx=overlay.getContext('2d'),mini=$('minimap'),mc=mini.getContext('2d');
const live=new LiveWorld(canvas);
const images={},rects={},motionRects={},selected=new Set(),camera={x:800,y:441,zoom:1.1};
let game=createGame(),lastServer='misanthropic',chosen='misanthropic',started=false,showcase=false,cinematic=false,drag=null,hover=null,last=0,accumulator=0,uiClock=0,toastUntil=0,renderTime=0,lastLog='',resultShown=false,audio=null,sound=false,lastAudio=0,helpPaused=false;
let width=0,height=0,scale=1,dpr=1,thumbId=0,needsDraw=true;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

function imageLoad(key,url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[key]=img;resolve(img)};img.onerror=()=>reject(new Error('Unable to load '+url));img.src=url;});}
function bounds(img,cols,rows){
 const off=document.createElement('canvas');off.width=img.width;off.height=img.height;const c=off.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0);const data=c.getImageData(0,0,img.width,img.height).data,results=[];
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x0=Math.floor(col*img.width/cols),x1=Math.floor((col+1)*img.width/cols),y0=Math.floor(row*img.height/rows),y1=Math.floor((row+1)*img.height/rows);let left=x1,right=x0,top=y1,bottom=y0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[(y*img.width+x)*4+3]>45){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  results.push({x:Math.max(x0,left-4),y:Math.max(y0,top-4),w:right-left+9,h:bottom-top+9});
 }return results;
}
function thumb(faction,index){const r=rects[faction][index],id='demo-thumb-'+thumbId++;return `<svg viewBox="${r.x} ${r.y} ${r.w} ${r.h}" aria-hidden="true"><defs><clipPath id="${id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath></defs><image clip-path="url(#${id})" href="../v2/assets/${faction}-units-v2.png" width="${images[faction].width}" height="${images[faction].height}"/></svg>`;}
function resize(){needsDraw=true;const box=canvas.getBoundingClientRect();width=box.width;height=box.height;dpr=Math.min(devicePixelRatio||1,2);overlay.width=Math.round(width*dpr);overlay.height=Math.round(height*dpr);live.resize(width,height);scale=Math.max(width/WORLD.width,height/WORLD.height)*camera.zoom;}
function screen(p){return live.project(p);}
function world(p){return live.unproject(p);}
function pointer(event){const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}

function setCamera(x,y,zoom=camera.zoom){camera.x=Math.max(200,Math.min(1472,x));camera.y=Math.max(170,Math.min(820,y));camera.zoom=Math.max(.45,Math.min(3.2,zoom));resize();}
function notify(text){$('toast').textContent=text;$('toast').hidden=false;toastUntil=performance.now()+3500;}
function unitHit(p){const hit=live.pick(screen(p));return hit?.unit?game.units.find(u=>u.id===hit.unit&&u.server===game.activeServer&&!u.transit):null;}
function siteHit(p){const hit=live.pick(screen(p));return hit?.site?serverSites(game.activeServer).find(s=>s.id===hit.site):serverSites(game.activeServer).find(s=>distance(p,s)<55);}

function select(ids,add=false){if(!add)selected.clear();for(const id of ids)if(game.units.some(u=>u.id===id&&u.server===game.activeServer&&!u.transit))selected.add(id);renderUI();}
function fieldOrder(kind){
 const units=game.units.filter(u=>u.team==='player'&&u.server===game.faction&&!u.transit&&(kind==='research'?u.role==='researcher':kind==='harvest'?u.role==='harvester':ROLES.find(r=>r.key===u.role).domain==='sea'));
 if(!units.length){notify('Deploy a suitable unit at home first.');return;}
 command(game,units.map(u=>u.id),kind,kind==='research'?'lab':kind==='harvest'?'grid':'intake');select(units.map(u=>u.id));notify(kind==='research'?'Home researchers → validation lab':kind==='harvest'?'Home harvesters → battery loop':'Home fleet → cooling intake');
}
function orderAt(p){
 if(!started||game.result||game.paused||!selected.size)return;
 const enemy=unitHit(p);if(enemy&&enemy.team!=='player'){command(game,[...selected],'attack',enemy.id);notify('Target acquired. Inference pressure engaged.');return;}
 const site=siteHit(p);let count=0;
 for(const id of selected){const u=game.units.find(u=>u.id===id);if(!u)continue;
  let kind='move',destination=p;if(site){destination=site.id;if(site.id==='grid'&&u.role==='harvester')kind='harvest';if(site.id==='intake'&&['cooler','cloud'].includes(u.role))kind='cool';if(site.id==='lab'&&u.role==='researcher'&&u.server===game.faction)kind='research';if(site.id==='campus'&&u.server!==game.faction)kind='siege';}
  count+=command(game,[id],kind,destination);
 }
 if(count){game.effects.push({server:game.activeServer,x:p.x,y:p.y,color:FACTIONS[game.faction].color,life:.7,max:.7,ring:true});notify(site?'Order → '+site.name:'Route order confirmed.');}else notify('This unit needs a route in its own movement layer.');
}
function setPause(value){if(!started||game.result)return;game.paused=value;$('pause').textContent=value?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(value));$('pause-overlay').hidden=!value;last=performance.now();}
function setCinematic(value){cinematic=value;document.body.classList.toggle('cinematic',value);$('camera-mode').setAttribute('aria-pressed',String(value));$('exit-camera').hidden=!value;$('scene-caption').hidden=!value;if(value){const p=point('campus',game.activeServer);camera.zoom=1.35;camera.x=p.x;camera.y=p.y;}resize();}
function audioPulse(){if(!sound||!audio||audio.state!=='running'||performance.now()-lastAudio<110)return;lastAudio=performance.now();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(280+game.effects.length*12,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(90,audio.currentTime+.09);gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.13);}
function start(watch=false){
 chosen=$('faction-options').querySelector('[aria-pressed=true]')?.dataset.faction||chosen;game=createGame(chosen,$('relaxed').checked?'relaxed':'standard');started=true;showcase=watch;resultShown=false;selected.clear();selected.add(game.units[0].id);$('briefing').close();$('result').close();setPause(false);renderRoster();lastServer=game.faction;const region=SERVERS[game.faction];setCamera(region.camera[0]*WORLD.width,region.camera[1]*WORLD.height,.95);renderNetwork();last=performance.now();accumulator=0;lastLog='';
 if(watch){fieldOrder('research');fieldOrder('harvest');fieldOrder('cool');setCinematic(true);notify('SERVER SIEGE · build at home, breach a rival');}else notify('Your own continent is online. Start home logistics, then choose a rival server to attack.');renderUI();canvas.focus({preventScroll:true});
}
function renderNetwork(){
 $('server-navigation').innerHTML=[game.faction,...game.enemies].map(id=>`<button data-server="${id}" aria-label="${id===game.faction?'Home server — '+FACTIONS[id].name:'Attack '+FACTIONS[id].name+' server'}"><b>${FACTIONS[id].name}</b><small>${id===game.faction?'YOUR HOME CONTINENT':'UNVISITED / ATTACK TO ENTER'}</small></button>`).join('');
 for(const b of $('server-navigation').querySelectorAll('button'))b.onclick=()=>{const id=b.dataset.server;if(game.visited.includes(id)){viewServer(game,id);needsDraw=true;syncServer();}else{const r=launchRaid(game,id);notify(r.ok?'Field team staging at the home uplink. The rival map opens on arrival.':r.reason);}renderUI();};
 $('rival-target').innerHTML=game.enemies.map(id=>`<option value="${id}">${FACTIONS[id].name}</option>`).join('');
}
function syncServer(){
 if(lastServer===game.activeServer)return;lastServer=game.activeServer;selected.clear();const army=game.units.filter(u=>u.server===game.activeServer&&!u.transit&&u.team==='player');select(army.map(u=>u.id));const p=army.length?{x:army.reduce((n,u)=>n+u.x,0)/army.length,y:army.reduce((n,u)=>n+u.y,0)/army.length}:point('campus',game.activeServer);setCamera(p.x,p.y,1.05);notify(game.activeServer===game.faction?'Returned to your home continent':`Entered ${FACTIONS[game.activeServer].name}'s server continent`);
}
function director(){
 if(!showcase||game.result)return;
 for(const u of game.units.filter(u=>u.team==='player'&&u.server===game.faction&&!u.transit&&!u.raid)){
  if(u.role==='harvester'&&u.order!=='harvest')command(game,[u.id],'harvest','grid');
  else if(['cooler','cloud'].includes(u.role)&&u.order!=='cool')command(game,[u.id],'cool','intake');
  else if(u.role==='researcher'&&u.order==='hold'&&u.locked===0)command(game,[u.id],'research','lab');
 }
 if(!game.queue.length&&game.time>5){const p=game.units.filter(u=>u.team==='player');const wanted=p.filter(u=>u.role==='model').length<2?'model':p.filter(u=>u.role==='firewall').length<2?'firewall':null;if(wanted)deploy(game,wanted);}
 if(game.time>5){const ids=game.units.filter(u=>u.team==='player'&&u.server===game.faction&&!u.transit&&!u.raid&&ROLES.find(r=>r.key===u.role).dps>0).map(u=>u.id);if(ids.length)launchRaid(game,game.attackTarget||game.enemies[0],ids);}
 if(game.quality<92){const r=game.units.find(u=>u.team==='player'&&u.role==='researcher'&&u.abilityCooldown===0);if(r)ability(game,[r.id]);}
 if(cinematic){const army=game.units.filter(u=>u.server===game.activeServer&&!u.transit&&u.team==='player'&&ROLES.find(r=>r.key===u.role).dps>0),base=point('campus',game.activeServer),p=game.time<9?{x:WORLD.width*.48,y:WORLD.height*.46}:army.length?{x:army.reduce((n,u)=>n+u.x,0)/army.length,y:army.reduce((n,u)=>n+u.y,0)/army.length}:base;camera.x+=(p.x-camera.x)*.012;camera.y+=(p.y-camera.y)*.012;camera.zoom+=((game.activeServer===game.faction?1.25:1.55)-camera.zoom)*.012;scale=Math.max(width/WORLD.width,height/WORLD.height)*camera.zoom;}
}
function renderRoster(){
 $('roster').innerHTML=ROLES.map(r=>`<button data-role="${r.key}" title="${r.hint}" aria-label="Deploy ${UNITS[game.faction][r.index].name}, ${UNITS[game.faction][r.index].cost} funds"><small>0${r.index+1}</small>${thumb(game.faction,r.index)}<b>${UNITS[game.faction][r.index].name}</b><em>${UNITS[game.faction][r.index].cost} / ${r.compute} CP</em></button>`).join('');
 for(const b of $('roster').querySelectorAll('button'))b.onclick=()=>{const r=deploy(game,b.dataset.role);if(!r.ok)notify(r.reason);else notify('Deployment queued: '+UNITS[game.faction][ROLES.find(r=>r.key===b.dataset.role).index].name);renderUI();};
}
function time(v){return `${Math.floor(v/60).toString().padStart(2,'0')}:${Math.floor(v%60).toString().padStart(2,'0')}`;}
function renderUI(){
 needsDraw=true;compute(game);document.documentElement.style.setProperty('--accent',FACTIONS[game.faction].color);document.documentElement.style.setProperty('--accent-ink',FACTIONS[game.faction].dark);$('lab-name').textContent=FACTIONS[game.faction].name;$('game-clock').textContent=time(game.time);$('funds').textContent=Math.floor(game.funds);$('energy').textContent=Math.floor(game.energy);$('compute').textContent=`${game.used} / ${game.capacity}`;$('heat').textContent=Math.round(game.heat)+'°';$('heat').style.color=game.heat>70?'#ba4e32':'';$('quality').textContent=Math.round(game.quality)+'%';$('research-bar').style.width=game.progress+'%';$('research-percent').textContent=Math.floor(game.progress)+'% verified';$('campus-integrity').textContent=Math.round(game.campus/10)+'%';
 const server=SERVERS[game.activeServer],target=game.attackTarget;
 $('objective-state').textContent=game.result==='victory'?'SERVER OFFLINE':target?'RAID ACTIVE':'HOME ONLINE';
 $('objective-copy').textContent=target?`Bring ${FACTIONS[target].name}'s campus endpoint offline. Your home harvesters, researchers and cooling fleet keep running while the raid is away.`:'Your own server is online. Start its energy and cooling economy, then choose an opponent to attack through the uplink.';
 $('field-status').textContent=game.activeServer===game.faction?'YOUR HOME SERVER / '+server.name:'RIVAL SERVER / '+FACTIONS[game.activeServer].name;
 document.querySelector('.field-title>span').textContent=FACTIONS[game.activeServer].name.toUpperCase()+' / '+(game.activeServer===game.faction?'YOUR HOME SERVER':'RIVAL SERVER');document.querySelector('.field-title h1').textContent=server.name;
 $('research-percent').textContent=Math.floor(game.progress)+'% endpoint disrupted';$('campus-integrity').textContent=Math.round(game.campus/10)+'%';
 document.querySelector('.briefing-art').style.backgroundImage=`linear-gradient(0deg,#293e36c9,transparent 60%),url('../servers/assets/${SERVERS[game.faction].image}')`;
 document.querySelector('.briefing-art>span').textContent=SERVERS[game.faction].name.toUpperCase();
 for(const button of $('server-navigation').querySelectorAll('button')){const id=button.dataset.server;button.setAttribute('aria-pressed',String(id===game.activeServer));button.querySelector('small').textContent=id===game.faction?'HOME / '+Math.round(game.campus/10)+'% INTEGRITY':game.visited.includes(id)?'VISITED / '+Math.round(game.servers[id].integrity/game.servers[id].maxIntegrity*100)+'% INTEGRITY':game.raids.some(r=>r.player&&r.target===id)?'TRANSFER STAGING / IN FLIGHT':'UNVISITED / ATTACK TO ENTER';}
 $('return-team').disabled=game.activeServer===game.faction||!game.units.some(u=>u.team==='player'&&u.server===game.activeServer&&!u.transit&&!u.raid);
 $('next-wave').textContent=`CONTACT / ${Math.max(0,Math.ceil(game.nextWave-game.time))}s`;
 for(const id of selected)if(!game.units.some(u=>u.id===id&&u.server===game.activeServer&&!u.transit))selected.delete(id);
 const units=game.units.filter(u=>selected.has(u.id));const u=units[0];
 $('selection-name').textContent=units.length>1?units.length+' units selected':u?UNITS[u.faction][ROLES.find(r=>r.key===u.role).index].name:'No field selection';
 $('selection-detail').textContent=units.length>1?'A shared order follows each unit’s movement layer.':u?`${Math.ceil(u.hp)} / ${u.maxHp} integrity · ${u.locked>0?'LOCKED OUT '+Math.ceil(u.locked)+'s':u.infected>0?'INFECTED':u.path.length?'EN ROUTE':u.transit?'TRANSFERRING':u.raid?'UPLINK STAGING':u.order==='research'?'HOME RESEARCH':u.order==='siege'?'SERVER SIEGE':u.order==='cool'?'COOLING ONLINE':u.order==='harvest'?'BATTERY LOOP':'READY'}`:'Click a friendly unit. Right click a site to command.';
 $('ability').disabled=!units.some(u=>['researcher','firewall','model','agent','malware'].includes(u.role)&&u.abilityCooldown<=0&&u.locked===0)||game.funds<60||!!game.result;
 for(const b of $('roster').querySelectorAll('button')){const type=ROLES.find(r=>r.key===b.dataset.role);b.disabled=!!game.result||game.queue.length>=4||game.funds<UNITS[game.faction][type.index].cost||game.used+type.compute>game.capacity;}
 const focusedIndex=Number(document.activeElement?.dataset.queue);$('queue').innerHTML=game.queue.map((q,i)=>`<button data-queue="${i}" aria-label="Cancel ${UNITS[game.faction][ROLES.find(r=>r.key===q.role).index].name} deployment"><i style="transform:scaleX(${1-q.remaining/q.total})"></i><span>${UNITS[game.faction][ROLES.find(r=>r.key===q.role).index].name}</span><span>${Math.ceil(q.remaining)}s ×</span></button>`).join('');
 for(const b of $('queue').querySelectorAll('button'))b.onclick=()=>{cancelDeployment(game,Number(b.dataset.queue));renderUI();};if(Number.isInteger(focusedIndex))$('queue').querySelector(`[data-queue="${focusedIndex}"]`)?.focus({preventScroll:true});
 const event=game.events[0];if(event&&event.text!==lastLog){lastLog=event.text;if(cinematic&&event.text.includes('disruption team'))notify(event.text);$('event-log').innerHTML=game.events.slice(0,4).map(e=>`<li><time>${time(e.time)}</time>${e.text}</li>`).join('');}
 if(game.result&&!resultShown){resultShown=true;
  const win=game.result==='victory';$('result-title').textContent=win?'Rival server offline.':game.result==='timeout'?'The raid window closed.':'Your home server went dark.';$('result-copy').textContent=win?`${FACTIONS[game.faction].name} breached ${FACTIONS[game.attackTarget].name}'s own continent. Home operations stayed online.`:'Stage models, agents and a firewall at your home uplink. Keep home researchers, energy and cooling running while the raid advances.';
  $('result-stats').innerHTML=`<div><small>RUN TIME</small><strong>${time(game.time)}</strong></div><div><small>CONTAINED</small><strong>${game.stats.contained}</strong></div><div><small>DISRUPTED</small><strong>${Math.floor(game.progress)}%</strong></div>`;
  $('scene-caption').querySelector('strong').textContent=win?'Their server went dark. Yours stayed online.':'Every server has a breaking point.';
  if(cinematic)notify(win?'RIVAL SERVER OFFLINE · HOME CONTINENT ONLINE':'THE RAID WINDOW CLOSED');else $('result').showModal();
 }
}
function ellipse(x,y,rx,ry,color,stroke=false){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(stroke){ctx.strokeStyle=color;ctx.stroke();}else{ctx.fillStyle=color;ctx.fill();}}
function label(text,x,y,color='#f8f4e7',ink='#334d3e',size=14){const matrix=ctx.getTransform(),factor=Math.hypot(matrix.a,matrix.b)/dpr,fontSize=Math.max(size,14/factor),padding=9/factor,boxHeight=fontSize+10/factor;ctx.font=`${fontSize}px 'Courier New',monospace`;const w=ctx.measureText(text).width+padding*2;ctx.fillStyle=color;ctx.fillRect(x-w/2,y-boxHeight*.65,w,boxHeight);ctx.fillStyle=ink;ctx.textAlign='center';ctx.fillText(text,x,y+2/factor);}
function draw(){
 if(!images['map-'+game.activeServer])return;live.render(game,camera,selected,renderTime);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 if(!cinematic){for(const site of serverSites(game.activeServer)){const p=live.project(site,.25);if(p.x>30&&p.x<width-30&&p.y>40&&p.y<height-170)label(site.name,p.x,p.y+24,'#f5f1e8ed','#294837',14);}}
 if(drag&&drag.kind==='select'&&Math.hypot(drag.current.x-drag.start.x,drag.current.y-drag.start.y)>6){ctx.fillStyle='#f7f4e62b';ctx.strokeStyle=FACTIONS[game.faction].color;ctx.lineWidth=1;ctx.fillRect(drag.start.x,drag.start.y,drag.current.x-drag.start.x,drag.current.y-drag.start.y);ctx.strokeRect(drag.start.x,drag.start.y,drag.current.x-drag.start.x,drag.current.y-drag.start.y);}
 if(hover&&!drag&&!cinematic){const hit=live.pick(hover),u=hit?.unit?game.units.find(u=>u.id===hit.unit):null,site=hit?.site?serverSites(game.activeServer).find(s=>s.id===hit.site):null;if(u||site)label(u?UNITS[u.faction][ROLES.find(r=>r.key===u.role).index].name:site.name,Math.max(85,Math.min(width-85,hover.x)),Math.max(35,hover.y-45),'#f5f1e7ed','#2d4b3a',14);}
 const map=images['map-'+game.activeServer];mc.drawImage(map,0,0,220,124);for(const u of game.units.filter(u=>u.server===game.activeServer&&!u.transit)){mc.fillStyle=u.team==='player'?FACTIONS[game.faction].color:'#e9eeee';mc.fillRect(u.x/WORLD.width*220-2,u.y/WORLD.height*124-2,4,4);}mc.strokeStyle='#faf4d4';mc.lineWidth=1.5;mc.strokeRect(camera.x/WORLD.width*220-20,camera.y/WORLD.height*124-15,40,30);
}

function frame(now){
 const elapsed=Math.min(.25,(now-(last||now))/1000);last=now;
 if(!game.paused&&!document.hidden)renderTime+=elapsed;
 if(started&&!game.paused&&!document.hidden){accumulator+=elapsed;while(accumulator>=.05){director();tickGame(game,.05);syncServer();accumulator-=.05;}if(game.effects.some(e=>!e.ring))audioPulse();}
 uiClock+=elapsed;if(uiClock>.15&&(needsDraw||started&&!game.paused&&(!game.result||!resultShown))){renderUI();uiClock=0;}
 if(now>toastUntil)$('toast').hidden=true;if(!document.hidden&&(needsDraw||!game.paused)){draw();needsDraw=false;}requestAnimationFrame(frame);
}
canvas.addEventListener('pointerdown',e=>{if(!started||game.paused||game.result)return;if(drag||e.button===2)return;canvas.focus({preventScroll:true});const p=pointer(e);drag={id:e.pointerId,kind:e.button===1?'pan':'select',start:p,current:p,camera:{...camera},add:e.shiftKey};canvas.setPointerCapture(e.pointerId);e.preventDefault();});
canvas.addEventListener('pointermove',e=>{hover=pointer(e);if(drag&&drag.id===e.pointerId){drag.current=hover;if(drag.kind==='pan'){setCamera(drag.camera.x-(hover.x-drag.start.x)/scale,drag.camera.y-(hover.y-drag.start.y)/scale);}}});
canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;canvas.releasePointerCapture(e.pointerId);if(d.kind==='pan')return;const p=pointer(e),moved=Math.hypot(p.x-d.start.x,p.y-d.start.y)>7;if(moved){select(game.units.filter(u=>{const q=screen(u);return u.team==='player'&&u.server===game.activeServer&&!u.transit&&q.x>=Math.min(d.start.x,p.x)&&q.x<=Math.max(d.start.x,p.x)&&q.y>=Math.min(d.start.y,p.y)&&q.y<=Math.max(d.start.y,p.y);}).map(u=>u.id),d.add);}else{const hit=unitHit(world(p));if(hit?.team==='player')select([hit.id],d.add);else orderAt(world(p));}});
canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('pointerleave',()=>hover=null);canvas.addEventListener('contextmenu',e=>{e.preventDefault();orderAt(world(pointer(e)));});
canvas.addEventListener('wheel',e=>{e.preventDefault();const p=pointer(e),before=world(p);camera.zoom=Math.max(.45,Math.min(3.2,camera.zoom*Math.exp(-e.deltaY*.001)));resize();const after=world(p);setCamera(camera.x+before.x-after.x,camera.y+before.y-after.y);},{passive:false});
mini.addEventListener('pointerdown',e=>{const r=mini.getBoundingClientRect();setCamera((e.clientX-r.left)/r.width*WORLD.width,(e.clientY-r.top)/r.height*WORLD.height);});
document.addEventListener('keydown',e=>{if($('briefing').open||$('result').open||$('help').open)return;if(e.target instanceof HTMLInputElement)return;
 if(e.code==='Space'){e.preventDefault();setPause(!game.paused);}if(e.key.toLowerCase()==='c')setCinematic(!cinematic);if(e.key.toLowerCase()==='h')setCamera(point('campus',game.activeServer).x,point('campus',game.activeServer).y,1.4);if(e.key.toLowerCase()==='f')fit();
 if(e.key.toLowerCase()==='e'){const result=ability(game,[...selected]);notify(result.ok?'Field ability activated.':result.reason);}
 if(/^[1-8]$/.test(e.key)){const result=deploy(game,ROLES[Number(e.key)-1].key);if(!result.ok)notify(result.reason);renderUI();}
 if(e.key==='Tab'&&e.target===canvas){e.preventDefault();const units=game.units.filter(u=>u.team==='player'&&u.server===game.activeServer&&!u.transit),current=units.findIndex(u=>selected.has(u.id));if(units.length)select([units[(current+1)%units.length].id]);}
 if(e.key==='Escape'&&cinematic)setCinematic(false);
});
function fit(){const cover=Math.max(width/WORLD.width,height/WORLD.height),contain=Math.min(width/WORLD.width,height/WORLD.height);setCamera(WORLD.width/2,WORLD.height/2,contain/cover);}
$('field-team').onclick=()=>fieldOrder('research');$('attack-server').onclick=()=>{const r=launchRaid(game,$('rival-target').value);notify(r.ok?'Raid staging at your home uplink. The target continent opens after transfer.':r.reason);};$('return-team').onclick=()=>{const r=returnHome(game);notify(r.ok?'Field team staging for return to home.':r.reason);};$('harvest-order').onclick=()=>fieldOrder('harvest');$('cool-order').onclick=()=>fieldOrder('cool');$('ability').onclick=()=>{const r=ability(game,[...selected]);notify(r.ok?'Field ability activated.':r.reason);renderUI();};
$('pause').onclick=()=>setPause(!game.paused);$('resume').onclick=()=>setPause(false);$('zoom-in').onclick=()=>setCamera(camera.x,camera.y,camera.zoom*1.2);$('zoom-out').onclick=()=>setCamera(camera.x,camera.y,camera.zoom/1.2);$('fit').onclick=fit;$('home-camera').onclick=()=>setCamera(point('campus',game.activeServer).x,point('campus',game.activeServer).y,1.4);
$('camera-mode').onclick=()=>setCinematic(!cinematic);$('exit-camera').onclick=()=>setCinematic(false);$('start').onclick=()=>start(false);$('showcase').onclick=()=>start(true);
$('sound').onclick=async()=>{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();sound=!sound;$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound));};
$('replay').onclick=()=>{$('result').close();setCinematic(false);started=false;$('scene-caption').querySelector('strong').textContent='Own your server. Breach theirs.';$('briefing').showModal();};
$('new-run').onclick=()=>{$('result').close();setCinematic(false);started=false;$('scene-caption').querySelector('strong').textContent='Own your server. Breach theirs.';$('briefing').showModal();};
$('result-camera').onclick=()=>{$('result').close();setCinematic(true);};
$('help-button').onclick=()=>{helpPaused=game.paused;setPause(true);$('help').showModal();};$('close-help').onclick=()=>$('help').close();$('help').addEventListener('close',()=>setPause(helpPaused));
$('briefing').addEventListener('cancel',e=>e.preventDefault());
document.addEventListener('visibilitychange',()=>{accumulator=0;last=performance.now();if(document.hidden&&started&&!game.result)setPause(true);});new ResizeObserver(resize).observe($('battlefield'));

try{
 await Promise.all([...Object.keys(SERVERS).map(id=>imageLoad('map-'+id,`../servers/assets/${SERVERS[id].image}`)),...Object.keys(FACTIONS).map(f=>imageLoad(f,`../v2/assets/${f}-units-v2.png`))]);
 for(const f of Object.keys(FACTIONS))rects[f]=bounds(images[f],4,2);
 $('faction-options').innerHTML=Object.entries(FACTIONS).map(([id,f])=>`<button data-faction="${id}" aria-pressed="${id===chosen}" style="--swatch:${f.color}"><i></i>${f.name}<small>${id==='misanthropic'?'Resilient containment':id==='closed'?'Stronger contract income':'Faster, hotter releases'}</small></button>`).join('');
 for(const b of $('faction-options').querySelectorAll('button'))b.onclick=()=>{chosen=b.dataset.faction;for(const button of $('faction-options').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===b));game=createGame(chosen);lastServer=chosen;const region=SERVERS[chosen];setCamera(region.camera[0]*WORLD.width,region.camera[1]*WORLD.height,.95);renderNetwork();renderRoster();renderUI();};
 renderNetwork();renderRoster();resize();renderUI();draw();$('briefing').showModal();requestAnimationFrame(frame);
}catch(e){$('field-status').textContent=e.message;notify('Artwork failed to load. Refresh the local preview.');console.error(e);}

// Local, read-only telemetry for capture tooling and browser verification.
window.addEventListener('beforeunload',()=>live.dispose());
window.hostileDemo={graphics:()=>live.stats(),snapshot:()=>structuredClone({game,selected:[...selected],camera,started,showcase,cinematic,animation:game.units.filter(u=>u.server===game.activeServer&&!u.transit).map(u=>({id:u.id,role:u.role,moving:u.moving,phase:u.animDistance,heading:u.heading}))}),worldToScreen:p=>screen(p)};
