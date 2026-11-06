import {accountURL, playURL} from '../entry-flow.js';
import {DebriefStandings,contributionCopy,trainingHandoff} from './debrief.js';
import {RankedClient,readJSON} from './ranked-client.js';
import {enemyBriefing} from './enemy-ai.js';
import {tree,branchAt,nodeInfo,facilitySite,initInfrastructure,startProject as rawStartProject,projectProblem,repairFacility as rawRepairFacility,cancelProject as rawCancelProject,techBonuses,techCost,techCompute,heatThreshold,researchStaffed,projectWait} from './faction-tech.js';
import { kit, unitType, unitGuide, unitState, abilityProblem, updateFactionState } from './faction-rules.js';
import { FACTIONS, UNITS } from '../v2/world.js';
import { WORLD, ROLES, SERVERS, launchRaid as rawLaunchRaid, returnHome as rawReturnHome, viewServer, createGame, spawn, tickGame, deploy as rawDeploy, cancelDeployment as rawCancelDeployment, command as rawCommand, ability as rawAbility, point, distance, compute, holdPosition as rawHoldPosition } from './engine.js';
import { LiveWorld } from '../servers/live-world.js';
import { serverSites } from '../servers/territories.js';
import { UNIT_GUIDE, LESSONS, createTutorial, lesson, updateTutorial, advanceTutorial, tutorialAllows, tutorialAction, tutorialAbility, tutorialStatus, inspectTutorial, tutorialPhase, tutorialChoices, chooseTutorialBranch, tutorialProgress, tutorialGoal, tutorialTakeaway, TUTORIAL_ORDER } from './tutorial.js';
import { createOperation, tickOperation, activateEconomy as rawActivateEconomy, UPGRADES, DOCTRINES, upgradeBuilding as rawUpgradeBuilding, cancelUpgrade as rawCancelUpgrade, activateDoctrine as rawActivateDoctrine, captureRelay as rawCaptureRelay, scoreOperation, directOperation } from './operation.js';
import { openingChecklist, suggestedRaid, operationGuide } from './opening-guide.js';
import { LocalArchive } from './local-archive.js';
import { FrameMonitor, FrameAttribution, FrameCadence } from './frame-monitor.js';
import { BattleAudio } from './battle-audio.js';
import { unitCallouts, buildingHealth, drawBuildingHealth } from './battlefield-hud.js';

const $=id=>document.getElementById(id),canvas=$('world'),overlay=$('world-overlay'),ctx=overlay.getContext('2d'),mini=$('minimap'),mc=mini.getContext('2d');
const previewOwner=new URL(location.href).searchParams.get('preview'),isPreview=!!FACTIONS[previewOwner];
const live=new LiveWorld(canvas);
const archive=new LocalArchive(localStorage),monitor=new FrameMonitor(),attribution=new FrameAttribution();
const ROLE_LABELS={researcher:'Researcher',harvester:'Harvester',agent:'Agent',malware:'Malware',model:'Model',firewall:'Firewall',cooler:'Cooling ship',cloud:'Cloud ship'};
const images={},selected=new Set(),camera={x:800,y:441,zoom:1.1};
let game=createGame(),lastServer='misanthropic',chosen='misanthropic',started=false,showcase=false,cinematic=false,drag=null,hover=null,last=0,accumulator=0,uiClock=0,toastUntil=0,renderTime=0,lastLog='',resultShown=false,audio=null,sound=false,lastAudio=0,helpPaused=false;
let hudKeepouts=[];
function refreshHudKeepouts(){const origin=canvas.getBoundingClientRect();hudKeepouts=[...document.querySelectorAll('.field-title,.camera-tools,.mini-panel,.toast')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};}).filter(r=>r.width&&r.height);}
let width=0,height=0,scale=1,dpr=1,needsDraw=true,fpsSamples=[],frameHistory=[],worstFrames=[],inspected=null,guideKey='',unitListKey='',queueKey='',lastDraw=0,lessonCamera=false,activeLesson=null;
let ranked=null,starting=false,accountUser=null,runGeneration=0,accountGeneration=0,orderProblem='',recoveryProblem='',saveWarning='',helpReturn=null;
const standings=new DebriefStandings(renderStandings);let verifiedStandingsId=null;
let runId=null,saveClock=0,archivePaused=false,settings=archive.settings(),lastSaved=null;
const params=new URL(location.href).searchParams,autoOperation=params.get('autoplay')==='operation';
const renderHz=60;
const cadence=new FrameCadence(renderHz);
chosen=settings.faction;
if(FACTIONS[params.get('faction')])chosen=params.get('faction');
$('callsign').value=settings.callsign;
game=createGame(chosen);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;


function rankedAction(g,action,fallback){
 if(!ranked||g!==game)return fallback();
 try{return ranked.issue(g,action);}catch(e){notify(e.message);return ['order','hold'].includes(action.type)?0:action.type.startsWith('cancel')?false:{ok:false,reason:e.message};}
}
const startProject=(g,id)=>rankedAction(g,{type:'project',id},()=>rawStartProject(g,id));
const repairFacility=(g,site)=>rankedAction(g,{type:'repair',site},()=>rawRepairFacility(g,site));
const cancelProject=(g)=>rankedAction(g,{type:'cancelProject'},()=>rawCancelProject(g));
const launchRaid=(g,target,ids=null)=>rankedAction(g,{type:'raid',target,ids:ids||game.units.filter(u=>u.team==='player'&&u.server===g.faction&&!u.transit&&!u.raid&&ROLES.find(r=>r.key===u.role).dps>0).map(u=>u.id)},()=>rawLaunchRaid(g,target,ids));
const returnHome=(g,ids=null)=>rankedAction(g,{type:'return',source:g.activeServer,ids:ids||game.units.filter(u=>u.team==='player'&&u.server===g.activeServer).map(u=>u.id)},()=>rawReturnHome(g,ids));
const deploy=(g,role)=>rankedAction(g,{type:'deploy',role},()=>rawDeploy(g,role));
const cancelDeployment=(g,index)=>rankedAction(g,{type:'cancelDeployment',index},()=>rawCancelDeployment(g,index));
const command=(g,ids,kind,target)=>rankedAction(g,{type:'order',ids,kind,target},()=>rawCommand(g,ids,kind,target));
const ability=(g,ids)=>rankedAction(g,{type:'ability',ids},()=>rawAbility(g,ids));
const holdPosition=(g,ids)=>rankedAction(g,{type:'hold',ids},()=>rawHoldPosition(g,ids));
const activateEconomy=(g)=>rankedAction(g,{type:'economy'},()=>rawActivateEconomy(g));
const cancelUpgrade=g=>ranked&&g===game?false:rawCancelUpgrade(g);
const activateDoctrine=(g)=>rankedAction(g,{type:'doctrine'},()=>rawActivateDoctrine(g));
const captureRelay=(g,ids)=>rankedAction(g,{type:'capture',ids},()=>rawCaptureRelay(g,ids));

function imageLoad(key,url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[key]=img;resolve(img)};img.onerror=()=>reject(new Error('Unable to load '+url));img.src=url;});}
function thumb(faction,index){const role=ROLES.find(r=>r.index===index).key,inset=["researcher","agent"].includes(role)?70:role==="malware"?50:0,side=360-inset*2;return `<svg viewBox="${inset} ${inset} ${side} ${side}" aria-hidden="true"><image href="../servers/assets/portraits/${faction}-${role}-v06.jpg" width="360" height="360"/></svg>`;}
function resize(){needsDraw=true;const box=canvas.getBoundingClientRect();width=box.width;height=box.height;dpr=Math.min(devicePixelRatio||1,2);overlay.width=Math.round(width*dpr);overlay.height=Math.round(height*dpr);live.resize(width,height);scale=Math.max(width/WORLD.width,height/WORLD.height)*camera.zoom;refreshHudKeepouts();}
function screen(p){return live.project(p);}
function world(p){return live.unproject(p);}
function pointer(event){const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}

function setCamera(x,y,zoom=camera.zoom){camera.x=Math.max(100,Math.min(1572,x));camera.y=Math.max(110,Math.min(870,y));camera.zoom=Math.max(.45,Math.min(3.2,zoom));scale=Math.max(width/WORLD.width,height/WORLD.height)*camera.zoom;needsDraw=true;}
// Keep focused actors readable when the command dock leaves a shorter battlefield.
function focusCamera(x,y,zoom=1.5){setCamera(x,y,zoom*Math.max(1,650/Math.max(1,height)));}
function notify(text){$('toast').textContent=text;$('toast').hidden=false;toastUntil=performance.now()+3500;}
function unitHit(p){const hit=live.pick(screen(p));return hit?.unit?game.units.find(u=>u.id===hit.unit&&u.server===game.activeServer&&!u.transit):null;}
function siteHit(p){const hit=live.pick(screen(p));return hit?.site?serverSites(game.activeServer).find(s=>s.id===hit.site):serverSites(game.activeServer).find(s=>distance(p,s)<55);}

function rivalChoices(){const previous=$('operation-rival').value;$('operation-rival').innerHTML=Object.entries(FACTIONS).filter(([id])=>id!==chosen).map(([id,f])=>`<option value="${id}">${f.name}</option>`).join('');if(previous!==chosen&&FACTIONS[previous])$('operation-rival').value=previous;}


