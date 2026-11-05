// Read-only contributor preflight. Never starts a server or opens account data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export async function inspectSetup({root=projectRoot,nodeVersion=process.versions.node,platform=process.platform}={}){
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const checks=[];
  const add=(name,ok,detail)=>checks.push({name,ok,detail});
  add('Node',[24,26].includes(Number(nodeVersion.split('.')[0])),nodeVersion+'; supported majors: 24, 26');
  add('Platform',['darwin','linux'].includes(platform),platform+'; use WSL2 on Windows');
  try{createRequire(import.meta.url)('node:sqlite');add('SQLite',true,'built-in module available; no database opened');}
  catch{add('SQLite',false,'node:sqlite unavailable; select Node 24 or 26');}
  try{
    const prefix=execFileSync('git',['rev-parse','--show-prefix'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    add('Git',prefix==='',prefix?'Use the repository root':'repository root detected');
  }catch{add('Git',false,'Install Git and clone the repository');}
  const require=createRequire(path.join(root,'package.json'));
  const missing=[];
  for(const name of Object.keys({...pkg.dependencies,...pkg.devDependencies})){
    try{require.resolve(name);}catch{missing.push(name);}
  }
  add('Dependencies',missing.length===0,missing.length?'Missing '+missing.join(', ')+'; run npm ci':'all declared package entry points resolve');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'docs/runtime-assets.json'),'utf8'));
  let present=0,wrongSize=0;
  for(const [name,item] of Object.entries(manifest.assets)){
    try{const stat=await fs.stat(path.join(root,name));if(stat.isFile()){present++;if(stat.size!==item.bytes)wrongSize++;}}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const expected=Object.keys(manifest.assets).length;
  return {sourceReady:checks.every(c=>c.ok),checks,art:{present,expected,wrongSize,fingerprintsVerified:false},
    next:present===expected&&!wrongSize?'Run npm run check:assets before full-game startup':'Art is optional for source work. Run npm run dev:server for the contributor workspace; see docs/ASSETS.md',
    scope:'Prerequisites only: does not certify tests, graphics, FPS, rights or deployment readiness'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const json=process.argv.includes('--json');
  try{
    if(process.argv.slice(2).some(arg=>arg!=='--json'))throw Error('Usage: npm run doctor -- [--json]');
    const result=await inspectSetup();
    if(json)console.log(JSON.stringify(result,null,2));
    else{
      for(const c of result.checks)console.log((c.ok?'OK   ':'FAIL ')+c.name+': '+c.detail);
      console.log('ART  '+result.art.present+'/'+result.art.expected+' files present; '+result.art.wrongSize+' unexpected sizes; fingerprints not checked');
      console.log(result.next);console.log(result.scope);
    }
    process.exitCode=result.sourceReady?0:1;
  }catch(error){
    const message=error.code?'Cannot inspect setup ('+error.code+'); run from a complete source checkout':error.message;
    if(json)console.log(JSON.stringify({sourceReady:false,error:message}));else console.error(message);
    process.exitCode=1;
  }
}
