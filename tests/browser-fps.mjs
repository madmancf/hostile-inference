// Real-clock, full-quality qualification. No virtual time, hidden-tab override,
// autoplay director, simulation injection, or user browser/profile is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {commandOperation} from './fps-commander.mjs';

process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const factions=['misanthropic','closed','broke'];
const selected=process.env.HI_FPS_FACTION?[process.env.HI_FPS_FACTION]:factions;
assert.ok(selected.every(f=>factions.includes(f)),'Unknown faction');
const seconds=Number(process.env.HI_FPS_SECONDS||0);
assert.ok(Number.isFinite(seconds)&&seconds>=0&&seconds<=900);
const viewport={width:2382,height:1383},deviceScaleFactor=2;
// A 60-Hz display often reports 59.94 Hz. Keep the tolerance explicit and also
// reject hitches and poor frame pacing; a mean alone cannot pass this gate.
const budget={meanFPS:59.5,p95FrameMsUpperBound:17.5,p99FrameMsUpperBound:25,
  minimumCompleteSecond:55,maximumGapMs:100,gapsOver100ms:0};
const coverageBudget={deployed:10,contained:10,transfers:1,visibleCombatObservations:30,viewedServers:2};
const stamp=new Date().toISOString().replace(/[.:]/g,'-');
const output=path.resolve('output/playwright/fps-'+stamp);
await fs.mkdir(output,{recursive:true});
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hi-fps-'));
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port;await new Promise(r=>probe.close(r));
const base='http://127.0.0.1:'+port;
const sourceFiles=execFileSync('git',['ls-files','game','api'],{encoding:'utf8'}).trim().split('\n');
async function fingerprint(){const hash=createHash('sha256');for(const file of sourceFiles){hash.update(file+'\0');hash.update(await fs.readFile(file));}return hash.digest('hex');}
async function harnessFingerprint(){return createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).update(await fs.readFile(new URL('./fps-commander.mjs',import.meta.url))).digest('hex');}
const harnessSHA256=await harnessFingerprint();
const report={harnessSHA256,requestedSeconds:seconds||null,status:'running',scope:'headless Chrome for Testing, real clock, UI-driven practice; not a foreground-display or cross-device certificate',
  startedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceFingerprint:await fingerprint(),
  mode:seconds?'bounded probe':'complete operations',budget,coverageBudget,viewport,deviceScaleFactor,zoom:1,
  hardware:{cpu:os.cpus()[0].model,cores:os.cpus().length,memoryGiB:os.totalmem()/2**30},
  runs:[],errors:[],resourceErrors:[],load:[]};