function accountMode(){
 const verified=$('verified-run').checked;if(verified)$('relaxed').checked=false;$('relaxed').disabled=verified;
 const member=accountUser?.membership;
 if(verified&&member&&!started&&chosen!==member.faction)$('faction-options').querySelector(`[data-faction="${member.faction}"]`)?.click();
 for(const b of $('faction-options').querySelectorAll('button'))b.disabled=verified&&!!member&&b.dataset.faction!==member.faction;
 $('account-status').textContent=accountUser?accountUser.callsign+' · '+FACTIONS[member.faction].name:'Sign in to keep verified results across sessions.';
 $('account-link').textContent=accountUser?'Account & results ↗':'Join '+FACTIONS[chosen].name+' / sign in ↗';$('account-link').href=accountURL(chosen);$('play-mode').value=verified?'ranked':'practice';$('start').firstChild.textContent=verified?'Play for your faction ↗':'Start practice ↗';$('start').querySelector('small').textContent=verified?'Verified points · 15-minute limit':'No faction points · pause available';$('mode-description').textContent=verified?'Your score counts after server verification. The clock keeps running while you are away.':'Practice stays on this browser. It does not affect your faction’s rank.';
 $('commitment-option').hidden=!verified||!member||member.lockedAt!==null;
 $('commitment-copy').textContent=member?'My first verified start commits me to '+FACTIONS[member.faction].name+' for Local Season Zero.':'';
}
async function refreshAccount(){
 const generation=++accountGeneration,run=runGeneration;standings.reset();verifiedStandingsId=null;renderStandings();
 try{const data=await readJSON('/api/account/me',{'X-HI-Client':'local-accounts-v1'},'HI_ACCOUNT_UNAVAILABLE');
  if(generation!==accountGeneration||run!==runGeneration)return;
  if(!data||!Object.hasOwn(data,'user')||data.user&&(!FACTIONS[data.user.membership?.faction]||typeof data.user.id!=='string'||typeof data.user.callsign!=='string'))throw Error('HI_RESPONSE_INVALID');accountUser=data.user;
  if(accountUser){const matches=await readJSON('/api/account/matches',{'X-HI-Client':'local-accounts-v1'},'HI_ACCOUNT_UNAVAILABLE');if(generation!==accountGeneration||run!==runGeneration)return;
   const requested=params.get('resume');if(requested&&/^[a-f0-9-]{36}$/.test(requested))RankedClient.remember({id:requested});else if(matches.activeMatch&&/^[a-f0-9-]{36}$/.test(matches.activeMatch.id))RankedClient.remember(matches.activeMatch);else if(!RankedClient.saved()?.token)RankedClient.forget();
  }else if(!RankedClient.saved()?.token)RankedClient.forget();accountMode();refreshContinue();
 }catch{if(generation!==accountGeneration||run!==runGeneration)return;accountUser=null;$('account-status').textContent='HI_ACCOUNT_UNAVAILABLE · Account service unavailable. Practice remains available.';archive.fail('HI_ACCOUNT_UNAVAILABLE','account');}
}
function renderStandings(){
 const status=ranked?.summary(),visible=status?.status==='verified'&&status.accountOwned&&!!game.result;
 $('debrief-standings').hidden=!visible;$('standings-retry').hidden=!visible||standings.status!=='unavailable';
 if(!visible){$('debrief-standings').textContent='';return;}
 $('debrief-standings').textContent=standings.current?contributionCopy(standings.current,standings.baseline,game.operation.rival):standings.status==='unavailable'?'HI_STANDINGS_UNAVAILABLE · Current rank and contribution are unavailable. Your verified result is unchanged.':'Your result is verified. Loading current rank and faction contribution…';
}
$('verified-run').onchange=()=>{$('confirm-faction').checked=false;accountMode();};
$('play-mode').onchange=()=>{$('verified-run').checked=$('play-mode').value==='ranked';$('verified-run').onchange();};
async function reconnectVerified(){await ranked?.close();await start(false,false,true);}
function renderVerified(){
 const status=ranked?.summary();$('verification-result').hidden=!status;$('verification-retry').hidden=!status||status.status!=='interrupted';$('result-account').hidden=!status?.accountOwned;$('result-leaderboard').hidden=!status?.accountOwned;$('session-account-link').hidden=!status||status.status!=='interrupted';
 if(!status){renderStandings();return;}
 if(status.status==='verified'&&status.accountOwned&&accountUser&&verifiedStandingsId!==status.id){verifiedStandingsId=status.id;standings.load(true);}renderStandings();
 $('pause').disabled=true;$('new-run').textContent='End verified run';$('verified-reconnect').hidden=status.status!=='interrupted';
 const copy=status.status==='active'?'Server recording · '+time(status.acknowledgedTick*.05)+' acknowledged · no pause':status.status==='verified'?'Server verified · '+status.result.score+' points · '+(status.accountOwned?'saved to your account':'recorded locally'):['verifying','verification_failed'].includes(status.status)?(status.verification?.message||'Server replay in progress. Your result is pending.'):status.status==='interrupted'?(status.error||'Verification interrupted. Reconnect to recover acknowledged orders.'):status.error||'Verification rejected. This result has no verified points.';
 $('save-status').textContent=copy;$('verification-result').textContent=copy;
 if(status.status==='verified'&&game.result){
  const values=$('result-stats').querySelectorAll('strong');if(values.length===3){values[1].textContent=status.result.score;values[2].textContent=status.result.medal;}
  $('score-breakdown').replaceChildren(...Object.entries(status.result.breakdown).map(([key,value])=>{const row=document.createElement('div');row.textContent=key+' · '+value;return row;}));
 }else if(['rejected','aborted'].includes(status.status)&&game.result){const values=$('result-stats').querySelectorAll('strong');if(values.length===3){values[1].textContent='UNVERIFIED';values[2].textContent='—';}}
}

function showPanel(name, focus = false){
 for(const button of document.querySelectorAll('[data-panel]')){
  const active=button.dataset.panel===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  $('panel-'+button.dataset.panel).hidden=!active;if(active&&focus)button.focus();
 }
}
for(const button of document.querySelectorAll('[data-panel]')){
 button.onclick=()=>showPanel(button.dataset.panel);
 button.onkeydown=e=>{const tabs=[...document.querySelectorAll('[data-panel]')],i=tabs.indexOf(button);if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;showPanel(tabs[next].dataset.panel,true);}};
}
function showSelectionDetails(){showPanel('details');}
$('selection-info').onclick=showSelectionDetails;

