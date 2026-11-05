// Portable UI regression: one owned headless browser and disposable server data.
import assert from 'node:assert/strict';
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
if(executablePath&&/Google Chrome\.app(?:\/|$)/.test(executablePath))throw Error('Use bundled Chromium or Chrome for Testing, never normal Chrome');
const game=process.env.HI_BROWSER_GAME==='1',tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hi-contributor-'));
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port;await new Promise(r=>probe.close(r));
const base='http://127.0.0.1:'+port,report={status:'running',background:true,game,tests:[],errors:[],fpsCertified:false};
let server,browser,logs='',interrupted=false;
const stop=async()=>{
  await browser?.close().catch(()=>{});
  if(server&&server.exitCode===null&&server.signalCode===null){
    const stopped=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');
    const timer=setTimeout(()=>server.kill('SIGKILL'),10000);try{await stopped;}finally{clearTimeout(timer);}
  }
};
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{interrupted=true;void stop();});
try{
  // Do not inherit real mail or storage configuration from the parent environment.
  server=spawn(process.execPath,['design-preview/server.mjs'],{env:{PATH:process.env.PATH,HOSTILE_PREVIEW_PORT:String(port),HI_PREVIEW_DATA_DIR:tmp},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Local test server did not start: '+logs)),15000);
    for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{logs=(logs+b).slice(-2000);if(logs.includes('BOARD_URL:')){clearTimeout(timeout);resolve();}});
    server.once('error',e=>{clearTimeout(timeout);reject(e);});
    server.once('exit',code=>{clearTimeout(timeout);reject(Error('Test server exited '+code));});
  });
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  for(const [faction,name] of [['misanthropic','Misanthropic'],['closed','Closed AI'],['broke','Broke Labs']]){
    if(interrupted)throw Error('Interrupted');
    const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:2});
    try{
      const page=await context.newPage();page.setDefaultTimeout(15000);
      page.on('pageerror',error=>report.errors.push({faction,message:error.message}));
      const username='oss_'+randomBytes(6).toString('hex'),password='Local QA '+randomBytes(16).toString('hex');
      await page.goto(base+'/account/index.html?faction='+faction);
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
      for(const id of ['learn-faction','practice-faction','play-verified'])assert.ok((await page.locator('#'+id).getAttribute('href')).includes('faction='+faction));
      await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});
      assert.equal(await page.locator('#membership-name').textContent(),name);
      await page.locator('#logout').click();await page.goto(base+'/account/index.html?mode=login');
      await page.locator('#entry').waitFor({state:'visible'});await page.locator('#username').fill(username);
      await page.locator('#password').fill(password);await page.locator('#submit-auth').click();
      await page.locator('#dashboard').waitFor({state:'visible'});
      assert.equal(await page.locator('#membership-name').textContent(),name);
      await page.locator('#account-leaderboard').click();await page.locator('#boards').waitFor({state:'visible'});
      assert.equal(await page.locator('#my-score').textContent(),'0');
      assert.equal(await page.locator('#my-contribution').textContent(),'0');
      for(const width of [390,1366]){
        await page.setViewportSize({width,height:900});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Standings fit at '+width);
      }
      let graphics;
      if(game){
        await page.goto(base+'/demo/index.html?faction='+faction+'&tutorial=1');
        await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
        await page.locator('#tutorial-panel').waitFor({state:'visible'});
        assert.equal(await page.locator('#lab-name').textContent(),name);
        await page.locator('#lesson-action').click();
        graphics=await page.evaluate(()=>window.hostileDemo.graphics());
        assert.equal(graphics.shadowSize[0],4096);assert.equal(graphics.reflectionSize[0],2048);
        assert.equal(graphics.aoSamples,32);assert.equal(graphics.bloomStrength,.16);
      }
      report.tests.push({faction,signup:true,refresh:true,login:true,zeroUnverifiedPoints:true,nativeZoom:true,...(graphics?{graphics}:{})});
      console.log('PASS '+name+' signup, allegiance, reload/login, history, zero unverified points'+(game?', full-quality tutorial startup':''));
    }finally{await context.close();}
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.message;throw error;}
finally{
  await stop();await fs.rm(tmp,{recursive:true,force:true});
  await fs.mkdir('output/playwright/open-source',{recursive:true});
  await fs.writeFile('output/playwright/open-source/browser.json',JSON.stringify(report,null,2)+'\n');
}
