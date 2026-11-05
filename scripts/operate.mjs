import http from 'node:http';
import path from 'node:path';
import {socketPath,verifyBackup,restoreBackup} from '../api/operations.mjs';
const [command,...argv]=process.argv.slice(2),args={};
for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith('--')||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Use named pairs: --data /absolute/data --destination /absolute/new-backup');args[argv[i].slice(2)]=argv[i+1];}
try{
 let result;
 if(command==='verify-backup')result=(await verifyBackup(args.source)).manifest;
 else if(command==='restore')result=await restoreBackup({source:args.source,destination:args.destination});
 else{
  if(!args.data||!path.isAbsolute(args.data))throw Error('Pass --data with the absolute private data directory (contains accounts.sqlite)');
  const socket=await socketPath(path.join(args.data,'accounts.sqlite'));
  result=await new Promise((resolve,reject)=>{const req=http.request({socketPath:socket,path:'/command',method:'POST',headers:{'Content-Type':'application/json'},timeout:120000},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>{try{const value=JSON.parse(body);if(res.statusCode!==200)reject(Error(value.error));else resolve(value);}catch(e){reject(e);}});});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Operator command timed out; inspect status before retrying')));req.end(JSON.stringify({command,...args}));});
 }
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