function select(ids,add=false){if(!add)selected.clear();for(const id of ids)if(game.units.some(u=>u.id===id&&u.team==='player'&&u.server===game.activeServer&&!u.transit)){if(add&&ids.length===1&&selected.has(id))selected.delete(id);else selected.add(id);}inspected=null;renderUI();}
function inspectSite(id){const site=serverSites(game.activeServer).find(s=>s.id===id);if(!site)return;inspected={type:'site',site};inspectTutorial(game,id);renderUI();}
function focusLesson(){const l=lesson(game);if(!l)return;lessonCamera=true;const units=game.units.filter(u=>u.team==='player'&&u.role===l.role&&u.server===game.activeServer&&!u.transit);if(units.length)select([units[0].id]);else{selected.clear();inspected=null;}if(tutorialPhase(game)==='campus'){fit();return;}const p=l.follow?units[0]||point(l.site,game.activeServer):point(l.site,game.activeServer);focusCamera(p.x,p.y,l.site==='campus'?1.3:1.6);}
function useAbility(){const r=ranked?ability(game,[...selected]):tutorialAbility(game,[...selected]);notify(r.ok?'Field ability activated.':r.reason);renderUI();}
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
  let kind='move',destination=p;if(site){destination=site.id;if(site.id==='grid'&&u.role==='harvester')kind='harvest';if(site.id==='grid'&&game.operation&&u.server===game.operation.rival&&ROLES.find(r=>r.key===u.role).dps>0)kind='capture';if(site.id==='intake'&&['cooler','cloud'].includes(u.role))kind='cool';if(site.id==='lab'&&u.role==='researcher'&&u.server===game.faction)kind='research';if(site.id==='campus'&&u.server!==game.faction)kind='siege';if(site.id.startsWith('facility')&&u.server!==game.faction)kind='sabotage';}
  count+=command(game,[id],kind,destination);
 }
 if(count){game.effects.push({server:game.activeServer,x:p.x,y:p.y,color:FACTIONS[game.faction].color,life:.7,max:.7,ring:true});notify(site?'Order → '+site.name:'Route order confirmed.');}else notify('This unit needs a route in its own movement layer.');
}
function setPause(value){if(!started||game.result)return;if(!value&&game.tutorial?.failure){showPanel('mission');$('lesson-action').focus();notify('Use the named training retry before resuming.');return;}if(ranked&&value){notify('Verified operations use the server clock and cannot pause.');return;}game.paused=value;$('pause').textContent=ranked?'Live':value?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(value));$('pause-overlay').hidden=!value;last=performance.now();lastDraw=0;monitor.interrupt();attribution.reset();if(value)saveRun();needsDraw=true;}
function setCinematic(value){cinematic=value;document.body.classList.toggle('cinematic',value);$('camera-mode').setAttribute('aria-pressed',String(value));$('exit-camera').hidden=!value;$('scene-caption').hidden=!value;if(value){const p=point('campus',game.activeServer);camera.zoom=1.35;camera.x=p.x;camera.y=p.y;}resize();}
function audioPulse(){if(sound&&audio)audio.update(game,camera);}
async function start(watch=false,training=false,reconnect=false){
 if(starting)return;starting=true;$('verified-error').textContent='';
 if(training&&archive.savedChoices().some(x=>x.record.game.tutorial)&&!confirm('Start First Light again? This replaces the saved tutorial and its recovery point. Cancel to keep your current progress.')){starting=false;return;}
 const generation=++runGeneration;standings.reset();verifiedStandingsId=null;orderProblem=recoveryProblem=saveWarning='';
 const useServer=reconnect||(!watch&&!training&&!autoOperation&&$('verified-run').checked);
 if(useServer&&!reconnect&&!accountUser){starting=false;location.href=accountURL(chosen);return;}
 let prepared=null;
 try{if(useServer){$('start').disabled=true;$('continue-verified').disabled=true;const faction=$('faction-options').querySelector('[aria-pressed=true]')?.dataset.faction||chosen;prepared=reconnect?await RankedClient.resume(()=>{if(generation===runGeneration&&prepared?.client===ranked)renderVerified();}):await RankedClient.create({faction,rival:$('operation-rival').value,difficulty:'standard'},()=>{if(generation===runGeneration&&prepared?.client===ranked)renderVerified();},$('confirm-faction').checked);}}
 catch(e){$('verified-error').textContent=e.message+' · Practice remains available.';if(ranked){ranked.status='interrupted';ranked.error=e.message;renderVerified();notify(e.message);}starting=false;$('start').disabled=false;$('continue-verified').disabled=false;return;}
 if(generation!==runGeneration){prepared?.client.close();starting=false;return;}
 if(training)await archive.claim();
 if(params.has('resume')){params.delete('resume');const url=new URL(location.href);url.searchParams.delete('resume');history.replaceState({},'',url);}ranked?.close();ranked=prepared?.client||null;starting=false;$('start').disabled=false;$('continue-verified').disabled=false;
 showPanel('mission');
 chosen=$('faction-options').querySelector('[aria-pressed=true]')?.dataset.faction||chosen;game=prepared?prepared.game:training?createTutorial(chosen,$('operation-rival').value):watch?createGame(chosen,$('relaxed').checked?'relaxed':'standard'):createOperation(chosen,$('operation-rival').value,$('relaxed').checked?'relaxed':'standard');started=true;frameHistory=[];worstFrames=[];monitor.reset();lastDraw=0;saveClock=0;runId=crypto.randomUUID();if(training){if(!archive.beginTutorial(runId,{replace:true}))saveWarning=archive.error;}if(!autoOperation)archive.updateSettings({callsign:$('callsign').value,faction:chosen});settings=archive.settings();showcase=watch;resultShown=false;selected.clear();inspected=null;guideKey=unitListKey=queueKey=null;selected.add(game.units[0].id);$('briefing').close();$('result').close();setPause(false);document.body.classList.toggle('training',training);document.body.classList.toggle('operation',!!game.operation);if(!watch)setCinematic(false);renderRoster();lastServer=game.faction;const region=SERVERS[game.faction];setCamera(region.camera[0]*WORLD.width,region.camera[1]*WORLD.height,1.12);renderNetwork();last=performance.now();accumulator=0;lastLog='';
 if(!watch&&!training)fit();
 if(watch){fieldOrder('research');fieldOrder('harvest');fieldOrder('cool');setCinematic(true);notify('SERVER SIEGE · build at home, breach a rival');}else if(training){focusLesson();prepareRecovery('Defend preparation');notify('FIRST LIGHT · follow the next order in your mission panel.');}else notify('BLACKOUT PROTOCOL · start your home economy. Your mission panel shows the next decision.');renderUpgrades();renderUI();saveRun();canvas.focus({preventScroll:true});
 audio?.reset();if(ranked){chosen=game.faction;standings.reset(accountUser?{accountId:accountUser.id,accountGeneration,runId:ranked.ticket.id,rulesId:ranked.ticket.rulesId,faction:game.faction}:null);if(accountUser)standings.load(false);ranked.attach(game);renderVerified();}else{$('new-run').textContent='Save & menu';$('pause').disabled=false;$('verified-reconnect').hidden=true;$('session-account-link').hidden=true;}
}
function saveMeta(){return {camera:{...camera},selected:[...selected],runId};}
function prepareRecovery(label){
 if(!archive.prepareCheckpoint(game,saveMeta(),label)){recoveryProblem=archive.errorCode+' · '+archive.error;game.paused=true;return false;}
 recoveryProblem='';return true;
}
function retryTraining(){
 const checkpoint=archive.checkpoint;if(!checkpoint){recoveryProblem='HI_CHECKPOINT_INVALID · No recovery point is available. Keep this session or start training again from the menu.';renderUI();return;}
 if(!confirm('Retry '+checkpoint.id+'? Restore the team, wallet, research and progress saved at '+time(checkpoint.game.time)+'. Later actions in this tutorial will be undone.'))return;
 const restored=archive.restoreCheckpoint(game,runId);if(!restored){recoveryProblem=archive.errorCode+' · '+archive.error;renderUI();return;}
 game=restored.game;selected.clear();for(const id of restored.meta.selected||[])if(game.units.some(u=>u.id===id&&u.team==='player'&&u.server===game.activeServer&&!u.transit))selected.add(id);
 const c=restored.meta.camera;if(c)setCamera(c.x,c.y,c.zoom);orderProblem=recoveryProblem='';inspected=null;guideKey=unitListKey=queueKey=null;lastLog='';resultShown=false;lastServer=game.activeServer;accumulator=0;saveClock=0;last=performance.now();monitor.interrupt();audio?.reset();$('result').close();setCinematic(false);if(c)setCamera(c.x,c.y,c.zoom);renderNetwork();renderRoster();renderUpgrades();setPause(true);renderUI();notify('Restored '+checkpoint.id+'. Read your order, then Resume.');
}
function trainingTransition(action){
 try{return action();}catch(error){archive.fail('HI_TRANSITION','training-transition',error);recoveryProblem='HI_TRANSITION · The order stopped. Retry the saved checkpoint or keep this session for diagnosis.';game.paused=true;$('pause-overlay').hidden=false;renderUI();return false;}
}
function guidedOrder(){return trainingTransition(()=>guidedOrderUnsafe());}
function guidedOrderUnsafe(){
 if(game.tutorial?.failure){retryTraining();return;}
 if(recoveryProblem){if(archive.errorCode!=='HI_CHECKPOINT_PREPARE'){retryTraining();return;}if(archive.prepareRetries>=2){notify(recoveryProblem);return;}game.paused=false;recoveryProblem='';}
 let r=tutorialAction(game);if(r?.needsCheckpoint){if(!prepareRecovery(r.checkpoint)){setPause(true);renderUI();return;}saveRun();r=tutorialAction(game,{release:true});}
 orderProblem=r&&!r.ok?r.reason:'';if(orderProblem)archive.fail('HI_ORDER_BLOCKED','guided-order');
 if(r?.ids?.length)select(r.ids);if(r?.inspect)inspectSite(r.inspect);if(orderProblem)notify(orderProblem);renderUI();
}
function saveRun(){
 if(ranked||!started||showcase||autoOperation||game.result||isPreview)return false;
 const ok=archive.save(game,saveMeta());
 if(ok){saveWarning='';lastSaved=Date.now();$('save-status').textContent='Saved locally · '+new Date(lastSaved).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' · autosave 15s';}
 else{saveWarning=archive.errorCode+' · '+archive.error+' Recovery remains available in this tab.';$('save-status').textContent=saveWarning;}
 return ok;
}
function refreshContinue(){
 $('continue-verified').hidden=!RankedClient.saved();const choices=archive.savedChoices(),pick=$('save-choice'),prior=pick.value;
 pick.replaceChildren(...choices.map(c=>{const o=document.createElement('option');o.value=c.source;o.textContent=(c.record.game.tutorial?'First Light':'Blackout Protocol')+' · '+FACTIONS[c.record.game.faction].name+' · '+time(c.record.game.time);return o;}));if(choices.some(c=>c.source===prior))pick.value=prior;
 $('save-choice-label').hidden=choices.length<2;$('continue-save').hidden=!choices.length;
 $('continue-save').textContent=choices.length>1?'Continue selected mission ↗':choices.length?'Continue '+pick.options[0].textContent+' ↗':'';
 if(archive.error)$('verified-error').textContent=archive.errorCode+' · '+archive.error;
}
async function restoreRun(){
 const source=$('save-choice').value||'auto',choices=archive.savedChoices();
 if(source==='legacy'&&choices.length>1&&choices.find(c=>c.source==='legacy').record.game.tutorial&&!confirm('Migrate this older tutorial? The original stays intact, but saving it will replace the newer tutorial slot.'))return;
 const saved=archive.load(source);if(!saved){notify(archive.error||'No unfinished mission in this browser.');refreshContinue();return;}
 ++runGeneration;standings.reset();renderStandings();ranked?.close();ranked=null;if(saved.game.tutorial)await archive.claim();$('pause').disabled=false;$('new-run').textContent='Save & menu';$('verified-reconnect').hidden=true;showPanel('mission');
 game=saved.game;started=true;showcase=false;resultShown=false;chosen=game.faction;for(const b of $('faction-options').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.faction===chosen));rivalChoices();runId=saved.meta.runId||crypto.randomUUID();selected.clear();
 for(const id of saved.meta.selected||[])if(game.units.some(u=>u.id===id&&u.team==='player'&&u.server===game.activeServer&&!u.transit))selected.add(id);
 orderProblem=recoveryProblem='';inspected=null;guideKey=unitListKey=queueKey=null;lastServer=game.activeServer;lastLog='';frameHistory=[];worstFrames=[];monitor.reset();saveClock=0;accumulator=0;
 $('briefing').close();$('result').close();document.body.classList.toggle('training',!!game.tutorial);document.body.classList.toggle('operation',!!game.operation);setCinematic(false);
 const c=saved.meta.camera;if(c&&[c.x,c.y,c.zoom].every(Number.isFinite))setCamera(c.x,c.y,c.zoom);else{const p=point('campus',game.activeServer);setCamera(p.x,p.y,1.25);notify('Saved camera unavailable. Showing your campus.');}
 renderNetwork();renderRoster();renderUpgrades();audio?.reset();setPause(true);renderUI();const progress=tutorialProgress(game);notify(progress?progress.chapter+' · '+lesson(game).title+'. Restored paused; Resume when ready.':'Saved operation restored paused. Resume when ready.');
}
async function showMenu(){
 ++runGeneration;standings.reset();verifiedStandingsId=null;renderStandings();
 const wasVerified=!!ranked;
 if(ranked){const prior=ranked;started=false;await prior.abandon().catch(e=>notify(e.message));ranked=null;$('pause').disabled=false;$('verified-reconnect').hidden=true;}
 if(started&&!game.result){if(wasVerified)game.paused=true;else setPause(true);}$('result').close();setCinematic(false);started=false;document.body.classList.remove('training','operation');
 refreshContinue();$('briefing').showModal();$('scene-caption').querySelector('strong').textContent='Own your server. Breach theirs.';refreshAccount();
}
function renderUpgrades(){
 const t=tree(game.faction);
 $('upgrade-options').innerHTML=t.branches.map((b,i)=>`<details class="tech-branch" ${i===0?'open':''} data-branch="${b.id}"><summary><span class="tech-index">0${i+1}</span><b>${b.name}</b><small data-building-state></small></summary><div class="tech-path"><button class="site-locate" data-locate="${facilitySite(i)}">Show building site ↗</button>${[b,...b.research].map((n,j)=>`<div class="tech-node" data-node="${n.id}"><span class="tech-tier">${j===0?'I · BUILD':j===1?'II · RESEARCH':'III · SPECIALIZE'}</span><b>${j===0?'Facility':n.name}</b><p>${n.effect}</p><button data-tech="${n.id}"><span>${j?'Research':'Build'}</span><strong>${n.cost}</strong></button><small data-reason></small></div>`).join('')}<button data-repair="${facilitySite(i)}" hidden>Repair facility</button></div></details>`).join('');
 for(const b of $('upgrade-options').querySelectorAll('[data-tech]'))b.onclick=()=>{const r=startProject(game,b.dataset.tech);notify(r.ok?nodeInfo(game.faction,b.dataset.tech).name+' started.':r.reason);renderUI();};
 for(const b of $('upgrade-options').querySelectorAll('[data-repair]'))b.onclick=()=>{const r=repairFacility(game,b.dataset.repair);notify(r.ok?'Repair crew dispatched.':r.reason);renderUI();};
 for(const b of $('upgrade-options').querySelectorAll('[data-locate]'))b.onclick=()=>{viewServer(game,game.faction);syncServer();select([]);inspectSite(b.dataset.locate);const p=point(b.dataset.locate,game.faction);focusCamera(p.x,p.y,1.55);showPanel('systems');};
}
function renderTechnology(){
 const state=game.infrastructure?.[game.faction];$('infrastructure-panel').hidden=!state;$('faction-doctrine').hidden=!game.operation;if(!state)return;
 const t=tree(game.faction),project=state.project;
 $('tech-title').textContent=t.title;$('tech-identity').textContent=t.identity;
 $('tech-specialization').textContent=state.specialization?'Specialization: '+nodeInfo(game.faction,state.specialization).name:'Tier III: choose ONE final specialization. Requires two online facilities.';
 $('upgrade-status').textContent=project?nodeInfo(game.faction,project.id).name+' · '+(projectWait(game)||Math.ceil(project.remaining)+'s'):'Construction and research use one campus queue.';
 $('cancel-upgrade').hidden=!project&&!game.operation?.construction;$('cancel-upgrade').disabled=game.paused||!!game.result;
 for(const [i,b]of t.branches.entries()){
  const site=facilitySite(i),building=state.buildings[site],panel=$('upgrade-options').querySelector('[data-branch="'+b.id+'"]');
  panel.querySelector('[data-building-state]').textContent=building.hp>0?Math.ceil(building.hp)+' / '+building.maxHp+' HP':building.built?'OFFLINE · rebuild to restore benefits':'Empty site';
  const repair=panel.querySelector('[data-repair]');repair.hidden=building.hp<=0||building.hp>=building.maxHp;repair.disabled=!!project||game.paused||!!game.result;repair.textContent='Repair · '+Math.max(40,Math.ceil(b.cost*(1-building.hp/building.maxHp)*.5))+' funds';
  for(const n of [b,...b.research]){
   const node=nodeInfo(game.faction,n.id),el=panel.querySelector('[data-node="'+n.id+'"]'),button=el.querySelector('[data-tech]'),working=project?.id===n.id,done=node.type==='build'?building.hp>0:state.completed.includes(n.id),reason=projectProblem(game,n.id);
   el.dataset.state=done?'done':working?'working':reason?'locked':'available';
   button.disabled=!!reason;button.querySelector('span').textContent=done?'Completed':working?'In progress':node.type==='build'?(building.built?'Rebuild':'Build'):node.tier===3?'Specialize':'Research';button.querySelector('strong').textContent=done?'✓':working?Math.ceil(project.remaining)+'s':(node.type==='build'&&building.built?Math.ceil(node.cost*.65):node.cost)+' funds';
   el.querySelector('[data-reason]').textContent=done?(building.hp>0?'Online': 'Offline until facility is rebuilt'):working?('Paid · '+Math.round((1-project.remaining/project.total)*100)+'% complete'):reason||node.seconds+'s · available';
  }
 }
}
function renderOperation(){
 const op=game.operation;$('operation-panel').hidden=!op;$('infrastructure-panel').hidden=!op;if(!op)return;
 const enemy=enemyBriefing(game);$('enemy-plan-title').textContent=enemy.name;$('enemy-plan-copy').textContent=enemy.copy;
 const status=operationGuide(game,[...selected]);$('operation-title').textContent=game.result?'Operation complete':status.title;$('operation-task').textContent=(autoOperation?'DIRECTOR PLAY · ': '')+status.task;$('operation-action').textContent=status.label;
 $('operation-time').textContent=time(Math.max(0,op.limit-(ranked?ranked.targetTick()*.05:game.time)))+' LEFT';$('operation-action').disabled=!!game.result||game.paused||(status.action==='deploy'&&(game.funds<status.cost||game.used+techCompute(game,game.faction,status.suggested||'model',unitType(game.faction,status.suggested||'model').compute)>game.capacity||game.queue.length>=4));
 $('opening-checklist').hidden=op.enteredRival;const checklist=openingChecklist(game),signature=checklist.map(x=>Number(x.done)).join('');if($('opening-checklist').dataset.state!==signature){$('opening-checklist').dataset.state=signature;$('opening-checklist').innerHTML=checklist.map(x=>`<span class="${x.done?'done':''}">${x.done?'✓':'○'} ${x.label}</span>`).join('');}
 for(const b of $('roster').querySelectorAll('button'))b.classList.toggle('suggested',b.dataset.role===status.suggested);
 $('rally-endpoint').hidden=game.activeServer===game.faction;$('relay-order').hidden=game.activeServer===game.faction;
 document.querySelector('.relay-status').hidden=!op.enteredRival;
 $('relay-state').textContent=op.relay.captured?'Secured · shielding weakened':op.relay.contested?'Contested':op.relay.progress>0?Math.floor(op.relay.progress/30*100)+'%':'Unclaimed';$('relay-bar').style.transform=`scaleX(${op.relay.progress/30})`;
 $('relay-order').disabled=!!game.result||op.relay.captured||game.activeServer!==op.rival||game.paused;$('rally-endpoint').disabled=!!game.result||game.activeServer===game.faction||game.paused;
 $('home-alert').hidden=!op.homeThreat;
 const bonuses=techBonuses(game);$('faction-rule').textContent=kit(game.faction).rule.replace('145m',(145+(bonuses.wardRange||0))+'m').replace('20% less',Math.round(20+(bonuses.wardReduction||0)*100)+'% less').replace('155m',(155+(bonuses.linkRange||0))+'m').replace('25% extra',Math.round(25+(bonuses.markDamage||0)*100)+'% extra').replace('5s of reduced',(5+(bonuses.recovery||0))+'s of reduced');$('faction-tactic').textContent=kit(game.faction).tactic;$('faction-counter').textContent='Opponent counter: '+kit(game.faction).counter;
 const own=game.units.filter(u=>u.team==='player'&&u.hp>0&&!u.transit);$('faction-live').textContent=game.faction==='misanthropic'?own.filter(u=>u.role==='firewall'&&u.ward).length+' wards established':game.faction==='closed'?own.filter(u=>u.role==='model'&&u.linked).length+' models linked · '+own.filter(u=>u.role==='model').length+' deployed':Math.round(game.heat)+'° / '+heatThreshold(game)+'° throttle · '+own.filter(u=>(u.boostUntil||0)>game.time).length+' bursting';
 const doctrine=DOCTRINES[game.faction],remaining=Math.max(0,Math.ceil(op.doctrineReady-game.time));$('doctrine-button').textContent=doctrine.name+(op.boostUntil>game.time?' · ACTIVE':remaining?' · '+remaining+'s':' · 150 funds');$('doctrine-copy').textContent=doctrine.effect;$('doctrine-button').disabled=!!game.result||game.paused||remaining>0||game.funds<150;

}
function renderArchive(){
 const history=archive.history(),rows=archive.standings();$('archive-empty').hidden=!!rows.length;
 const summary=Object.entries(FACTIONS).map(([id,f])=>{const victories=history.filter(r=>r.faction===id&&r.outcome==='victory');return `<div><small>${f.name}</small><strong>${victories.length}</strong><span>local victories</span></div>`;}).join('');$('archive-summary').innerHTML=summary;
 $('archive-rows').replaceChildren();
 for(const r of rows){const tr=document.createElement('tr');for(const value of [`${r.callsign} · ${FACTIONS[r.faction].name}`,String(r.score),time(r.seconds),r.medal]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('archive-rows').append(tr);}
}
function renderNetwork(){
 $('server-navigation').innerHTML=[game.faction,...game.enemies].map(id=>`<button data-server="${id}" aria-label="${id===game.faction?'Home server — '+FACTIONS[id].name:'Plan raid on '+FACTIONS[id].name+' server'}"><b>${FACTIONS[id].name}</b><small>${id===game.faction?'YOUR HOME CONTINENT':'UNVISITED / ATTACK TO ENTER'}</small></button>`).join('');
 for(const b of $('server-navigation').querySelectorAll('button'))b.onclick=()=>{const id=b.dataset.server;if(game.visited.includes(id)){viewServer(game,id);needsDraw=true;syncServer();}else if(game.operation){showPanel('mission');notify('Choose your raiding team in Mission, then transfer it. Your home defenders stay unless you select them.');}else{const r=launchRaid(game,id);notify(r.ok?'Field team staging at the home uplink. The rival map opens on arrival.':r.reason);}renderUI();};
 $('rival-target').innerHTML=game.enemies.map(id=>`<option value="${id}">${FACTIONS[id].name}</option>`).join('');
}
function syncServer(){
 if(lastServer===game.activeServer)return;lastServer=game.activeServer;selected.clear();const army=game.units.filter(u=>u.server===game.activeServer&&!u.transit&&u.team==='player');select(army.map(u=>u.id));const p=army.length?{x:army.reduce((n,u)=>n+u.x,0)/army.length,y:army.reduce((n,u)=>n+u.y,0)/army.length}:point('campus',game.activeServer);focusCamera(p.x,p.y,1.5);notify(game.activeServer===game.faction?'Returned to your home continent':`Entered ${FACTIONS[game.activeServer].name}'s server continent`);
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
 if(cinematic){const army=game.units.filter(u=>u.server===game.activeServer&&!u.transit&&u.team==='player'&&ROLES.find(r=>r.key===u.role).dps>0),base=point('campus',game.activeServer),p=game.time<9?point('campus',game.activeServer):army.length?{x:army.reduce((n,u)=>n+u.x,0)/army.length,y:army.reduce((n,u)=>n+u.y,0)/army.length}:base;camera.x+=(p.x-camera.x)*.012;camera.y+=(p.y-camera.y)*.012;camera.zoom+=((game.activeServer===game.faction?1.25:1.55)-camera.zoom)*.012;scale=Math.max(width/WORLD.width,height/WORLD.height)*camera.zoom;}
}
function renderRoster(){
 $('roster').innerHTML=ROLES.map(r=>`<button data-role="${r.key}" title="${UNITS[game.faction][r.index].name} — ${r.hint}" aria-label="Deploy ${UNITS[game.faction][r.index].name}, ${unitType(game.faction,r.key).cost} funds"><small>0${r.index+1}</small>${thumb(game.faction,r.index)}<span class="role-name">${ROLE_LABELS[r.key]}</span><b>${UNITS[game.faction][r.index].name}</b><em>${unitType(game.faction,r.key).cost} / ${unitType(game.faction,r.key).compute} CP</em></button>`).join('');
 for(const b of $('roster').querySelectorAll('button'))b.onclick=()=>{if(!tutorialAllows(game,b.dataset.role))return;const r=deploy(game,b.dataset.role);if(!r.ok)notify(r.reason);else notify('Deployment queued: '+UNITS[game.faction][ROLES.find(r=>r.key===b.dataset.role).index].name);renderUI();};
}
function time(v){return `${Math.floor(v/60).toString().padStart(2,'0')}:${Math.floor(v%60).toString().padStart(2,'0')}`;}
function renderGuidance(){
 const t=game.tutorial;if(t)updateTutorial(game);const l=activeLesson=lesson(game),campusLesson=['build','research','expand','specialize'].includes(tutorialPhase(game));$('tutorial-panel').hidden=!t;$('lesson-tech').hidden=!campusLesson;
 if(t){
  if(t.ready)orderProblem='';
  const progress=tutorialProgress(game),key=[t.objectiveId,t.opening,t.support,t.final,game.infrastructure?.[game.faction]?.revision||0,t.formationRallied,t.formationCasts.join(',')].join(':');
  if(key!==guideKey){const changedStep=guideKey?.split(':')[0]!==t.objectiveId;guideKey=key;
   $('lesson-number').textContent=`${progress.completed} / ${progress.total} goals`;$('lesson-title').textContent=progress.chapter+' · '+l.title;
   if(changedStep){document.querySelector('#tutorial-panel .lesson-explainer').open=false;document.querySelector('#tutorial-panel .lesson-body').scrollTop=0;}
   $('lesson-copy').textContent=l.copy;$('lesson-task').textContent=l.task;$('lesson-progress').innerHTML=LESSONS.map(goal=>`<i class="${goal.id===tutorialGoal(game)?'current':goal.id==='formation'?(t.completed.includes('formation.open')&&t.completed.includes('formation.finish')?'done':''):t.completed.includes(goal.id)?'done':''}"></i>`).join('');
   const choices=tutorialChoices(game);$('lesson-choices').hidden=!choices.length;
   $('lesson-choices').innerHTML=choices.length?'<legend>'+ (l.choice==='final'?'One final specialization per mission':'Compare your three branches')+'</legend>'+choices.map(c=>`<button type="button" data-tutorial-branch="${c.index}" aria-pressed="${c.selected}" ${c.disabled?'disabled':''}><strong>${c.name}</strong><span>${c.cost} funds${l.choice==='final'?' · final research':' · construction'}</span></button>${c.selected?`<div class="lesson-choice-detail"><p>${c.effect}</p><p>${c.advice}</p></div>`:''}`).join(''):'';
   for(const button of $('lesson-choices').querySelectorAll('button'))button.onclick=()=>{if(chooseTutorialBranch(game,Number(button.dataset.tutorialBranch)))renderUI();};
  }
  $('lesson-task').textContent=l.task;$('lesson-status').textContent=recoveryProblem||(t.failure?'HI_ENCOUNTER_FAILED · '+t.failure:orderProblem?'HI_ORDER_BLOCKED · '+orderProblem:tutorialStatus(game));$('lesson-status').classList.toggle('complete',t.ready||t.complete);$('lesson-action').textContent=t.failure?'Retry '+(archive.checkpoint?.id||'training'):recoveryProblem?(archive.errorCode==='HI_CHECKPOINT_PREPARE'?'Retry recovery preparation':'Retry '+(archive.checkpoint?.id||'training')):l.action;
  $('lesson-action').disabled=!t.failure&&!recoveryProblem&&(t.ready||!!game.result||game.paused||!!l.choice&&t[l.choice]===null||campusLesson&&!!game.infrastructure[game.faction].project);
  $('lesson-next').disabled=!t.ready||t.complete||game.paused;$('lesson-next').textContent=t.complete?'Training complete':t.ready?'Next lesson ↗':'Complete this order to continue';
 }
 const localUnits=game.units.filter(u=>u.team==='player'&&!u.transit&&u.server===game.activeServer),key=localUnits.map(u=>u.id).join(',');
 if(key!==unitListKey){unitListKey=key;$('unit-list').innerHTML=localUnits.map(u=>`<button data-unit="${u.id}" aria-label="Select ${UNIT_GUIDE[u.role].title}"><b>${UNITS[u.faction][ROLES.find(r=>r.key===u.role).index].name}</b><small>${ROLE_LABELS[u.role]} · #${u.id}</small><small data-unit-state></small></button>`).join('');for(const b of $('unit-list').querySelectorAll('button'))b.onclick=e=>{const u=game.units.find(u=>u.id===Number(b.dataset.unit));if(u){lessonCamera=false;select([u.id],e.shiftKey);if(!e.shiftKey)focusCamera(u.x,u.y,1.65);}};}
 for(const b of $('unit-list').querySelectorAll('button')){
  const unit=localUnits.find(u=>u.id===Number(b.dataset.unit));b.setAttribute('aria-pressed',String(selected.has(unit.id)));
  const job=unit.locked>0?'Locked out':unit.raid?'Transferring':unit.path.length?'Moving':unit.order==='research'?'Researching':unit.order==='harvest'?'Battery loop':unit.order==='cool'?'Connected':unit.order==='capture'?'Relay':unit.order==='siege'?'Siege':unit.order==='sabotage'?'Sabotage':unit.order==='attack'?'Attacking':'Holding';
  const text=Math.ceil(unit.hp)+'/'+unit.maxHp+' HP · '+job,state=b.querySelector('[data-unit-state]');if(state.textContent!==text)state.textContent=text;
 }
 const u=game.units.find(u=>selected.has(u.id)),site=inspected?.site,guide=u&&unitGuide(u.faction,u.role,UNIT_GUIDE[u.role],game);$('inspector').hidden=!site&&!guide;
 if(site){$('inspect-kind').textContent=`BUILDING / ${site.kind}`;$('inspect-name').textContent=site.name;$('inspect-copy').textContent=site.story;$('inspect-order').textContent=site.benefit;$('inspect-counter').textContent=site.risk;}
 else if(guide){$('inspect-kind').textContent=`${u.team==='player'?'FRIENDLY':'HOSTILE'} / ${UNIT_GUIDE[u.role].title.toUpperCase()}`;$('inspect-name').textContent=UNITS[u.faction][ROLES.find(r=>r.key===u.role).index].name;$('inspect-copy').textContent=guide.job;$('inspect-order').textContent=guide.order;$('inspect-counter').textContent=guide.stats+' · '+guide.counter;}
 const facility=site&&game.infrastructure?.[game.activeServer]?.buildings[site.id];if(facility){$('inspect-order').textContent=(facility.hp>0?Math.ceil(facility.hp)+' / '+facility.maxHp+' HP · online':facility.built?'OFFLINE — benefits disabled':'Unbuilt site')+' · '+site.benefit;}
 $('inspect-action').hidden=!facility;$('inspect-action').textContent=game.activeServer===game.faction?'Open this research branch ↗':'Attack with selected units';$('inspect-action').disabled=game.activeServer!==game.faction&&(game.paused||!!game.result||!(facility?.hp>0)||!game.units.some(u=>selected.has(u.id)&&u.team==='player'&&u.server===game.activeServer&&!u.transit&&unitType(u.faction,u.role).dps>0));
 $('selection-job').textContent=site?site.benefit:guide?guide.job:'';
 $('selection-kind').textContent=site?'BUILDING / '+site.kind.toUpperCase():selected.size>1?'FIELD TEAM':guide?guide.title.toUpperCase():'FIELD SELECTION';
 if(site){$('selection-name').textContent=site.name;$('selection-detail').textContent=facility?(facility.built?Math.ceil(facility.hp)+' / '+facility.maxHp+' HP · '+(facility.hp>0?'ONLINE':'OFFLINE'):'BUILD SITE · open Systems'):site.id==='campus'?`${Math.ceil(game.servers[game.activeServer].integrity).toLocaleString()} / ${game.servers[game.activeServer].maxIntegrity.toLocaleString()} integrity · keep this online`:site.benefit;}
 const roles=site?[]:localUnits.filter(x=>selected.has(x.id)).map(x=>x.role),field=roles.some(role=>ROLES.find(r=>r.key===role).dps>0);
 $('field-team').hidden=!roles.includes('researcher');$('harvest-order').hidden=!roles.includes('harvester');$('cool-order').hidden=!roles.some(r=>['cooler','cloud'].includes(r));
 $('select-combat').hidden=!!site||(!field&&!!roles.length);$('hold-order').hidden=!!site||!roles.length||!field;$('ability').hidden=!!site||!roles.length;
 $('selection-info').disabled=!site&&!guide;
 $('deployment-hint').hidden=ROLES.some(r=>tutorialAllows(game,r.key));
 $('deployment-hint').textContent='First, learn your campus. Unit deployment unlocks as you progress through training.';
 $('deployment-label').textContent=t?'DEPLOYMENT / UNLOCKS DURING TRAINING':'DEPLOY UNITS';
 if(t){$('lesson-action').hidden=!t.failure&&!recoveryProblem&&(t.ready||t.complete);$('lesson-next').hidden=!t.ready||t.complete;}
 
 const raidLocked=!!t&&!['transfer','recon','sabotage','endpoint'].includes(t.objectiveId);for(const b of $('server-navigation').querySelectorAll('button'))b.disabled=!!t&&b.dataset.server!==game.faction&&(raidLocked||b.dataset.server!==t.rival);$('attack-server').disabled=raidLocked||!!game.result;$('rival-target').disabled=raidLocked||!!t;if(t)$('rival-target').value=t.rival;
}
function renderUI(){
 needsDraw=true;if(saveWarning&&!ranked)$('save-status').textContent=saveWarning;compute(game);document.documentElement.style.setProperty('--accent',FACTIONS[game.faction].color);document.documentElement.style.setProperty('--accent-ink',FACTIONS[game.faction].dark);$('lab-name').textContent=FACTIONS[game.faction].name;$('game-clock').textContent=time(game.time);$('funds').textContent=Math.floor(game.funds);$('energy').textContent=Math.floor(game.energy);$('compute').textContent=`${game.used} / ${game.capacity}`;$('heat').textContent=Math.round(game.heat)+'°';$('heat').style.color=game.heat>heatThreshold(game)?'#ba4e32':'';$('quality').textContent=Math.round(game.quality)+'%';$('research-bar').style.transform=`scaleX(${game.progress/100})`;$('research-percent').textContent=Math.floor(game.progress)+'% verified';$('campus-integrity').textContent=Math.round(game.campus/10)+'%';
 const server=SERVERS[game.activeServer],target=game.attackTarget;
 $('objective-state').textContent=game.result==='victory'?'SERVER OFFLINE':target?'RAID ACTIVE':'HOME ONLINE';
 $('objective-copy').textContent=target?`Bring ${FACTIONS[target].name}'s campus endpoint offline. Your home harvesters, researchers and cooling fleet keep running while the raid is away.`:'Your own server is online. Start its energy and cooling economy, then choose an opponent to attack through the uplink.';
 $('field-status').textContent=game.activeServer===game.faction?'YOUR HOME SERVER / '+server.name:'RIVAL SERVER / '+FACTIONS[game.activeServer].name;
 document.querySelector('.field-title>span').textContent=FACTIONS[game.activeServer].name.toUpperCase()+' / '+(game.activeServer===game.faction?'YOUR HOME SERVER':'RIVAL SERVER');document.querySelector('.field-title h1').textContent=server.name;
 $('research-percent').textContent=Math.floor(game.progress)+'% endpoint disrupted';$('campus-integrity').textContent=Math.round(game.campus/game.servers[game.faction].maxIntegrity*100)+'%';$('raid-window').textContent=game.operation?'15-minute operation':game.tutorial?'Training · no timer':'180s showcase';
 document.querySelector('.briefing-art').style.backgroundImage=`linear-gradient(0deg,#293e36c9,transparent 60%),url('../servers/assets/${SERVERS[game.faction].image}')`;
 document.querySelector('.briefing-art>span').textContent=SERVERS[game.faction].name.toUpperCase();
 for(const button of $('server-navigation').querySelectorAll('button')){const id=button.dataset.server;button.setAttribute('aria-pressed',String(id===game.activeServer));button.querySelector('small').textContent=id===game.faction?'HOME / '+Math.round(game.campus/game.servers[game.faction].maxIntegrity*100)+'% INTEGRITY':game.visited.includes(id)?'VISITED / '+Math.round(game.servers[id].integrity/game.servers[id].maxIntegrity*100)+'% INTEGRITY':game.raids.some(r=>r.player&&r.target===id)?'TRANSFER STAGING / IN FLIGHT':game.operation?'UNVISITED / PLAN RAID':'UNVISITED / ATTACK TO ENTER';}
 $('return-team').disabled=game.activeServer===game.faction||!game.units.some(u=>u.team==='player'&&u.server===game.activeServer&&!u.transit&&!u.raid);
 $('next-wave').textContent=game.tutorial?'CONTROLLED TRAINING':game.operation?`RIVAL / ${game.operation.enemyAI?.mode==='defend'?'DEFENDING':game.operation.enemyAI?.mode==='recover'?'RECOVERING':'ASSEMBLING'}`:`CONTACT / ${Math.max(0,Math.ceil(game.nextWave-game.time))}s`;
 for(const id of selected)if(!game.units.some(u=>u.id===id&&u.server===game.activeServer&&!u.transit))selected.delete(id);
 const units=game.units.filter(u=>selected.has(u.id));const u=units[0];
 $('selection-name').textContent=units.length>1?units.length+' units selected':u?UNITS[u.faction][ROLES.find(r=>r.key===u.role).index].name:'No field selection';
 $('selection-detail').textContent=units.length>1?'A shared order follows each unit’s movement layer.':u?`${Math.ceil(u.hp)} / ${u.maxHp} integrity · ${u.locked>0?'LOCKED OUT '+Math.ceil(u.locked)+'s':u.infected>0?'INFECTED':u.path.length?'EN ROUTE':u.transit?'TRANSFERRING':u.raid?'UPLINK STAGING':u.order==='research'?'HOME RESEARCH':u.order==='siege'?'SERVER SIEGE':u.order==='cool'?'COOLING ONLINE':u.order==='harvest'?'BATTERY LOOP':'READY'}`:'Click a friendly unit. Right click a site to command.';
 const ready=units.filter(u=>!abilityProblem(game,u)),abilityCost=ready.length*60;
 $('ability').disabled=!ready.length||game.funds<abilityCost||!!game.result||game.paused;
 $('ability').textContent=(units.length===1?kit(units[0].faction).units[units[0].role][0]:'Group abilities')+' · '+(units.length===1&&units[0].abilityCooldown>0?Math.ceil(units[0].abilityCooldown)+'s':abilityCost||60);
 $('ability').title=units.length===1?(abilityProblem(game,units[0])||unitGuide(units[0].faction,units[0].role).order):'60 funds per ready unit. Select one unit to use its specific ability.';
 if(units.length===1&&u&&unitState(game,u))$('selection-detail').textContent+=' · '+unitState(game,u);
 for(const b of $('roster').querySelectorAll('button')){const type=unitType(game.faction,b.dataset.role),cost=techCost(game,game.faction,type.key,type.cost),cp=techCompute(game,game.faction,type.key,type.compute);b.hidden=!tutorialAllows(game,type.key);
 const reason=game.result?'Mission complete':game.queue.length>=4?'Queue full':game.funds<cost?`Need ${Math.ceil(cost-game.funds)} more funds`:game.used+cp>game.capacity?'Need more compute: deploy a floating cloud':game.operation&&game.units.filter(u=>u.team==='player'&&u.hp>0).length+game.queue.length>=24?'24-unit field limit':null;
 b.querySelector('em').textContent=cost+' / '+cp+' CP';b.disabled=!!reason;b.title=reason||`${UNITS[game.faction][type.index].name} — ${unitGuide(game.faction,type.key,{},game).job}`;b.setAttribute('aria-label',`Deploy ${UNIT_GUIDE[type.key].title}: ${UNITS[game.faction][type.index].name}, ${cost} funds${reason?', '+reason:''}`);}
 const qkey=game.queue.map(q=>q.role+q.total).join(',');if(qkey!==queueKey){queueKey=qkey;$('queue').innerHTML=game.queue.map((q,i)=>`<button data-queue="${i}" aria-label="Cancel ${UNITS[game.faction][ROLES.find(r=>r.key===q.role).index].name} deployment"><i></i><span>${UNITS[game.faction][ROLES.find(r=>r.key===q.role).index].name}</span><span></span></button>`).join('');for(const b of $('queue').querySelectorAll('button'))b.onclick=()=>{cancelDeployment(game,Number(b.dataset.queue));renderUI();};}for(const [i,b]of [...$('queue').querySelectorAll('button')].entries()){const q=game.queue[i];b.querySelector('i').style.transform=`scaleX(${1-q.remaining/q.total})`;b.lastElementChild.textContent=game.operation?.productionPaused?'WAIT · STAFF ×':Math.ceil(q.remaining)+'s ×';}
 renderGuidance();renderOperation();renderTechnology();
 const event=game.events[0];if(event&&event.text!==lastLog){lastLog=event.text;if(cinematic&&event.text.includes('disruption team'))notify(event.text);$('event-log').replaceChildren(...game.events.slice(0,4).map(e=>{const li=document.createElement('li'),stamp=document.createElement('time');stamp.textContent=time(e.time);li.append(stamp,document.createTextNode(e.text));return li;}));}
 if(game.result&&!resultShown){resultShown=true;
  const win=game.result==='victory';const handoff=trainingHandoff(game.faction,game.tutorial?.rival,accountUser);$('training-operation').textContent=handoff.practice;$('training-handoff').hidden=!(win&&game.tutorial);$('training-handoff').textContent=handoff.note;$('training-allegiance').hidden=!(win&&game.tutorial&&handoff.changeHref);$('training-allegiance').href=handoff.changeHref||'#';$('training-operation').hidden=!(win&&game.tutorial);$('training-ranked').hidden=!(win&&game.tutorial);$('training-ranked').href=handoff.href;$('training-ranked').textContent=handoff.ranked;$('result-title').textContent=win&&game.tutorial?'First Light complete.':win?'Rival server offline.':game.result==='timeout'?'The raid window closed.':'Your home server went dark.';$('result-copy').textContent=win&&game.tutorial?'You built a faction campus, chose a final specialization, used your formation advantage, countered the rival and disabled its technology. In Blackout Protocol, rivals rebuild and adapt; capture the data relay before the final siege.':win?`${FACTIONS[game.faction].name} breached ${FACTIONS[game.attackTarget].name}'s own continent. Home operations stayed online.`:'Stage models, agents and a firewall at your home uplink. Keep home researchers, energy and cooling running while the raid advances.';
  const scored=scoreOperation(game);let savedResult=null;if(scored&&!autoOperation&&!ranked){savedResult=archive.record(game,runId,settings.callsign);archive.clearSave();}
  else if(game.tutorial){if(win)archive.clearSave(game);else archive.markTrainingDefeat(game,runId);}
  $('training-retry').hidden=!game.tutorial||win||!archive.checkpoint;$('result-takeaway').textContent=game.tutorial?tutorialTakeaway(game):'';
  $('result-stats').innerHTML=`<div><small>RUN TIME</small><strong>${time(game.time)}</strong></div><div><small>${ranked?'SERVER SCORE':scored?'LOCAL SCORE':'CONTAINED'}</small><strong>${ranked?'PENDING':scored?scored.score:game.stats.contained}</strong></div><div><small>${scored?'MEDAL':'DISRUPTED'}</small><strong>${ranked?'—':scored?scored.medal:Math.floor(game.progress)+'%'}</strong></div>`;
  $('score-breakdown').replaceChildren();if(scored&&!ranked){for(const [key,value]of Object.entries(scored.breakdown)){const row=document.createElement('div');row.textContent=`${key.charAt(0).toUpperCase()+key.slice(1)} · ${value}`;$('score-breakdown').append(row);}const note=document.createElement('p');note.textContent=autoOperation?'Director demonstration. This result does not enter your local standings.':!savedResult?'Browser storage could not keep this result. Your score remains visible in this debrief.':win?'Recorded in this browser. Secure the relay and protect home to improve your medal.':'No ranked local points for a failed operation. Try a stronger home defence or earlier offshore expansion.';$('score-breakdown').append(note);}
  $('scene-caption').querySelector('strong').textContent=win?'Their server went dark. Yours stayed online.':'Every server has a breaking point.';
  renderVerified();if(ranked)ranked.pump();
  if(cinematic)notify(win?'RIVAL SERVER OFFLINE · HOME CONTINENT ONLINE':'THE RAID WINDOW CLOSED');else $('result').showModal();
 }
}
function ellipse(x,y,rx,ry,color,stroke=false){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(stroke){ctx.strokeStyle=color;ctx.stroke();}else{ctx.fillStyle=color;ctx.fill();}}
function label(text,x,y,color='#f8f4e7',ink='#334d3e',size=14){const matrix=ctx.getTransform(),factor=Math.hypot(matrix.a,matrix.b)/dpr,fontSize=Math.max(size,14/factor),padding=9/factor,boxHeight=fontSize+10/factor;ctx.font=`${fontSize}px 'Courier New',monospace`;const w=ctx.measureText(text).width+padding*2,left=x-w/2,top=y-boxHeight*.65;if(left<6||left+w>width-6||top<6||top+boxHeight>height-6||hudKeepouts.some(b=>left<b.x+b.width&&left+w>b.x&&top<b.y+b.height&&top+boxHeight>b.y))return;ctx.fillStyle=color;ctx.fillRect(left,top,w,boxHeight);ctx.fillStyle=ink;ctx.textAlign='center';ctx.fillText(text,x,y+2/factor);}
function draw(){
 live.render(game,camera,selected,renderTime);const overlayStart=performance.now();live.timings.overlayMs=0;if(cinematic)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 const sites=serverSites(game.activeServer),hoverHit=hover&&!drag?live.pick(hover):null,healthViewport={width,height,blocked:[...hudKeepouts]};
 const attacked=game.effects.some(e=>e.server===game.activeServer&&e.kind==='siege');
 const campusHealth=buildingHealth(game.servers[game.activeServer],{attacked,inspected:hoverHit?.site==='campus'||inspected?.site?.id==='campus'});
 const focused=game.units.find(u=>selected.has(u.id)),contextSite=activeLesson?.site||inspected?.site?.id||(focused?.role==='researcher'?'lab':focused?.role==='harvester'?'grid':['cooler','cloud'].includes(focused?.role)?'intake':null);
 for(const site of sites){if(site.id==='campus'&&campusHealth)continue;if(site.id.startsWith('facility')){if(game.infrastructure?.[game.activeServer]?.buildings[site.id]?.built||contextSite!==site.id)continue;}if(tutorialPhase(game)!=='campus'&&!['campus','gate',contextSite].includes(site.id))continue;const p=live.project(site,.25);if(p.x>30&&p.x<width-30&&p.y>40&&p.y<height-35)label(site.name,p.x,p.y+24,'#f5f1e8ed','#294837',14);}
 for(const u of unitCallouts(game.units.filter(u=>u.server===game.activeServer),selected,activeLesson?.role)){
  const p=live.project(u,u.role==='model'?5:3.4);if(p.x<30||p.x>width-30||p.y<25||p.y>height-30)continue;label(UNIT_GUIDE[u.role].title,p.x,p.y-9,'#f5f1e8f0','#294837',14);
 }
 if(campusHealth){const site=sites.find(s=>s.id==='campus'),p=live.siteAnchor('campus');if(p&&p.x>-120&&p.x<width+120&&p.y>0&&p.y<height)healthViewport.blocked.push(drawBuildingHealth(ctx,site.name,campusHealth,p,healthViewport));}
 for(const site of sites.filter(s=>s.id.startsWith('facility'))){const b=game.infrastructure?.[game.activeServer]?.buildings[site.id];if(!b?.built)continue;const attacked=b.hitUntil>game.time,inspect=hoverHit?.site===site.id||inspected?.site?.id===site.id;if(!attacked&&!inspect)continue;const hp=buildingHealth({integrity:b.hp,maxIntegrity:b.maxHp},{attacked,inspected:inspect}),p=live.siteAnchor(site.id);if(hp&&p&&p.x>0&&p.x<width&&p.y>0&&p.y<height)healthViewport.blocked.push(drawBuildingHealth(ctx,site.name,hp,p,healthViewport));}
 if(game.tutorial&&!cinematic){const l=activeLesson,q=point(l.site,game.activeServer),p=live.project(q,.3),radius=Math.max(25,54*camera.zoom);ctx.strokeStyle=FACTIONS[game.faction].color;ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.beginPath();ctx.ellipse(p.x,p.y,radius,radius*.45,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
 if(game.operation&&game.activeServer===game.operation.rival&&!cinematic){const q=point(game.operation.relay.node,game.activeServer),p=live.project(q,.8);label(game.operation.relay.captured?'DATA RELAY · SECURED':'DATA RELAY · OPTIONAL',p.x,p.y-38,'#20382fee','#f8f0df',14);}
 if(drag&&drag.kind==='select'&&Math.hypot(drag.current.x-drag.start.x,drag.current.y-drag.start.y)>6){ctx.fillStyle='#f7f4e62b';ctx.strokeStyle=FACTIONS[game.faction].color;ctx.lineWidth=1;ctx.fillRect(drag.start.x,drag.start.y,drag.current.x-drag.start.x,drag.current.y-drag.start.y);ctx.strokeRect(drag.start.x,drag.start.y,drag.current.x-drag.start.x,drag.current.y-drag.start.y);}
 if(hoverHit){const u=hoverHit.unit?game.units.find(u=>u.id===hoverHit.unit):null,site=hoverHit.site?sites.find(s=>s.id===hoverHit.site):null;if(u||site){const text=u?`${UNITS[u.faction][ROLES.find(r=>r.key===u.role).index].name} · ${FACTIONS[u.faction].name} · ${Math.ceil(u.hp)} / ${u.maxHp}${unitState(game,u)?' · '+unitState(game,u):''}`:site.name;label(text,Math.max(180,Math.min(width-180,hover.x)),Math.max(35,hover.y-45),u&&u.team!=='player'?'#4d2924f2':'#f5f1e7ed',u&&u.team!=='player'?'#fff0e7':'#2d4b3a',14);}}
 live.minimap(mc,game);for(const u of game.units.filter(u=>u.server===game.activeServer&&!u.transit)){mc.fillStyle=u.team==='player'?FACTIONS[game.faction].color:'#ef6d5e';mc.fillRect(u.x/WORLD.width*220-2,u.y/WORLD.height*124-2,4,4);}mc.strokeStyle='#faf4d4';mc.lineWidth=1.5;mc.strokeRect(camera.x/WORLD.width*220-20,camera.y/WORLD.height*124-15,40,30);live.timings.overlayMs=performance.now()-overlayStart;
}

function frame(now){
 const callbackAt=performance.now(),wasActive=started&&!game.paused&&!game.result&&!document.hidden;
 attribution.callback(now,callbackAt);cadence.callback(now);
 const rawElapsed=Math.max(0,(now-(last||now))/1000),elapsed=Math.min(.25,rawElapsed);last=now;
 if(started&&!game.paused&&!document.hidden)renderTime+=rawElapsed;
 if(lessonCamera&&game.tutorial&&activeLesson?.follow&&!game.paused){const u=game.units.find(u=>u.team==='player'&&u.role===activeLesson?.role&&u.server===game.activeServer&&!u.transit);if(u&&u.moving){const k=1-Math.exp(-elapsed*2.5);camera.x+=(u.x-camera.x)*k;camera.y+=(u.y-camera.y)*k;}}
 if(ranked&&started){ranked.advance(game);syncServer();if(!document.hidden)audioPulse();}
 else if(started&&!game.paused&&!document.hidden){accumulator+=rawElapsed;while(accumulator>=.05){director();if(autoOperation)directOperation(game);tickOperation(game,.05);updateTutorial(game);syncServer();accumulator-=.05;if(game.result){accumulator=0;break;}}saveClock+=rawElapsed;if(saveClock>=15){saveRun();saveClock=0;}audioPulse();}
 const simulationEnd=performance.now();
 uiClock+=elapsed;if(uiClock>.25&&(needsDraw||started&&!game.paused&&(!game.result||!resultShown))){renderUI();uiClock=0;}
 const uiEnd=performance.now();
 if(now>toastUntil)$('toast').hidden=true;
 if(!document.hidden&&(needsDraw||started&&!game.paused)&&cadence.due(now,started&&!game.paused,needsDraw)){
  const gap=lastDraw?(now-lastDraw)/1000:0,drawStart=performance.now();draw();const drawEnd=performance.now(),drawMs=drawEnd-drawStart;
  if(wasActive&&gap>0){
   // Include the last active interval when simulation reaches the result.
   // The result-screen draw itself remains outside active gameplay draw cost.
   monitor.record(gap*1000,game.result?0:drawMs);
   const record=attribution.draw({frameId:live.frameId,time:game.time,rafAt:now,callbackAt,simulationEnd,uiEnd,drawStart,drawEnd,at:drawEnd,gap,drawMs,terminal:!!game.result,server:game.activeServer,units:game.units.length,timings:{...live.timings},programs:live.renderer.info.programs.length,...(live.profiler&&drawMs>60?{profile:live.profiler.stats()}: {})});
   if(gap>.05||drawMs>20){worstFrames.push({frame:record,prior:frameHistory.at(-1)||null});worstFrames.sort((a,b)=>Math.max(b.frame.gap*1000,b.frame.drawMs)-Math.max(a.frame.gap*1000,a.frame.drawMs));if(worstFrames.length>24)worstFrames.length=24;}
   frameHistory.push(record);if(frameHistory.length>4096)frameHistory.splice(0,1024);
   if(live.profiler){const label=`hi-frame/${live.frameId}`;performance.measure(label,{start:callbackAt,end:drawEnd});performance.clearMeasures(label);}
  }
  lastDraw=now;cadence.drawn(now);needsDraw=false;
  if(gap>0){fpsSamples.push(gap);if(fpsSamples.length>60)fpsSamples.shift();canvas.dataset.fps=String(Math.round(fpsSamples.length/fpsSamples.reduce((n,v)=>n+v,0)));}
 }
 requestAnimationFrame(frame);
}
canvas.addEventListener('pointerdown',e=>{if(!started||game.paused||game.result)return;if(drag||e.button===2)return;canvas.focus({preventScroll:true});const p=pointer(e);if(e.button===1)lessonCamera=false;drag={id:e.pointerId,kind:e.button===1?'pan':'select',start:p,current:p,camera:{...camera},add:e.shiftKey};canvas.setPointerCapture(e.pointerId);e.preventDefault();});
canvas.addEventListener('pointermove',e=>{hover=pointer(e);if(drag&&drag.id===e.pointerId){drag.current=hover;if(drag.kind==='pan'){setCamera(drag.camera.x-(hover.x-drag.start.x)/scale,drag.camera.y-(hover.y-drag.start.y)/scale);}}});
canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;canvas.releasePointerCapture(e.pointerId);if(d.kind==='pan')return;if(isPreview){const hit=live.pick(pointer(e));if(hit?.site)parent.postMessage({type:'inspect-server-site',server:game.faction,id:hit.site},location.origin);return;}const p=pointer(e),moved=Math.hypot(p.x-d.start.x,p.y-d.start.y)>7;if(moved){select(game.units.filter(u=>{const q=screen(u);return u.team==='player'&&u.server===game.activeServer&&!u.transit&&q.x>=Math.min(d.start.x,p.x)&&q.x<=Math.max(d.start.x,p.x)&&q.y>=Math.min(d.start.y,p.y)&&q.y<=Math.max(d.start.y,p.y);}).map(u=>u.id),d.add);}else{const hit=unitHit(world(p));if(hit?.team==='player')select([hit.id],d.add);else{const site=siteHit(world(p));if(site)inspectSite(site.id);else orderAt(world(p));}}});
canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('pointerleave',()=>hover=null);canvas.addEventListener('contextmenu',e=>{e.preventDefault();orderAt(world(pointer(e)));});
canvas.addEventListener('wheel',e=>{e.preventDefault();lessonCamera=false;const p=pointer(e),before=world(p);camera.zoom=Math.max(.45,Math.min(3.2,camera.zoom*Math.exp(-e.deltaY*.001)));live.updateCamera(camera);const after=world(p);setCamera(camera.x+before.x-after.x,camera.y+before.y-after.y);},{passive:false});
mini.addEventListener('pointerdown',e=>{lessonCamera=false;const r=mini.getBoundingClientRect();setCamera((e.clientX-r.left)/r.width*WORLD.width,(e.clientY-r.top)/r.height*WORLD.height);});
document.addEventListener('keydown',e=>{if($('briefing').open||$('result').open||$('help').open||$('archive').open)return;if(e.target.closest?.('input,select,textarea,button,a,summary,[contenteditable=true]')||e.altKey||e.metaKey||e.ctrlKey)return;
 if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();setPause(!game.paused);}if(e.key.toLowerCase()==='c')setCinematic(!cinematic);if(e.key.toLowerCase()==='h')focusCamera(point('campus',game.activeServer).x,point('campus',game.activeServer).y,1.4);if(e.key.toLowerCase()==='f')fit();
 if(e.key.toLowerCase()==='e')useAbility();
 if(e.key.toLowerCase()==='s'){const count=holdPosition(game,[...selected]);if(count)notify('Selected units holding position.');}
 if(/^[1-8]$/.test(e.key)&&tutorialAllows(game,ROLES[Number(e.key)-1].key)){const result=deploy(game,ROLES[Number(e.key)-1].key);if(!result.ok)notify(result.reason);renderUI();}
 if(e.key==='Tab'&&e.target===canvas){e.preventDefault();const units=game.units.filter(u=>u.team==='player'&&u.server===game.activeServer&&!u.transit),current=units.findIndex(u=>selected.has(u.id));if(units.length)select([units[(current+1)%units.length].id]);}
 if(e.key==='Escape'&&cinematic)setCinematic(false);
});
function fit(){const view=live.fitView(game.activeServer);setCamera(view.x,view.y,view.zoom);}
$('field-team').onclick=()=>fieldOrder('research');$('attack-server').onclick=()=>{const r=launchRaid(game,$('rival-target').value,game.operation?[...selected]:null);notify(r.ok?'Selected field team staging at home. The rival continent opens after transfer.':r.reason);};$('return-team').onclick=()=>{const r=returnHome(game,[...selected]);notify(r.ok?'Selected field team staging for return to home.':r.reason);};$('harvest-order').onclick=()=>fieldOrder('harvest');$('cool-order').onclick=()=>fieldOrder('cool');$('ability').onclick=useAbility;
$('pause').onclick=()=>setPause(!game.paused);$('resume').onclick=()=>setPause(false);$('zoom-in').onclick=()=>{lessonCamera=false;setCamera(camera.x,camera.y,camera.zoom*1.2);};$('zoom-out').onclick=()=>{lessonCamera=false;setCamera(camera.x,camera.y,camera.zoom/1.2);};$('fit').onclick=()=>{lessonCamera=false;fit();};$('home-camera').onclick=()=>focusCamera(point('campus',game.activeServer).x,point('campus',game.activeServer).y,1.4);
$('camera-mode').onclick=()=>setCinematic(!cinematic);$('exit-camera').onclick=()=>setCinematic(false);$('start').onclick=()=>start(false);$('showcase').onclick=()=>start(true);$('tutorial-start').onclick=()=>start(false,true);
$('lesson-action').onclick=guidedOrder;
$('lesson-next').onclick=()=>trainingTransition(()=>{const p=tutorialPhase(game);if(game.tutorial?.ready&&!game.paused){if(p==='cloud'&&!prepareRecovery('Sustain campus')||p==='counter'&&!prepareRecovery('Rival breach')){setPause(true);renderUI();return;}if(advanceTutorial(game)){lessonCamera=false;orderProblem='';saveRun();renderUI();}}});$('lesson-tech').onclick=()=>showPanel('systems');
$('lesson-help').onclick=()=>{helpReturn=$('lesson-help');showPanel('details');$('return-order').hidden=false;$('return-order').focus();};
$('return-order').onclick=()=>{showPanel('mission');$('return-order').hidden=true;helpReturn?.focus();};
$('training-retry').onclick=retryTraining;
$('standings-retry').onclick=()=>standings.load(true);
$('lesson-focus').onclick=focusLesson;
$('sound').onclick=async()=>{if(!audio)audio=new BattleAudio();sound=!sound;await audio.enable(sound);$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound));};
$('training-operation').onclick=()=>{$('verified-run').checked=false;$('confirm-faction').checked=false;chosen=game.faction;for(const b of $('faction-options').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.faction===chosen));rivalChoices();if(game.tutorial)$('operation-rival').value=game.tutorial.rival;accountMode();start(false,false);};
$('replay').onclick=showMenu;$('new-run').onclick=showMenu;$('continue-save').onclick=restoreRun;$('continue-verified').onclick=()=>start(false,false,true);$('verified-reconnect').onclick=()=>reconnectVerified();$('verification-retry').onclick=()=>reconnectVerified();
$('brand-menu').onclick=e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();showMenu();};
$('callsign').addEventListener('change',()=>{archive.updateSettings({callsign:$('callsign').value});settings=archive.settings();});
$('cancel-upgrade').onclick=()=>{if(game.infrastructure?.[game.faction]?.project?cancelProject(game):cancelUpgrade(game))notify('Unused infrastructure work refunded.');renderUI();};
$('doctrine-button').onclick=()=>{const r=activateDoctrine(game);notify(r.ok?DOCTRINES[game.faction].name+' activated.':r.reason);renderUI();};
$('select-combat').onclick=()=>{select(game.units.filter(u=>u.team==='player'&&u.server===game.activeServer&&!u.transit&&!u.raid&&ROLES.find(r=>r.key===u.role).dps>0).map(u=>u.id));notify('Field team selected. Shift-click a unit to adjust your group.');};
$('rally-endpoint').onclick=()=>{const ids=game.units.filter(u=>u.team==='player'&&u.server===game.operation?.rival&&!u.transit&&ROLES.find(r=>r.key===u.role).dps>0).map(u=>u.id);const count=command(game,ids,'siege','campus');if(count){select(ids);notify('Field team rallying at the rival endpoint.');}};
$('relay-order').onclick=()=>{const r=captureRelay(game,[...selected]);notify(r.ok?'Selected team moving to secure the data relay.':r.reason);};
$('hold-order').onclick=()=>{const count=holdPosition(game,[...selected]);notify(count?'Selected team holding position.':'Select a friendly unit first.');};
function inspectHome(){viewServer(game,game.faction);syncServer();const p=point('campus',game.faction);focusCamera(p.x,p.y,1.45);renderUI();}
$('home-alert').onclick=inspectHome;
$('open-tech').onclick=()=>showPanel('systems');
$('inspect-action').onclick=()=>{const site=inspected?.site;if(!site)return;if(game.activeServer===game.faction){showPanel('systems');const def=branchAt(game.faction,site.id),branch=$('upgrade-options').querySelector('[data-branch="'+def.id+'"]');branch.open=true;branch.scrollIntoView({block:'nearest'});}else{const count=command(game,[...selected],'sabotage',site.id);notify(count?'Selected units attacking '+site.name+'.':'Select a combat team on this continent first.');}};
$('operation-action').onclick=()=>{
 const guide=operationGuide(game,[...selected]);if(!guide)return;
 if(guide.action==='home'){inspectHome();return;}
 if(guide.action==='defend'){inspectHome();select(game.units.filter(u=>u.team==='player'&&u.server===game.faction&&!u.transit&&!u.raid&&ROLES.find(r=>r.key===u.role).dps>0).map(u=>u.id));return;}
 if(guide.action==='economy'){const r=activateEconomy(game);notify(r.ok?'Crews dispatched. Research starts on arrival; batteries and cooling stay at home.':r.reason);renderUI();return;}
 if(guide.action==='deploy'){const r=deploy(game,guide.suggested);notify(r.ok?'Unit queued below. Its cost and compute are reserved.':r.reason);renderUI();return;}
 if(guide.action==='queue'){$('queue').querySelector('button')?.focus();notify('The queue below shows assembly progress. Clicking a queued unit cancels it.');return;}
 if(guide.action==='select'){select(suggestedRaid(game));notify('Suggested raid selected. One model and one firewall remain at home. Shift-click to adjust.');return;}
 if(guide.action==='transfer'){const r=launchRaid(game,game.operation.rival,[...selected]);notify(r.ok?'Selected team heading to the uplink. Your supply crews stay at home.':r.reason);renderUI();return;}
 if(guide.action==='watch'){const p=point('gate',game.faction);viewServer(game,game.faction);syncServer();focusCamera(p.x,p.y,1.25);return;}
 if(guide.action==='rival'){viewServer(game,game.operation.rival);syncServer();renderUI();return;}
 if(guide.action==='relay'){viewServer(game,game.operation.rival);syncServer();const p=point(game.operation.relay.node,game.operation.rival);focusCamera(p.x,p.y,1.5);const agent=game.units.find(u=>u.team==='player'&&u.server===game.operation.rival&&!u.transit&&u.role==='agent');if(agent)select([agent.id]);notify('Select a raider and choose Secure relay. You can also rally directly at the endpoint.');return;}
 $('rally-endpoint').click();
};

