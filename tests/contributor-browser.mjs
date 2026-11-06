// Portable UI regression: one owned headless browser and disposable server data.
import assert from 'node:assert/strict';
import {runFirstLight} from './first-light-browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const executablePath=process.env.HI_BROWSER_EXECUTABLE;
const softwareGPU=process.env.HI_BROWSER_SOFTWARE_GPU==='1';
if(executablePath&&/Google Chrome\.app(?:\/|$)/.test(executablePath))throw Error('Use bundled Chromium or Chrome for Testing, never normal Chrome');
const game=process.env.HI_BROWSER_GAME==='1',tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hi-contributor-'));
// Complete public clones include art. Force the source-only fallback separately
// so its account/navigation behavior remains covered alongside the real game.
const forceSource=await fs.access('game/entry/assets/misanthropic.webp').then(()=>true,()=>false);
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port;await new Promise(r=>probe.close(r));
const base='http://127.0.0.1:'+port,report={status:'running',background:true,game,softwareGPU,tests:[],errors:[],resourceErrors:[],fpsCertified:false};
let server,browser,logs='',interrupted=false;
const stopServer=async()=>{
  if(server&&server.exitCode===null&&server.signalCode===null){
    const stopped=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');
    const timer=setTimeout(()=>server.kill('SIGKILL'),10000);try{await stopped;}finally{clearTimeout(timer);}
  }
};
const stop=async()=>{await browser?.close().catch(()=>{});await stopServer();};
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{interrupted=true;void stop();});
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true,
    ...(!softwareGPU&&process.platform==='darwin'&&!executablePath?{channel:'chromium',args:['--use-angle=metal']} : {}),
    ...(softwareGPU?{args:['--use-gl=angle','--use-angle=swiftshader']}:{}),
    ...(executablePath?{executablePath}:{})});
  // Exercise the art-free contributor experience even on full installations.
  // Both modes reuse this one browser and separate disposable server data.
  for(const fullGame of game?[false,true]:[false]){
  logs='';
  // Do not inherit real mail or storage configuration from the parent environment.
  server=spawn(process.execPath,['game/server.mjs'],{env:{PATH:process.env.PATH,HOSTILE_PREVIEW_PORT:String(port),HI_PREVIEW_DATA_DIR:path.join(tmp,fullGame?'full':'source'),...(!fullGame&&forceSource?{HI_PREVIEW_SOURCE_ONLY:'1'}:{})},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Local test server did not start: '+logs)),15000);
    for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{logs=(logs+b).slice(-2000);if(logs.includes('BOARD_URL:')){clearTimeout(timeout);resolve();}});
    server.once('error',e=>{clearTimeout(timeout);reject(e);});
    server.once('exit',code=>{clearTimeout(timeout);reject(Error('Test server exited '+code));});
  });
  for(const [faction,name] of [['misanthropic','Misanthropic'],['closed','Closed AI'],['broke','Broke Labs']]){
    if(interrupted)throw Error('Interrupted');
    const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:2});
    try{
      const page=await context.newPage();page.setDefaultTimeout(softwareGPU?60000:15000);
      page.on('pageerror',error=>report.errors.push({faction,message:error.message}));
      page.on('console',message=>{if(message.type()==='error'&&message.text().includes('THREE.'))report.errors.push({faction,message:message.text().slice(0,1000)});});
      page.on('response',response=>{
        const url=new URL(response.url());
        if(url.origin===base&&(response.status()>=500||response.status()>=400&&!url.pathname.startsWith('/api/')))
          report.resourceErrors.push({faction,path:url.pathname,status:response.status()});
      });
      page.on('requestfailed',request=>{
        const failure=request.failure()?.errorText;
        if(request.url().startsWith(base+'/')&&failure!=='net::ERR_ABORTED')
          report.resourceErrors.push({faction,path:new URL(request.url()).pathname,failure});
      });
      const username='oss_'+randomBytes(6).toString('hex'),password='Local QA '+randomBytes(16).toString('hex');
      await page.goto(base+'/?faction='+faction);
      await page.locator(fullGame?'#join':'#source-only').waitFor({state:'visible'});
      for(const width of [390,1366]){
        await page.setViewportSize({width,height:900});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Entry fits at '+width);
      }
      if(!fullGame){
        assert.ok((await page.locator('#source-only').textContent()).includes('runtime art is included in a normal Git clone'));
        await page.locator('#source-account').click();
      }else await page.locator('#join').click();
      await page.locator('#entry').waitFor({state:'visible'});
      assert.equal(await page.locator('[name=faction]:checked').inputValue(),faction);
      for(const width of [390,1366]){
        await page.setViewportSize({width,height:900});
        const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,zoom:visualViewport.scale}));
        assert.equal(layout.zoom,1);assert.ok(layout.scroll<=layout.width,'Account signup fits at '+width);
      }
      await page.locator('#username').fill(username);await page.locator('#callsign').fill('OSS '+name);
      await page.locator('#password').fill(password);await page.locator('#submit-auth').click();
      await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('#saved-code').click();
      assert.equal(await page.locator('#membership-name').textContent(),name);
      assert.ok(await page.locator('#history-empty').isVisible());
      for(const id of ['learn-faction','practice-faction','play-verified']){
        assert.ok((await page.locator('#'+id).getAttribute('href')).includes('faction='+faction));
        if(!fullGame){
          await page.locator('#'+id).click();await page.locator('#source-only').waitFor({state:'visible'});
          assert.equal(new URL(page.url()).searchParams.get('faction'),faction);
          await page.locator('#source-account').click();await page.locator('#dashboard').waitFor({state:'visible'});
        }
      }
      await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});
      assert.equal(await page.locator('#membership-name').textContent(),name);
      await page.locator('#logout').click();await page.goto(base+'/account/index.html?mode=login');
      await page.locator('#entry').waitFor({state:'visible'});await page.locator('#username').fill(username);
      await page.locator('#password').fill(password);await page.locator('#submit-auth').click();
      await page.locator('#dashboard').waitFor({state:'visible'});
      assert.equal(await page.locator('#membership-name').textContent(),name);
      await page.locator('#account-leaderboard').click();await page.locator('#boards').waitFor({state:'visible'});
      assert.equal(await page.locator('#my-score').textContent(),'0');
      const contribution=(await page.locator('#my-contribution').textContent()).trim();assert.ok(contribution.length>0,'Rendered contribution must not be empty');assert.equal(Number(contribution),0);
      for(const width of [390,1366]){
        await page.setViewportSize({width,height:900});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Standings fit at '+width);
      }
      let graphics;
      if(fullGame){
        if(['1','recovery'].includes(process.env.HI_BROWSER_FIRST_LIGHT)&&faction!=='closed')await page.route('**/api/account/me',async route=>{const response=await route.fetch(),data=await response.json();if(faction==='misanthropic')data.user=null;else data.user.membership={...data.user.membership,faction:'closed',lockedAt:123};await route.fulfill({response,json:data});});
        await page.goto(base+'/demo/index.html?faction='+faction+'&tutorial=1');
        // A caught loader error is displayed in-page, not emitted as pageerror.
        // Report it immediately rather than hiding the cause behind a timeout.
        const loadTimeout=softwareGPU?180000:90000;
        await Promise.race([
          page.locator('#loading').waitFor({state:'hidden',timeout:loadTimeout}),
          page.locator('#loading-retry').waitFor({state:'visible',timeout:loadTimeout})
            .then(async()=>{throw Error(await page.locator('#loading').innerText());})
        ]);
        await page.locator('#tutorial-panel').waitFor({state:'visible'});
        assert.equal(await page.locator('#lab-name').textContent(),name);
        await page.locator('#lesson-action').click();
        graphics=await page.evaluate(()=>window.hostileDemo.graphics().quality);
        assert.equal(graphics.shadowSize[0],4096);assert.equal(graphics.reflectionSize[0],2048);
        assert.equal(graphics.aoSamples,32);assert.equal(graphics.bloomStrength,.16);
        if(['1','recovery'].includes(process.env.HI_BROWSER_FIRST_LIGHT))await runFirstLight(page,faction,report);
      }
      report.tests.push({faction,entry:true,missingArtNavigation:!fullGame,sourceModeForced:!fullGame&&forceSource,signup:true,refresh:true,login:true,zeroUnverifiedPoints:true,nativeZoom:true,...(graphics?{graphics}:{})});
      console.log('PASS '+name+' signup, allegiance, reload/login, history, zero unverified points'+(fullGame?', full-quality tutorial startup':', source workspace and missing-art routes'));
    }finally{await context.close();}
  }
  await stopServer();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.resourceErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.message;console.error(JSON.stringify({error:report.error,pageErrors:report.errors,resourceErrors:report.resourceErrors}));throw error;}
finally{
  await stop();await fs.rm(tmp,{recursive:true,force:true});
  await fs.mkdir('output/playwright/open-source',{recursive:true});
  await fs.writeFile('output/playwright/open-source/browser.json',JSON.stringify(report,null,2)+'\n');
}
