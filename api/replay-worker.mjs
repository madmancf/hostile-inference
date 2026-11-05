import {parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {replay,canonicalState,MAX_TICKS} from '../design-preview/demo/ranked-protocol.js';
import {rulesManifest} from './ranked-rules.mjs';
const invalid=message=>{const e=Error(message);e.invalid=true;throw e;};
const invalidCommands=new Set(['Cannot command rival units','Continent not visited','Unknown faction project','Commands after terminal state','Commands require an active operation']);
try{
 const manifest=await rulesManifest();if(manifest.id!==workerData.rulesId)throw Error('Rules version unavailable; this run cannot be verified');
 const began=performance.now(),r=replay(workerData.config,workerData.actions,workerData.checkpoint?.tick??MAX_TICKS);
 if(!r.game.result)invalid('Run has not reached a terminal state');
 if(r.consumed!==workerData.actions.length)invalid('Commands follow the terminal state');
 const digest=createHash('sha256').update(canonicalState(r.game)).digest('hex');
 if(workerData.checkpoint&&(workerData.checkpoint.tick!==r.tick||workerData.checkpoint.digest!==digest))invalid('Browser and server replay disagree');
 parentPort.postMessage({ok:true,result:{outcome:r.game.result,tick:r.tick,seconds:r.game.time,score:r.score.score,medal:r.score.medal,breakdown:r.score.breakdown,homeHP:r.game.campus,relay:r.game.operation.relay.captured,specialization:r.game.infrastructure[r.game.faction].specialization,digest,rulesId:manifest.id,commands:r.consumed,replayMs:performance.now()-began}});
}catch(error){parentPort.postMessage(error.invalid||invalidCommands.has(error.message)?{ok:false,kind:'invalid',error:error.message}:{ok:false,kind:'infrastructure',code:error.message.startsWith('Rules version')?'rules_unavailable':'replay_failure'});}