function openArchive(){archivePaused=game.paused;if(started&&!game.result)setPause(true);renderArchive();$('archive').showModal();}
$('archive-button').onclick=openArchive;$('result-archive').onclick=openArchive;$('menu-archive').onclick=openArchive;$('close-archive').onclick=()=>$('archive').close();$('archive').addEventListener('close',()=>{if(started&&!game.result)setPause(archivePaused);});
$('result-camera').onclick=()=>{$('result').close();setCinematic(true);};
$('help-button').onclick=()=>{helpPaused=game.paused;setPause(true);$('help').showModal();};$('close-help').onclick=()=>$('help').close();$('help').addEventListener('close',()=>setPause(helpPaused));
$('briefing').addEventListener('cancel',e=>e.preventDefault());
document.addEventListener('visibilitychange',()=>{if(ranked)return;accumulator=0;last=performance.now();if(document.hidden&&started&&!game.result)setPause(true);});new ResizeObserver(resize).observe($('battlefield'));
const hudObserver=new ResizeObserver(refreshHudKeepouts);for(const element of document.querySelectorAll('.field-title,.camera-tools,.mini-panel,.toast'))hudObserver.observe(element);

$('loading-retry').onclick=()=>location.reload();
window.addEventListener('hi-load-progress',e=>{$('loading-progress').value=Math.round(e.detail.loaded/e.detail.total*60);$('loading').querySelector('p').textContent='Preparing your field teams · '+e.detail.loaded+' / '+e.detail.total;});
try{
 await Promise.all([live.ready,...Object.keys(FACTIONS).flatMap(f=>ROLES.map(r=>imageLoad(f+'-'+r.key,`../servers/assets/portraits/${f}-${r.key}-v06.jpg`)))]);
 // First AudioContext creation can synchronously initialize the browser audio backend.
 // Pay that one-time cost during loading, keep it silent, and resume only on Sound.
 try{audio=new BattleAudio();await audio.enable(false);}catch{audio?.dispose();audio=null;}

 // Prepare every continent and combat shader before the player leaves loading.
 const warmBox=canvas.getBoundingClientRect();live.resize(warmBox.width,warmBox.height);
 for(const id of Object.keys(FACTIONS)){
  $('loading-progress').value=60+Object.keys(FACTIONS).indexOf(id)*13;$('loading').querySelector('p').textContent='Preparing '+FACTIONS[id].name+' · lighting, water and combat effects';
  const warm=createGame(id,'relaxed');warm.preview=true;warm.nextWave=Infinity;initInfrastructure(warm);for(const b of Object.values(warm.infrastructure[id].buildings)){b.built=true;b.hp=b.maxHp;}warm.infrastructure[id].completed=tree(id).branches.flatMap(b=>b.research.map(r=>r.id));warm.infrastructure[id].revision++;warm.units=warm.units.filter(u=>u.team==='player');for(const role of ['malware','cloud','model','firewall'])spawn(warm,role);if(live.pooling)for(const r of ROLES)spawn(warm,r.key,id,r.domain==='sea'?'homeDock':'campus',id);
  updateFactionState(warm,3);for(const u of warm.units)if(u.role==='model'&&id==='broke')u.boostUntil=6;for(const u of warm.units)if(u.role==='agent')u.markedUntil=6;
  const p=point('campus',id),view={x:p.x,y:p.y,zoom:1.35};
  // compileAsync prepares the default-framebuffer variants. Hidden impact
  // flares also need actual HDR/reflection draws before the first battle.
  warm.effects=Object.values(FACTIONS).flatMap((f,i)=>[
   {server:id,x:p.x+i*22,y:p.y,tx:p.x+i*22+22,ty:p.y,color:f.color,role:'model',life:1,max:1},
   {server:id,x:p.x+i*22,y:p.y+22,color:f.color,burst:true,life:1,max:1},
   {server:id,x:p.x+i*22,y:p.y-22,color:f.color,ring:true,life:1,max:1}
  ]);
  for(const phase of [0,.42,.7]){live.render(warm,view,new Set(),phase);await new Promise(resolve=>requestAnimationFrame(resolve));}
  if(live.renderer.extensions.has('KHR_parallel_shader_compile'))await live.renderer.compileAsync(live.scene,live.camera);else live.renderer.compile(live.scene,live.camera);
  live.render(warm,view,new Set(),.75);await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 $('faction-options').innerHTML=Object.entries(FACTIONS).map(([id,f])=>`<button data-faction="${id}" aria-pressed="${id===chosen}" style="--swatch:${f.color}"><i></i>${f.name}<small>${kit(id).name}</small></button>`).join('');

 rivalChoices();
 if(game.enemies.includes(params.get('rival')))$('operation-rival').value=params.get('rival');
 for(const b of $('faction-options').querySelectorAll('button'))b.onclick=()=>{chosen=b.dataset.faction;for(const button of $('faction-options').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===b));game=createGame(chosen);unitListKey=queueKey=null;lastServer=chosen;const region=SERVERS[chosen];setCamera(region.camera[0]*WORLD.width,region.camera[1]*WORLD.height,.95);rivalChoices();$('account-link').href=accountURL(chosen);if(!accountUser)$('account-link').textContent='Join '+FACTIONS[chosen].name+' / sign in ↗';renderNetwork();renderRoster();renderUI();};
 if(params.has('verified'))$('verified-run').checked=true;
 await refreshAccount();
 if(isPreview){chosen=previewOwner;game=createGame(chosen);game.preview=true;game.nextWave=Infinity;started=true;lastServer=chosen;document.body.classList.add('terrain-preview');const region=SERVERS[chosen];setCamera(region.camera[0]*WORLD.width,region.camera[1]*WORLD.height,1);fieldOrder('research');fieldOrder('harvest');fieldOrder('cool');}
 renderNetwork();renderRoster();renderUpgrades();refreshContinue();resize();renderUI();draw();if(live.renderer.extensions.has('KHR_parallel_shader_compile'))await live.renderer.compileAsync(live.scene,live.camera);else live.renderer.compile(live.scene,live.camera);$('loading').hidden=true;accountMode();if(!isPreview){if(params.has('tutorial'))start(false,true);else if(autoOperation)start(false,false);else{$('briefing').showModal();if(params.has('resume'))start(false,false,true);}}requestAnimationFrame(frame);
}catch(e){$('loading').querySelector('strong').textContent='The server could not open.';$('loading').querySelector('p').textContent='Your match has not started. Retry the download to continue. '+e.message;$('field-status').textContent=e.message;$('loading-retry').hidden=false;console.error(e);}

// Local, read-only telemetry for capture tooling and browser verification.
window.addEventListener('beforeunload',()=>{ranked?.close();saveRun();archive.release();audio?.dispose();live.dispose();});
window.hostileDemo={verified:()=>ranked?.summary()||null,frames:()=>frameHistory.slice(),worstFrames:()=>worstFrames.slice(),performance:()=>({...monitor.summary(),targetRenderHz:renderHz}),audio:()=>({enabled:sound,state:audio?.context.state||'not-created',voices:audio?.voices||0}),archive:()=>archive.history(),diagnostics:()=>structuredClone(archive.diagnostics),graphics:()=>live.stats(),snapshot:()=>structuredClone({game,selected:[...selected],camera,started,showcase,cinematic,animation:game.units.filter(u=>u.server===game.activeServer&&!u.transit).map(u=>({id:u.id,role:u.role,moving:u.moving,phase:u.animDistance,heading:u.heading}))}),worldToScreen:p=>screen(p)};
