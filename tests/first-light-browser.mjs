// Runs inside contributor-browser's one owned headless browser and disposable server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const snap=page=>page.evaluate(()=>hostileDemo.snapshot());
const click=async(page,id)=>{const el=page.locator(id);if(await el.isVisible()&&await el.isEnabled()){await el.click();return true;}return false;};
async function layout(page,phase){
 for(const [width,height] of [[1280,800],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.clock.fastForward(300);
  const result=await page.evaluate(()=>{const ids=['save-status','lesson-title','lesson-status','lesson-task','lesson-focus',document.getElementById('lesson-next').hidden?'lesson-action':'lesson-next'];return {zoom:visualViewport.scale,overflow:document.documentElement.scrollWidth>innerWidth,boxes:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),style=getComputedStyle(e);let visible=r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;for(let parent=e.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent);if(/auto|scroll|hidden|clip/.test(s.overflowY)){const b=parent.getBoundingClientRect();if(r.top<b.top-1||r.bottom>b.bottom+1)visible=false;}}return {id,visible,x:r.x,y:r.y,bottom:r.bottom,height:r.height,font:parseFloat(style.fontSize)};})};});
  assert.equal(result.zoom,1);assert.equal(result.overflow,false);assert.ok(result.boxes.every(b=>b.visible),phase+' '+width+': '+JSON.stringify(result.boxes));assert.ok(result.boxes.filter(b=>b.id!=='lesson-title').every(b=>b.font>=16),phase+' essential text');assert.ok(result.boxes.filter(b=>['lesson-focus','lesson-action','lesson-next'].includes(b.id)).every(b=>b.height>=44));
 }
 await page.setViewportSize({width:1440,height:900});
}
export async function runFirstLight(page,faction,report){
 await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));page.on('dialog',dialog=>dialog.accept());
 if(process.env.HI_BROWSER_FIRST_LIGHT==='recovery')return recoveryChecks(page,faction,report);
 let current=await snap(page);assert.equal(current.game.tutorial.objectiveId,'campus');
 await layout(page,'campus');
 // Buttons, help and typing must not send hotkeys to the battlefield.
 await page.locator('#lesson-help').focus();const before=await snap(page);await page.keyboard.press('e');await page.keyboard.press('1');assert.equal((await snap(page)).game.funds,before.game.funds);assert.deepEqual((await snap(page)).game.queue,before.game.queue);
 await click(page,'#lesson-help');await click(page,'#return-order');assert.equal(await page.evaluate(()=>document.activeElement.id),'lesson-help');assert.deepEqual((await snap(page)).selected,before.selected);
 let resumed=false,seen=new Set(),lastPhase='',lastTime=0;
 for(let iteration=0;iteration<1500;iteration++){
  current=await snap(page);const g=current.game,t=g.tutorial,p=t.objectiveId;if(g.result){assert.equal(g.result,'victory',faction+' tutorial');break;}assert.equal(t.failure,null,faction+' '+p+': '+t.failure);
  if(p!==lastPhase){lastPhase=p;lastTime=g.time;seen.add(p);console.log('First Light browser '+faction+' · '+p+' · '+Math.round(g.time)+'s');}
  assert.ok(g.time-lastTime<200,faction+' stuck at '+p+': '+await page.locator('#lesson-status').textContent());
  if(p==='build'&&!resumed){
   await layout(page,'technology choice');const before=await snap(page);await click(page,'#new-run');await click(page,'#continue-save');const restored=await snap(page);assert.ok(restored.game.paused);assert.equal(restored.game.faction,faction);assert.equal(restored.game.tutorial.objectiveId,'build');assert.deepEqual(restored.camera,before.camera);await click(page,'#resume');resumed=true;
  }
  if(g.paused){await click(page,'#resume');await page.clock.fastForward(300);continue;}
  if(t.ready){const before=await snap(page);await click(page,'#lesson-next');const after=await snap(page);assert.deepEqual(after.camera,before.camera,'Next preserves camera');assert.deepEqual(after.selected,before.selected,'Next preserves selection');await page.clock.fastForward(300);continue;}
  const branch=p==='build'?0:p==='expand'?1:p==='specialize'?2:null;if(branch!==null){const b=page.locator('[data-tutorial-branch="'+branch+'"]');if(await b.isVisible()&&await b.isEnabled()&&await b.getAttribute('aria-pressed')!=='true')await b.click();}
  await click(page,'#lesson-action');
  if(p==='formation.open'&&t.openingState==='active'||p==='cooling'&&faction==='broke'||p==='formation.finish')await click(page,'#ability');
  await page.clock.fastForward(p==='formation.open'?1000:4000);
 }
 current=await snap(page);assert.equal(current.game.result,'victory',JSON.stringify({faction,phase:current.game.tutorial.objectiveId,ready:current.game.tutorial.ready,time:current.game.time,paused:current.game.paused,status:await page.locator('#lesson-status').textContent()}));assert.equal(seen.size,18);await layoutDebrief(page);assert.ok(await page.locator('#training-operation').isVisible());assert.match(await page.locator('#training-operation').textContent(),new RegExp(faction==='misanthropic'?'Misanthropic':faction==='closed'?'Closed AI':'Broke Labs'));const destination=await page.locator('#training-ranked').getAttribute('href');if(faction==='misanthropic')assert.match(destination,/account/);else assert.equal(new URL(destination,page.url()).searchParams.get('faction'),'closed');if(faction==='broke')assert.match(await page.locator('#training-handoff').textContent(),/allegiance is locked/);assert.ok(!(await page.locator('#result-takeaway').textContent()).includes('won'));
 const graphics=await page.evaluate(()=>hostileDemo.graphics().quality);assert.equal(graphics.shadowSize[0],4096);assert.equal(graphics.reflectionSize[0],2048);assert.equal(graphics.aoSamples,32);
 report.tests.push({firstLight:faction,allMilestones:true,saveResume:true,keyboardIsolation:true,viewports:[1280,1440,1920],graphics,clock:'virtual functional test; not an FPS measurement'});
 // The ordinary practice route remains directly accessible from the tutorial result.
 await click(page,'#training-operation');await page.clock.fastForward(300);assert.ok((await snap(page)).game.operation);assert.equal((await snap(page)).game.tutorial,undefined);
 await completeOperation(page,faction);
 report.tests.push({operation:faction,complete:true,ordinaryUI:true});await recoveryChecks(page,faction,report);
}
async function layoutDebrief(page){for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:width===1280?800:900});const button=page.locator('#training-operation');await button.scrollIntoViewIfNeeded();const r=await button.boundingBox();assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=width&&r.y+r.height<=(width===1280?800:900));}await page.setViewportSize({width:1440,height:900});}
async function completeOperation(page,faction){
 // No director or debug mutation: use the same production, selection, transfer and siege controls as a player.
 let moved=false;
 for(let i=0;i<1100;i++){
  const {game:g}=await snap(page);if(g.result){assert.ok(['victory','defeat','timeout'].includes(g.result));console.log('Operation browser '+faction+' · '+g.result+' · '+Math.round(g.time)+'s');return;}
  if(g.paused){await click(page,'#resume');await page.clock.fastForward(300);continue;}
  if(i%50===0)console.log('Operation progress '+faction+' · '+Math.round(g.time)+'s');
  if(g.time<150)await click(page,'#operation-action');
  if(g.activeServer!==g.faction){moved=true;await click(page,'#rally-endpoint');}
  if(i%10===0&&g.funds>1000){await click(page,'[data-role="model"]');await click(page,'#select-combat');}
  if(moved&&g.activeServer===g.faction&&i%15===0)await click(page,'#operation-action');
  await page.clock.fastForward(5000);
 }
 throw Error(faction+' operation did not terminate');
}

