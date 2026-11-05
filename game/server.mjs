import {loadMailConfig} from '../api/mail-delivery.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {RankedService,rankedHandler} from '../api/ranked-service.mjs';
import {leaderboardHandler} from '../api/leaderboards.mjs';
import {Accounts,accountHandler} from '../api/accounts.mjs';
import {startOperations} from '../api/operations.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
// A public checkout has no external art. Do not send contributors into a broken
// renderer or an entry page full of missing images. Full installations use the
// original pages; npm start still verifies the exact asset hashes separately.
const assetManifest=JSON.parse(await fs.readFile(path.join(root,'../docs/runtime-assets.json'),'utf8'));
const assetsPresent=(await Promise.all(Object.entries(assetManifest.assets).map(async([name,item])=>{
  try { const stat=await fs.stat(path.resolve(root,'..',name));return stat.isFile()&&stat.size===item.bytes; }
  catch(error){if(error.code==='ENOENT')return false;throw error;}
}))).every(Boolean);
const sourceOnly=process.env.HI_PREVIEW_SOURCE_ONLY==='1'||!assetsPresent;
const artPages=new Set(['/','/index.html','/demo/index.html','/v2/index.html','/v2/blueprint.html','/server-demo/index.html','/phase-one.html','/checks/art-comparison.html','/checks/factions.html']);
const designDir = path.resolve(root, '../.runtime/design-feedback');
const port = Number(process.env.HOSTILE_PREVIEW_PORT || 4178);
const testData=process.env.HI_PREVIEW_DATA_DIR;if(testData&&!path.isAbsolute(testData))throw Error('HI_PREVIEW_DATA_DIR must be absolute');
const accounts=await new Accounts({...(testData?{file:path.join(testData,'accounts.sqlite')}:{}),origin:'http://127.0.0.1:'+port,mailConfig:await loadMailConfig({origin:'http://127.0.0.1:'+port,local:true}),requireVerifiedEmail:process.env.HI_REQUIRE_VERIFIED_EMAIL==='1'}).init(),ranked=await new RankedService({accounts,...(testData?{directory:path.join(testData,'legacy-ranked')}: {})}).init(),handleRanked=rankedHandler(ranked,port),handleAccount=accountHandler(accounts,ranked,port),handleBoards=leaderboardHandler(accounts,ranked,port);
const operations=await startOperations({accounts,ranked,release:{root,id:'preview'}});
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if(await handleBoards(req,res,url)||await handleAccount(req,res,url)||await handleRanked(req,res,url))return;
    if (url.pathname === '/api/feedback' && req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}` && req.headers.origin !== `http://localhost:${port}`) { res.writeHead(403); return res.end('Invalid origin'); }
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 12000) { res.writeHead(413); return res.end('Feedback too long'); } }
      const input = JSON.parse(body);
      if (!['A', 'B', 'C'].includes(input.preferred) || typeof input.overall !== 'string' || input.overall.length > 5000) { res.writeHead(400); return res.end('Invalid feedback'); }
      const feedback = { preferred: input.preferred, overall: input.overall, faction: ['misanthropic', 'closed', 'broke'].includes(input.faction) ? input.faction : 'misanthropic', status: 'preference_submitted', timestamp: new Date().toISOString(), source: 'local-design-board', regenerated: false };
      await fs.mkdir(designDir, { recursive: true });
      const serialized = JSON.stringify(feedback, null, 2) + '\n';
      await fs.writeFile(path.join(designDir, 'feedback.json'), serialized);
      res.writeHead(200, { 'Content-Type': types['.json'] }); return res.end(JSON.stringify({ ok: true }));
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(url.pathname);
    if(['/account','/leaderboards','/demo'].includes(pathname)){
      res.writeHead(302,{Location:pathname+'/index.html'+url.search,'Cache-Control':'no-store'});return res.end();
    }
    const sourcePage=sourceOnly&&artPages.has(pathname);
    const file = path.resolve(root, '.' + (sourcePage ? '/contributor/index.html' : pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    let data = await fs.readFile(file);
    const profiling = !sourcePage && pathname === '/demo/index.html' && url.searchParams.has('cpuProfile');
    if (profiling) data = Buffer.from(data.toString().replace('</head>', '<script type="module" src="self-profile.js"></script></head>'));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...(profiling ? { 'Document-Policy': 'js-profiling' } : {}) });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (err) { res.writeHead(err.code === 'ENOENT' ? 404 : 400); res.end(err.code === 'ENOENT' ? 'Not found' : 'Invalid request'); }
});
accounts.mail.start();
server.listen(port, '127.0.0.1', () => {
  console.log(`BOARD_URL: http://127.0.0.1:${port}/`);
  if(sourceOnly)console.log('SOURCE CHECKOUT: account/standings development is available; the complete 3D game requires the external art pack. See docs/ASSETS.md.');
});
let closing=false;async function close(){if(closing)return;closing=true;const stopped=new Promise(resolve=>server.close(resolve));server.closeIdleConnections();await stopped;await operations.close();await accounts.mail.close();await ranked.close();accounts.close();}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>close().then(()=>process.exit(0)));
