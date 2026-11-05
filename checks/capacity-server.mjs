// Test-only server process: production handlers, clock, SQLite and replay workers.
// Observability and crash coordination use the parent IPC pipe, never HTTP.
import http from 'node:http';
import path from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {Worker} from 'node:worker_threads';
import {Accounts,accountHandler} from '../api/accounts.mjs';
import {RankedService,rankedHandler} from '../api/ranked-service.mjs';
import {leaderboardHandler} from '../api/leaderboards.mjs';
if(!process.send||!process.env.HI_CAPACITY_DATA)throw Error('Private load-test parent required');
const started=performance.now(),accounts=await new Accounts({file:path.join(process.env.HI_CAPACITY_DATA,'accounts.sqlite')}).init();
let watchWorker=false;
const ranked=await new RankedService({accounts,directory:path.join(process.env.HI_CAPACITY_DATA,'legacy'),workerFactory:options=>{
 const worker=new Worker(new URL('../api/replay-worker.mjs',import.meta.url),options);
 if(watchWorker){watchWorker=false;process.send({event:'worker-start'});}return worker;
}}).init();
const delay=monitorEventLoopDelay({resolution:20});delay.enable();let handlers,base;
const server=http.createServer(async(req,res)=>{try{for(const h of handlers)if(await h(req,res,new URL(req.url,base)))return;res.writeHead(404);res.end('{}');}catch{res.writeHead(500);res.end('{}');}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.HI_CAPACITY_PORT||0),'127.0.0.1',resolve);});
base='http://127.0.0.1:'+server.address().port;
const policy={origins:[base],trustedProxies:['127.0.0.1']};handlers=[accountHandler(accounts,ranked,policy),rankedHandler(ranked,policy),leaderboardHandler(accounts,ranked,policy)];
const stats=()=>({memory:process.memoryUsage(),eventLoopP95Ms:delay.percentile(95)/1e6,eventLoopMaxMs:delay.max/1e6,status:ranked.operationStatus()});
process.on('message',async message=>{
 try{
  if(message.command==='stats'){const rawMemory=process.memoryUsage();global.gc?.();process.send({event:'stats',id:message.id,rawMemory,retainedHeapAfterGC:true,...stats()});delay.reset();}
  if(message.command==='watch-worker') {watchWorker=true;process.send({event:'watching',id:message.id});}
  if(message.command==='close'){await new Promise(resolve=>server.close(resolve));await ranked.close();accounts.close();delay.disable();process.exit(0);}
 }catch(e){process.send({event:'error',message:e.message});}
});
process.on('disconnect',()=>process.exit(0));
process.send({event:'ready',base,pid:process.pid,startupMs:performance.now()-started,...stats()});