async function recoveryChecks(page,faction,report){
 const fixtures=JSON.parse(await fs.readFile('output/playwright/first-light-checkpoints.json','utf8'));
 const envelope=fixtures.find(x=>x.faction===faction&&x.phase==='formation.open').envelope;
 envelope.failure={outcome:'defeat',runId:envelope.runId,objectiveId:envelope.record.game.tutorial.objectiveId};
 const hostile='<img src=x onerror="window.savedTextExecuted=true">';envelope.record.game.events=[{time:0,text:hostile}];
 await page.evaluate(e=>{localStorage.setItem('hostile-inference.tutorial-save.v3',JSON.stringify(e));localStorage.removeItem('hostile-inference.local-save.v1');},envelope);
 const base=new URL(page.url()).origin;await page.clock.resume();await page.goto(base+'/demo/index.html');await page.locator('#loading').waitFor({state:'hidden',timeout:90000});await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await click(page,'#continue-save');await page.clock.fastForward(300);
 assert.ok((await snap(page)).game.paused);assert.match(await page.locator('#lesson-status').textContent(),/HI_ENCOUNTER_FAILED/);
 assert.ok((await page.locator('#event-log').textContent()).includes(hostile));assert.equal(await page.locator('#event-log img').count(),0);assert.equal(await page.evaluate(()=>window.savedTextExecuted),undefined);
 await layout(page,'paused recovery');
 const before=await snap(page),bytes=await page.evaluate(()=>localStorage.getItem('hostile-inference.tutorial-save.v3'));
 // Another same-origin tab can inspect state but cannot become a second writer.
 const peer=await page.context().newPage();
 try{await peer.route('**/first-light-lock-check',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage ownership check</title>'}));await peer.goto(base+'/first-light-lock-check');
  const result=await peer.evaluate(async e=>{const {LocalArchive}=await import('/demo/local-archive.js');const archive=new LocalArchive(localStorage);const owned=await archive.claim();const saved=archive.save(e.record.game,e.record.meta);archive.release();return {owned,saved,code:archive.errorCode,bytes:localStorage.getItem('hostile-inference.tutorial-save.v3')};},envelope);
  assert.equal(result.owned,false);assert.equal(result.saved,false);assert.equal(result.code,'HI_SAVE_BUSY');assert.equal(result.bytes,bytes);
 }finally{await peer.close();}
 page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());await click(page,'#lesson-action');assert.deepEqual((await snap(page)).game,before.game,'Cancel retry keeps live state');
 page.on('dialog',d=>d.accept());await click(page,'#lesson-action');const recovered=await snap(page);assert.ok(recovered.game.paused);assert.equal(recovered.game.tutorial.failure,null);assert.equal(recovered.game.funds,envelope.checkpoint.game.funds);assert.equal(recovered.game.time,envelope.checkpoint.game.time);await layout(page,'recovered paused');
 await page.evaluate(()=>{window.restoreStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='hostile-inference.tutorial-save.v3')throw new DOMException('Synthetic quota failure','QuotaExceededError');return window.restoreStorageWrite.call(this,key,value);};});
 try{await click(page,'#pause');await page.clock.fastForward(300);await click(page,'#pause');assert.match(await page.locator('#save-status').textContent(),/HI_STORAGE_UNAVAILABLE/);await layout(page,'persistent storage warning');}finally{await page.evaluate(()=>{Storage.prototype.setItem=window.restoreStorageWrite;delete window.restoreStorageWrite;});}

 const profiler=await page.context().newCDPSession(page);await profiler.send('Page.enable');const {frameTree}=await profiler.send('Page.getFrameTree');const world=await profiler.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'first-light-native-timing'});
 const expression='('+String(async e=>{const {LocalArchive}=await import(location.origin+'/demo/local-archive.js');const m=new Map(),archive=new LocalArchive({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}),values=[];for(let i=0;i<35;i++){const start=performance.now();if(!archive.prepareCheckpoint(e.record.game,e.record.meta,'Defend preparation'))throw Error(archive.errorCode);if(!archive.restoreCheckpoint(e.record.game,e.runId))throw Error(archive.errorCode);if(i>=5)values.push(performance.now()-start);}values.sort((a,b)=>a-b);return {p95:values[28],max:values[29],samples:30};})+')('+JSON.stringify(envelope)+')';
 let timings;try{const measured=await profiler.send('Runtime.evaluate',{contextId:world.executionContextId,expression,awaitPromise:true,returnByValue:true});assert.equal(measured.exceptionDetails,undefined);timings=measured.result.value;assert.ok(timings.max>0,'Native isolated clock must record real CPU time');}finally{await profiler.detach();}
 report.tests.push({recovery:faction,reload:true,pausedRetry:true,cancel:true,literalSavedText:true,secondTabOwnership:true,checkpointMainThreadMs:timings});
 console.log('PASS '+faction+' reload, paused/cancelled retry, literal saved text and second-tab ownership');
}