let browser,server,serverLog='',interrupted=false;
const write=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function teardown(){await browser?.close().catch(()=>{});if(server&&server.exitCode===null&&server.signalCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');const timer=setTimeout(()=>server.kill('SIGKILL'),10000);try{await done;}finally{clearTimeout(timer);}}}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{interrupted=true;void teardown();});
function quality(q){assert.equal(q.pixelRatio,2);assert.equal(q.shadowSize[0],4096);assert.equal(q.reflectionSize[0],2048);assert.equal(q.aoSamples,32);assert.equal(q.bloomStrength,.16);assert.deepEqual(q.buffer,q.cssSize.map(n=>Math.round(n)*2),'Battlefield must render at full native DPR');}
function verdict(m){return m.meanFPS>=budget.meanFPS&&m.p95FrameMsUpperBound<=budget.p95FrameMsUpperBound&&m.p99FrameMsUpperBound<=budget.p99FrameMsUpperBound&&m.minimumCompleteSecond>=budget.minimumCompleteSecond&&m.maximumGapMs<=budget.maximumGapMs&&m.gapsOver100ms===0;}
try{
  server=spawn(process.execPath,['game/server.mjs'],{env:{PATH:process.env.PATH,HOSTILE_PREVIEW_PORT:String(port),HI_PREVIEW_DATA_DIR:tmp},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Isolated FPS server did not start')),15000);for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{serverLog=(serverLog+b).slice(-2000);if(serverLog.includes('BOARD_URL:')){clearTimeout(timer);resolve();}});server.once('error',reject);});
  browser=await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true,args:process.platform==='darwin'?['--use-angle=metal']:[]});
  report.browser=browser.version();const system=await browser.newBrowserCDPSession();
  const info=await system.send('SystemInfo.getInfo');report.gpu={devices:info.gpu.devices.map(d=>({vendor:d.vendorString,device:d.deviceString})),renderer:info.gpu.auxAttributes?.glRenderer,featureStatus:info.gpu.featureStatus};await system.detach();
  assert.ok(report.gpu.renderer&&!/swiftshader|llvmpipe|software/i.test(report.gpu.renderer),'Hardware graphics required');
  console.log('FPS_OUTPUT: '+output);console.log(JSON.stringify({browser:report.browser,gpu:report.gpu.renderer,viewport,budget}));
  for(const faction of selected){
    if(interrupted)throw Error('Interrupted');
    const rival=factions[(factions.indexOf(faction)+1)%3];
    const context=await browser.newContext({viewport,deviceScaleFactor});
    try{
      const page=await context.newPage();page.setDefaultTimeout(15000);
      page.on('pageerror',error=>report.errors.push({faction,message:error.message.slice(0,300)}));
      page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)report.resourceErrors.push({faction,path:new URL(r.url()).pathname,status:r.status()});});
      await page.goto(base+'/demo/index.html?faction='+faction+'&rival='+rival);
      await page.locator('#loading').waitFor({state:'hidden',timeout:120000});
      assert.equal(await page.evaluate(()=>document.visibilityState),'visible');
      await page.evaluate(()=>{window.fpsObservation={tasks:[],visibility:[]};new PerformanceObserver(list=>{for(const e of list.getEntries())fpsObservation.tasks.push({start:e.startTime,duration:e.duration});fpsObservation.tasks=fpsObservation.tasks.slice(-60);}).observe({type:'longtask'});document.addEventListener('visibilitychange',()=>fpsObservation.visibility.push({at:performance.now(),state:document.visibilityState}));});
      quality(await page.evaluate(()=>({...hostileDemo.graphics().quality,cssSize:[document.getElementById('world').getBoundingClientRect().width,document.getElementById('world').getBoundingClientRect().height]})));
      await page.locator('#start').click();
      await page.evaluate(()=>{
        fpsObservation.workload={observations:0,visibleCombatObservations:0,maxVisibleUnits:0,maxUnits:0,viewedServers:[]};
        setInterval(()=>{
          const g=hostileDemo.snapshot().game;if(g.paused||g.result)return;
          const w=fpsObservation.workload,visible=g.units.filter(u=>u.server===g.activeServer&&!u.transit);
          w.observations++;w.maxUnits=Math.max(w.maxUnits,g.units.length);w.maxVisibleUnits=Math.max(w.maxVisibleUnits,visible.length);
          if(visible.some(u=>u.shot>0)||g.effects.some(e=>e.server===g.activeServer&&e.sourceId))w.visibleCombatObservations++;
          if(!w.viewedServers.includes(g.activeServer))w.viewedServers.push(g.activeServer);
        },1000);
      });
      const started=performance.now(),run={faction,rival,samples:[],outcome:null,complete:false};report.runs.push(run);
      let lastSample=-20;const commander={actions:{}};
      for(;;){
        if(interrupted)throw Error('Interrupted');
        const state=await page.evaluate(()=>{const g=hostileDemo.snapshot().game;return {time:g.time,paused:g.paused,result:g.result,server:g.activeServer,funds:g.funds,units:g.units.length,stats:g.stats,progress:g.progress,workload:fpsObservation.workload};});
        assert.equal(state.paused,false,'Unintentional pause invalidates a real-clock run');
        if(state.time-lastSample>=15||state.result){
          const data=await page.evaluate(()=>({performance:hostileDemo.performance(),quality:{...hostileDemo.graphics().quality,cssSize:[document.getElementById('world').getBoundingClientRect().width,document.getElementById('world').getBoundingClientRect().height]},drawCalls:hostileDemo.graphics().drawCalls,visibility:document.visibilityState,zoom:visualViewport.scale}));
          quality(data.quality);assert.equal(data.visibility,'visible');assert.equal(data.zoom,1);
          const sample={wallSeconds:(performance.now()-started)/1000,...state,...data};run.samples.push(sample);lastSample=state.time;report.load.push({at:new Date().toISOString(),load:os.loadavg()});
          console.log(JSON.stringify({faction,seconds:Math.round(state.time),fps:data.performance.meanFPS,p95:data.performance.p95FrameMsUpperBound,p99:data.performance.p99FrameMsUpperBound,hitches:data.performance.gapsOver100ms,server:state.server,stats:state.stats,combatObservations:state.workload.visibleCombatObservations}));await write();
        }
        if(state.result||seconds&&state.time>=seconds){
          const data=await page.evaluate(()=>({performance:hostileDemo.performance(),graphics:hostileDemo.graphics(),worst:hostileDemo.worstFrames(),observation:fpsObservation}));
          const coverage={...state.stats,...data.observation.workload,viewedServers:data.observation.workload.viewedServers.length};
          Object.assign(run,data,{wallSeconds:(performance.now()-started)/1000,simulationSeconds:state.time,outcome:state.result,complete:!!state.result,meetsFrameBudget:verdict(data.performance),coverage,meetsCoverage:Object.entries(coverageBudget).every(([key,min])=>coverage[key]>=min),actions:commander.actions});
          assert.ok(Math.abs(run.wallSeconds-state.time)<2,'Mission clock differs from wall clock');break;
        }
        await commandOperation(page,commander);
        if(performance.now()-started>930000)throw Error('Operation exceeded its real-time limit');
        await new Promise(r=>setTimeout(r,2000));
      }
    }finally{await context.close();}
  }
  assert.equal(await fingerprint(),report.sourceFingerprint,'Source changed during measurement');
  assert.equal(await harnessFingerprint(),harnessSHA256,'Harness changed during measurement');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.resourceErrors,[]);
  report.status=seconds?'probe-complete':!report.runs.every(r=>r.complete&&r.meetsFrameBudget)?'frame-budget-failed':!report.runs.every(r=>r.meetsCoverage)?'workload-coverage-failed':selected.length===3?'qualified-background-60hz':'single-faction-complete';
  report.finishedAt=new Date().toISOString();await write();
  console.log(JSON.stringify({status:report.status,runs:report.runs.map(r=>({faction:r.faction,outcome:r.outcome,performance:r.performance,meetsFrameBudget:r.meetsFrameBudget}))}));
  if(!seconds&&!['qualified-background-60hz','single-faction-complete'].includes(report.status))process.exitCode=2;
}catch(error){report.status='error';report.error=error.message;await write();throw error;}
finally{await teardown();await fs.rm(tmp,{recursive:true,force:true});}
