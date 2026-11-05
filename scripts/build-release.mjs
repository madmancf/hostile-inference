import {CLIENT_RULES_ID} from '../game/demo/rules-version.js';
import {MODEL_ASSETS} from '../game/servers/model-asset-keys.js';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {pages,entryScripts,styles,factions,roles,apiFiles} from '../release/manifest.mjs';
import {RULE_FILES,rulesManifest} from '../api/ranked-rules.mjs';
if(!vm.SourceTextModule){execFileSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url)],{stdio:'inherit'});process.exit(0);}
if(CLIENT_RULES_ID!==(await rulesManifest()).id)throw Error('Browser rules version is stale; update rules-version.js with the exact rule manifest hash');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'game'),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const assets=new Map(),sources={};
async function add(name,transform){
 if(assets.has(name))return;
 if(name.startsWith('../')||path.isAbsolute(name))throw Error('Unsafe asset path '+name);
 let bytes=await fs.readFile(path.join(source,name));sources['game/'+name]=hash(bytes);
 if(transform)bytes=Buffer.from(transform(bytes.toString()));assets.set(name,bytes);
}
function runtimeJS(name,s){
 // Strip capture hooks and profiling imports only. Renderer quality and drawing
 // code remain byte-for-byte equal outside these documented substitutions.
 if(name==='demo/game.js'){
  s=s.replace(/window\.hostileDemo=\{[^\n]+\};\n?$/,'');
  s=s.replace("const previewOwner=new URL(location.href).searchParams.get('preview'),isPreview=!!FACTIONS[previewOwner];",'const previewOwner=null,isPreview=false;');
  s=s.replace("autoOperation=params.get('autoplay')==='operation'",'autoOperation=false');
 }
 if(name==='servers/live-world.js'){
  s=s.replace("import { RenderProfiler } from './render-profiler.js';\n",'');
  s=s.replace(/^  if\(new URL\(location.href\).searchParams.has\('profile'\)\).*\n/m,'');
  s=s.replace("this.pooling=!new URL(location.href).searchParams.has('coldActors')",'this.pooling=true');
  s=s.replace("this.assetProfile=new URL(location.href).searchParams.get('assets')==='original'?'original':'optimized'","this.assetProfile='optimized'");
 }
 return s;
}
const visit=async name=>{
 if(assets.has(name))return;await add(name,s=>runtimeJS(name,s));const s=assets.get(name).toString();
 for(const specifier of new vm.SourceTextModule(s,{identifier:name}).dependencySpecifiers){
  if(!specifier.startsWith('.'))throw Error('Unresolved package import '+specifier+' in '+name);
  await visit(path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier)));
 }
};
for(const entry of entryScripts)await visit(entry);
for(const style of styles)await add(style);
await add('demo/favicon.svg');
for(const faction of factions){await add('entry/assets/'+faction+'.webp');await add('servers/assets/'+faction+'-server-v1.png');for(const role of roles)await add('servers/assets/portraits/'+faction+'-'+role+'-v06.jpg');}
const models=JSON.parse(await fs.readFile(path.join(source,'servers/assets/premium-models.json')));delete models.original;
await add('servers/assets/premium-models.json',()=>JSON.stringify(models,null,2)+'\n');
for(const name of [...Object.values(models.hq),...Object.entries(models).filter(([k])=>k!=='hq').map(([,v])=>v)]){if(typeof name!=='string'||!name.endsWith('.glb'))throw Error('Unexpected runtime model');await add('servers/assets/'+name);const bytes=assets.get('servers/assets/'+name),key=MODEL_ASSETS[name];if(!key||key.bytes!==bytes.length||key.sha256!==hash(bytes))throw Error('Stale model cache key: '+name);}
await add('vendor/three/LICENSE');
const pageSources={};for(const p of pages){pageSources[p]=await fs.readFile(path.join(source,p),'utf8');sources['game/'+p]=hash(pageSources[p]);}
const privateFiles=new Map();for(const name of apiFiles)privateFiles.set('api/'+name,await fs.readFile(path.join(root,'api',name)));
privateFiles.set('LICENSE',await fs.readFile(path.join(root,'LICENSE')));
// Retain the former private layout so installed 0.20 update validators accept
// this bundle. Both trees contain identical frozen rules and are hash-verified.
for(const name of RULE_FILES){const bytes=await fs.readFile(path.join(source,name));privateFiles.set('game/'+name,bytes);privateFiles.set('design-preview/'+name,bytes);}
privateFiles.set('EMAIL-SETUP.md',await fs.readFile(path.join(root,'docs/email-setup-0.19.md')));
privateFiles.set('OPERATIONS.md',await fs.readFile(path.join(root,'docs/operations-0.20.md')));
privateFiles.set('scripts/operate.mjs',await fs.readFile(path.join(root,'scripts/operate.mjs')));
privateFiles.set('server.mjs',await fs.readFile(path.join(root,'release/server.mjs')));
for(const [name,bytes] of privateFiles)sources[name==='server.mjs'?'release/server.mjs':name==='OPERATIONS.md'?'docs/operations-0.20.md':name==='EMAIL-SETUP.md'?'docs/email-setup-0.19.md':name.startsWith('design-preview/')?'game/'+name.slice('design-preview/'.length):name]=hash(bytes);
for(const name of ['scripts/build-release.mjs','release/manifest.mjs','package.json','node_modules/meshoptimizer/LICENSE.md'])sources[name]=hash(await fs.readFile(path.join(root,name)));
const id=hash(JSON.stringify({version:pkg.version,sources})).slice(0,20);
// Bind admitted browser starts to this immutable runtime namespace.
assets.set('demo/rules-version.js',Buffer.from(assets.get('demo/rules-version.js').toString().replace("CLIENT_RELEASE_ID='preview'","CLIENT_RELEASE_ID='"+id+"'")));
const dest=path.join(root,'dist','hostile-inference-'+pkg.version+'-'+id);
await fs.mkdir(dest,{recursive:true});
const write=async(name,bytes)=>{const file=path.join(dest,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
const manifest={version:pkg.version,id,operationsVersion:1,storageSchema:4,privateSHA256:Object.fromEntries([...privateFiles].map(([name,bytes])=>[name,hash(bytes)])),rules:(await rulesManifest()).id,routes:{'/':'index.html'},assets:{},sourceSHA256:sources,transforms:['remove read-only capture global and profiling switches','runtime model manifest excludes originals','HTML resource base uses content-derived release namespace; navigation stays canonical'],fullQualityAssets:true};
for(const [name,bytes] of assets){const item={sha256:hash(bytes),bytes:bytes.length};await write('public/'+name,bytes);if(/\.(js|css|json|svg)$/.test(name)){const zip=gzipSync(bytes,{level:9});if(zip.length<bytes.length){await write('public/'+name+'.gz',zip);item.gzip=true;item.gzipBytes=zip.length;}}manifest.assets[name]=item;}
for(const p of pages){let html=pageSources[p];const directory=path.posix.dirname(p);html=html.replace('<head>','<head><base href="/r/'+id+'/'+(directory==='.'?'':directory+'/')+'">');
 html=html.replace(/(<a\b[^>]*\bhref=")([^"#][^"]*)"/g,(whole,before,url)=>{if(url.startsWith('/')||/^[a-z]+:/i.test(url))return whole;const u=new URL(url,'https://release.invalid/'+p);return before+u.pathname+u.search+u.hash+'"';});
 // Favicon on the lightweight entry uses a root URL in the development tree.
 html=html.replace('href="/demo/favicon.svg"','href="/r/'+id+'/demo/favicon.svg"');
 await write('pages/'+p,html);manifest.routes['/'+p]=p;}
for(const [name,bytes] of privateFiles)await write(name,bytes);
await write('package.json',JSON.stringify({name:pkg.name,version:pkg.version,private:true,license:'MIT',type:'module',engines:pkg.engines,scripts:{start:'node server.mjs'}},null,2)+'\n');
await write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
await write('THIRD_PARTY_NOTICES.txt','Original software: MIT; see LICENSE. External generated art is not covered by this license. Asset redistribution clearance remains pending; do not publish this art-bearing bundle.\n\nThree.js\n'+await fs.readFile(path.join(source,'vendor/three/LICENSE'),'utf8')+'\n\nmeshoptimizer\n'+await fs.readFile(path.join(root,'node_modules/meshoptimizer/LICENSE.md'),'utf8'));
await write('RUN.md',`# Hostile Inference ${pkg.version}\n\nLocal release candidate, not deployed or approved for public launch.\n\nRequires Node 24 or 26 with node:sqlite. No npm install, build tools, Mac paths or source workspace needed at runtime.\n\nSet HI_PUBLIC_ORIGIN to the exact HTTPS origin, HI_DATA_DIR to an absolute persistent directory outside this release, and PORT (default 4180). Run node server.mjs behind your HTTPS proxy. Bind host defaults to 127.0.0.1; set HOST explicitly if needed. Never expose this package directory with a generic file server.\n\nFor loopback rehearsal only: HI_LOCAL_REHEARSAL=1 HI_PUBLIC_ORIGIN=http://127.0.0.1:4180 HI_DATA_DIR=/absolute/separate/test-data node server.mjs\n\nOperator controls: node scripts/operate.mjs status --data /absolute/private-data. Drain before updates; backup to a fresh private directory; use update-check before stopping the old process. Restore never overwrites an existing directory. The operations socket is local and private. Season Zero rules are frozen; rollback requires a compatible schema-4 bundle. See OPERATIONS.md for the rehearsed procedures.\n\nNo database, accounts, credentials, QA results or original art masters are included. Preserve the private data directory between releases. Remaining public gates include verified recovery-mail credentials/domain/inbox delivery and support contacts, trusted proxy/edge checks, hosted backup scheduling and capacity, newcomer testing, 60 FPS certification, rights and real hosting/origin acceptance. Production requires verified recovery email. Set HI_MAIL_CONFIG to a private Resend configuration file to send mail; without it, delivery is disabled. Local rehearsal defaults to the private outbox simulator. Rules-changing updates need an explicit season migration; this package supports drained same-rules updates.\n`);
await fs.writeFile(path.join(root,'dist','current.json'),JSON.stringify({path:dest,id,version:pkg.version},null,2)+'\n');
console.log(JSON.stringify({path:dest,id,files:assets.size,payloadMiB:[...assets.values()].reduce((n,b)=>n+b.length,0)/1048576,rules:manifest.rules}));
