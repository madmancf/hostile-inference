const output=process.env.HI_RANKED_OUTPUT||'output/playwright/ranked-current';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRankedGame,applyAction,replay,stateDigest,FACTION_IDS} from '../game/demo/ranked-protocol.js';
import {tickOperation} from '../game/demo/operation.js';
import {tree} from '../game/demo/faction-tech.js';

const reports=[];
for(const faction of FACTION_IDS){
 const config={faction,rival:FACTION_IDS.find(f=>f!==faction),difficulty:'standard'},g=createRankedGame(config),actions=[];let tick=0;
 const issue=action=>{const r=applyAction(g,action);actions.push({tick,action});return r;};
 const step=n=>{for(let i=0;i<n&&!g.result;i++){tickOperation(g,.05);tick++;}};
 assert.ok(issue({type:'economy'}).ok);
 assert.ok(issue({type:'deploy',role:'agent'}).ok);step(30);assert.ok(issue({type:'cancelDeployment',index:0}));
 const branch=tree(faction).branches[0];assert.ok(issue({type:'project',id:branch.id}).ok);step(30);assert.ok(issue({type:'cancelProject'}));
 assert.ok(issue({type:'project',id:branch.id}).ok);while(g.infrastructure[faction].project)step(1);
 const funds=g.funds;assert.equal(issue({type:'repair',site:'facility1'}).ok,false);assert.equal(g.funds,funds,'Full-health repair must not spend');
 const ids=g.units.filter(u=>u.team==='player'&&['model','firewall','agent'].includes(u.role)).map(u=>u.id);
 assert.equal(issue({type:'order',ids,kind:'move',target:{x:500,y:500}}),ids.length);step(50);assert.equal(issue({type:'hold',ids}),ids.length);
 assert.ok(issue({type:'raid',ids,target:config.rival}).ok);
 while(!g.result&&!g.units.some(u=>u.team==='player'&&u.server===config.rival&&!u.transit))step(1);
 assert.equal(g.result,null);const away=g.units.filter(u=>u.team==='player'&&u.server===config.rival&&!u.transit).map(u=>u.id);assert.ok(away.length);
 // The camera was never recorded. Return explicitly names the source continent.
 g.activeServer=faction;assert.ok(issue({type:'return',ids:away,source:config.rival}).ok);
 step(100);const replayed=replay(config,actions,tick);assert.equal(await stateDigest(g),await stateDigest(replayed.game));
 reports.push({faction,tick,commands:actions.length,types:[...new Set(actions.map(a=>a.action.type))],digest:await stateDigest(g)});
}
await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/action-paths.json',JSON.stringify({status:'passed',scope:'Paid command/replay paths without resource grants; full-health repair is a no-op. Damaged-facility repair behavior is covered by the existing faction-tech suite.',reports},null,2));console.log(JSON.stringify({status:'passed',factions:reports.length,types:reports[0].types}));
