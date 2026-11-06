// Ordinary player inputs only. The commander reads the diagnostic snapshot,
// then selects units and issues the same clicks/right-clicks taught in the game.
export async function commandOperation(page,meta){
const snap=()=>page.evaluate(()=>hostileDemo.snapshot().game);
const act=async(selector,note,options)=>{const el=page.locator(selector);if(await el.isVisible()&&await el.isEnabled()){try{await el.click({...options,timeout:2000});}catch(e){if(selector.includes('[data-unit=')&&await el.count()===0)return false;throw e;}meta.actions[selector]=(meta.actions[selector]||0)+1;return true;}return false;};
async function server(id){const g=await snap();if(g.activeServer!==id)await act('[data-server="'+id+'"]','view '+id);}
async function select(ids){await act('#tab-units');let added=0;for(const id of ids)if(await act('#unit-list [data-unit="'+id+'"]','select '+id,added?{modifiers:['Shift']}:undefined))added++;}
async function aim(unit){await act('#fit');await page.waitForTimeout(120);const p=await page.evaluate(u=>{const r=document.querySelector('#world').getBoundingClientRect(),p=hostileDemo.worldToScreen(u);return {x:r.x+p.x,y:r.y+p.y-6,left:r.x,top:r.y,right:r.right,bottom:r.bottom};},unit);if(p.x>p.left&&p.x<p.right&&p.y>p.top&&p.y<p.bottom){await page.mouse.click(p.x,p.y,{button:'right'});}}
async function technology(g){
 const s=g.infrastructure[g.faction];if(s.project)return;
 const plan=g.faction==='misanthropic'?['cloister','layered-proof','archive','immutable-charter']:g.faction==='closed'?['exchange','latency-market','bureau','network-effects']:['quench','thermal-buffer','foundry','deep-freeze'];
 await act('#tab-systems');
 const buttons=await page.locator('[data-tech]').evaluateAll(es=>es.map(e=>({id:e.dataset.tech,done:e.querySelector('span').textContent==='Completed',cost:parseInt(e.querySelector('strong').textContent)})));
 const next=plan.find(id=>!buttons.find(b=>b.id===id)?.done),item=buttons.find(b=>b.id===next);
 if(next&&g.funds>=item.cost+(g.time<65?0:100)&&(plan.indexOf(next)<2||g.time>180)&&(g.faction!=='broke'||plan.indexOf(next)<2||g.units.filter(u=>u.team==='player'&&u.role==='model').length>=4)){
  const button=page.locator('[data-tech="'+next+'"]'),branch=button.locator('xpath=ancestor::details');
  if(!await branch.evaluate(e=>e.open))await branch.locator('summary').click();
  await act('[data-tech="'+next+'"]','campus project '+next);
 }
}
let g=await snap();if(g.result)return;
 if(!meta.initialized){meta.initialized=true;meta.defenders=g.units.filter(u=>u.team==='player'&&['model','firewall'].includes(u.role)).map(u=>u.id);await act('#operation-action','start home economy');}
 const own=g.units.filter(u=>u.team==='player'&&u.hp>0),local=(id)=>own.filter(u=>u.server===id&&!u.transit&&!u.raid),count=role=>own.filter(u=>u.role===role).length+g.queue.filter(q=>q.role===role).length;
 for(const role of ['researcher','harvester','cooler','cloud']){const worker=local(g.faction).find(u=>u.role===role&&u.order!==(role==='researcher'?'research':role==='harvester'?'harvest':'cool'));if(worker){await server(g.faction);await select([worker.id]);await act(role==='researcher'?'#field-team':role==='harvester'?'#harvest-order':'#cool-order','restart '+role+' economy');}}
 if(g.time-(meta.lastMacro||-20)>=12){
  await technology(g);g=await snap();
  const targets=g.faction==='misanthropic'?{model:4,firewall:3,agent:2,malware:1}:g.faction==='closed'?{model:4,firewall:3,agent:2,malware:1}:{model:5,firewall:2,agent:1,malware:4};
  let want=count('harvester')<2?'harvester':count('cooler')<(g.faction==='broke'&&g.heat>48?2:1)?'cooler':['model','firewall','agent','malware'].filter(r=>count(r)<targets[r]).sort((a,b)=>count(a)/targets[a]-count(b)/targets[b])[0];
  const cp=want?Number((await page.locator('#roster [data-role="'+want+'"] em').textContent()).match(/\/\s*(\d+)\s*CP/)[1]):0;
  if(want&&g.capacity-g.used<cp&&count('cloud')<2)want='cloud';
  const saveForFinal=g.time>190&&!g.infrastructure[g.faction].specialization&&own.filter(u=>u.role==='model').length>=(g.faction==='broke'?4:3)&&!g.operation.homeThreat;
  if(want&&!saveForFinal)await act('#roster [data-role="'+want+'"]','deploy '+want);
  meta.reserve=saveForFinal?(g.faction==='closed'?640:g.faction==='broke'?560:600):want?parseInt(await page.locator('#roster [data-role="'+want+'"] em').textContent()):100;
  meta.lastMacro=g.time;
 }
 g=await snap();
 const team=g.units.filter(u=>u.team==='player'&&u.hp>0),home=team.filter(u=>u.server===g.faction&&!u.transit&&!u.raid);
 for(const role of ['model','firewall'])if(!team.some(u=>meta.defenders.includes(u.id)&&u.role===role)){const u=home.find(u=>u.role===role);if(u)meta.defenders.push(u.id);}
 if(g.faction==='broke'&&g.time>90&&meta.defenders.filter(id=>team.some(u=>u.id===id&&u.role==='model')).length<2){const u=home.find(u=>u.role==='model'&&!meta.defenders.includes(u.id));if(u)meta.defenders.push(u.id);}
 const candidates=home.filter(u=>['model','firewall','agent','malware'].includes(u.role)&&!meta.defenders.includes(u.id)),hasRaid=team.some(u=>u.server===g.operation.rival&&!u.transit&&u.role==='model');
 if(g.time>100&&(candidates.filter(u=>u.role==='model').length>=2&&candidates.length>=4&&candidates.filter(u=>u.role==='firewall').length>=(g.faction==='closed'?2:1)||hasRaid&&candidates.length>=2)&&g.time-(meta.lastTransfer||0)>15){
  await server(g.faction);await select(candidates.map(u=>u.id));
  const selected=await page.evaluate(()=>hostileDemo.snapshot().selected);
  const living=await snap();if(candidates.some(u=>living.units.some(v=>v.id===u.id)&&!selected.includes(u.id))||selected.some(id=>meta.defenders.includes(id)))throw Error('Units panel cannot compose the raid team: '+JSON.stringify({want:candidates.map(u=>u.id),selected}));
  await act('#attack-server','transfer selected raid');meta.lastTransfer=g.time;
 }
 g=await snap();
 // Home defence and an explicit unit target, as taught by the counter exercise.
 const hostiles=g.units.filter(u=>u.team!=='player'&&u.server===g.faction&&!u.transit&&u.hp>0);
 if(hostiles.length&&!g.units.some(u=>u.team==='player'&&u.server===g.faction&&!u.transit&&u.role==='model')&&!g.raids.some(r=>r.player&&r.target===g.faction)){
  const reinforcements=['model','firewall'].map(role=>g.units.find(u=>u.team==='player'&&u.server===g.operation.rival&&!u.transit&&!u.raid&&u.role===role)).filter(Boolean);
  if(reinforcements.length){await server(g.operation.rival);await select(reinforcements.map(u=>u.id));await act('#return-team','recall escort to defend home');meta.defenders.push(...reinforcements.map(u=>u.id));}
 }

 if(hostiles.length){
  await server(g.faction);
  const defenders=g.units.filter(u=>u.team==='player'&&u.server===g.faction&&!u.transit&&!u.raid&&['model','firewall'].includes(u.role));
  const target=hostiles.sort((a,b)=>(a.role==='firewall'?-2:a.role==='malware'?-1:0)-(b.role==='firewall'?-2:b.role==='malware'?-1:0)||a.hp-b.hp)[0];
  if(defenders.length&&defenders.some(u=>u.target!==target.id)){await select(defenders.map(u=>u.id));await aim(target);}
 }
 g=await snap();
 const raiders=g.units.filter(u=>u.team==='player'&&u.server===g.operation.rival&&!u.transit&&!u.raid);
 if(!raiders.length&&g.operation.enteredRival&&g.activeServer===g.operation.rival&&!g.operation.homeThreat){await act('#tab-mission');await act('#operation-action','return to home production after raid loss');}
 if(raiders.length){
  await server(g.operation.rival);
  const relay=raiders.find(u=>u.role==='agent')||raiders.find(u=>u.role==='malware')||raiders.find(u=>u.role==='firewall');
  if(!g.operation.relay.captured&&relay&&relay.order!=='capture'){await select([relay.id]);await act('#tab-mission');await act('#relay-order','capture data relay');}
  if(g.operation.relay.captured&&!meta.relayRallied){await act('#tab-mission');await act('#rally-endpoint','rally after relay');meta.relayRallied=true;}
  const threats=g.units.filter(e=>e.team!=='player'&&e.server===g.operation.rival&&!e.transit&&e.hp>0&&['model','firewall','agent','malware'].includes(e.role)&&raiders.some(u=>u.role==='model'&&Math.hypot(u.x-e.x,u.y-e.y)<175));
  const target=threats.sort((a,b)=>(a.role==='firewall'?-1:0)-(b.role==='firewall'?-1:0)||a.hp-b.hp)[0];
  const fighters=raiders.filter(u=>['model','firewall','malware'].includes(u.role)&&u.order!=='capture');
  if(target&&fighters.length&&fighters.some(u=>u.target!==target.id)){await select(fighters.map(u=>u.id));await aim(target);}
 }
 g=await snap();
 if((g.operation.homeThreat||raiders.length)&&g.funds>(meta.reserve||100)+150&&g.time>=g.operation.doctrineReady){await act('#tab-systems');await act('#doctrine-button','faction doctrine');}
 const ready=g.units.filter(u=>u.team==='player'&&!u.transit&&!u.raid&&!u.locked&&u.abilityCooldown===0);
 for(const u of ready){
  const contact=g.units.some(e=>e.team!=='player'&&e.server===u.server&&!e.transit&&e.hp>0&&Math.hypot(e.x-u.x,e.y-u.y)<125);
  if(u.role==='cooler'&&g.heat>55||!u.moving&&contact&&['model','firewall','agent','malware'].includes(u.role)&&(g.funds>(meta.reserve||100)+60||u.role==='firewall'||u.role==='model'&&['closed','broke'].includes(g.faction))){await server(u.server);await select([u.id]);await act('#ability',u.role+' ability');}
 }

 await act('#tab-mission');
}
