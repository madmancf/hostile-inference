import {loadMailConfig} from './api/mail-delivery.mjs';
import {trustedProxies} from './api/client-source.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Accounts,accountHandler} from './api/accounts.mjs';
import {RankedService,rankedHandler} from './api/ranked-service.mjs';
import {leaderboardHandler} from './api/leaderboards.mjs';
import {startOperations} from './api/operations.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const port=Number(process.env.PORT||4180),host=process.env.HOST||'127.0.0.1';
const rehearsal=process.env.HI_LOCAL_REHEARSAL==='1';
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be 1–65535');
if(!process.env.HI_PUBLIC_ORIGIN)throw Error('HI_PUBLIC_ORIGIN is required');
const publicURL=new URL(process.env.HI_PUBLIC_ORIGIN);
if(publicURL.origin!==process.env.HI_PUBLIC_ORIGIN||publicURL.username||publicURL.password)throw Error('Use one exact public origin, without credentials, path or trailing slash');
if(rehearsal){if(!['127.0.0.1','localhost'].includes(publicURL.hostname)||!['127.0.0.1','localhost'].includes(host)||publicURL.protocol!=='http:'||publicURL.port!==String(port))throw Error('Local rehearsal must bind to its loopback HTTP origin');}
else if(publicURL.protocol!=='https:')throw Error('Production requires an HTTPS public origin');
if(!process.env.HI_DATA_DIR||!path.isAbsolute(process.env.HI_DATA_DIR))throw Error('HI_DATA_DIR must be an absolute persistent-storage path');
const data=path.resolve(process.env.HI_DATA_DIR);
if(data===root||data.startsWith(root+path.sep))throw Error('Keep persistent storage outside the immutable release directory');
const policy={origins:[publicURL.origin],secureCookies:!rehearsal,trustedProxies:trustedProxies(process.env.HI_TRUSTED_PROXIES)};
const accounts=await new Accounts({file:path.join(data,'accounts.sqlite'),origin:publicURL.origin,mailConfig:await loadMailConfig({origin:publicURL.origin,local:rehearsal}),requireVerifiedEmail:process.env.HI_REQUIRE_VERIFIED_EMAIL==='1'||!rehearsal}).init();
let ranked,operations;try{ranked=await new RankedService({accounts,releaseId:manifest.id,directory:path.join(data,'legacy-ranked')}).init();operations=await startOperations({accounts,ranked,release:{...manifest,root}});}catch(e){await ranked?.close();accounts.close();throw e;}
const handlers=[leaderboardHandler(accounts,ranked,policy),accountHandler(accounts,ranked,policy),rankedHandler(ranked,policy)];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.txt':'text/plain; charset=utf-8'};
const security={
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin',
 'Cross-Origin-Opener-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
 ...(!rehearsal?{'Strict-Transport-Security':'max-age=31536000'}:{})
};
const server=http.createServer(async(req,res)=>{
 if(closing){res.writeHead(503,{'Retry-After':'5'});return res.end('Server is restarting; retry shortly.');}
 for(const [k,v] of Object.entries(security))res.setHeader(k,v);
 try{
  const url=new URL(req.url,publicURL.origin);
  for(const handle of handlers)if(await handle(req,res,url))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:true,version:manifest.version,release:manifest.id,admission:ranked.policy.admission}));}
  // Exact manifest keys are the only public files, even if the package contains
  // private simulation/server code or storage is accidentally placed nearby.
  let name=decodeURIComponent(url.pathname);
  const prefix='/r/'+manifest.id+'/';
  if(name.startsWith(prefix)){
   name=name.slice(prefix.length);
   if(Object.hasOwn(manifest.routes,'/'+name)){res.writeHead(302,{Location:'/'+name+url.search,'Cache-Control':'no-store'});return res.end();}
   if(!Object.hasOwn(manifest.assets,name)){res.writeHead(404);return res.end('Not found');}
   const item=manifest.assets[name],gzip=item.gzip&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
   res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('ETag','"'+item.sha256+'"');
   if(item.gzip)res.setHeader('Vary','Accept-Encoding');if(gzip)res.setHeader('Content-Encoding','gzip');
   if(req.headers['if-none-match']==='"'+item.sha256+'"'){res.writeHead(304);return res.end();}
   res.setHeader('Content-Length',gzip?item.gzipBytes:item.bytes);res.writeHead(200);if(req.method==='HEAD')return res.end();
   const stream=createReadStream(path.join(root,'public',name)+(gzip?'.gz':''));stream.on('error',()=>res.destroy());stream.pipe(res);return;
  }
  if(['/account','/leaderboards','/demo'].includes(name)){res.writeHead(302,{Location:name+'/index.html'+url.search,'Cache-Control':'no-store'});return res.end();}
  const page=Object.hasOwn(manifest.routes,name)&&manifest.routes[name];if(!page){res.writeHead(404);return res.end('Not found');}
  // Development-only diagnostic switches do not reach the packaged renderer.
  if(name==='/demo/index.html'&&['profile','detail','coldActors','assets','cpuProfile','preview','autoplay'].some(k=>url.searchParams.has(k))){for(const k of ['profile','detail','coldActors','assets','cpuProfile','preview','autoplay'])url.searchParams.delete(k);res.writeHead(302,{Location:url.pathname+url.search,'Cache-Control':'no-store'});return res.end();}
  const body=await fs.readFile(path.join(root,'pages',page));res.writeHead(200,{'Content-Type':types['.html'],'Cache-Control':'no-cache','Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);
 }catch(error){if(!res.headersSent){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Invalid request');}else res.destroy();}
});
server.requestTimeout=15000;server.headersTimeout=10000;
accounts.mail.start();
server.listen(port,host,()=>console.log('RELEASE_READY: '+publicURL.origin+' / '+manifest.id));
let closing=false;async function close(){if(closing)return;closing=true;const stopped=new Promise(resolve=>server.close(resolve));server.closeIdleConnections();await stopped;await operations.close();await accounts.mail.close();await ranked.close();accounts.close();}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>close().then(()=>process.exit(0)));
