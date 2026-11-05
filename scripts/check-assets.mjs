import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const manifest=JSON.parse(await fs.readFile('docs/runtime-assets.json','utf8'));
const problems=[];
for(const [name,expected] of Object.entries(manifest.assets)){
  const bytes=await fs.readFile(name).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(!bytes)problems.push('Missing '+name);
  else if(bytes.length!==expected.bytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)problems.push('Changed '+name);
}
if(problems.length){
  console.error('Runtime art is missing or changed. A complete Git clone includes all assets; see docs/ASSETS.md.');
  console.error(problems.slice(0,5).join('\n')+'\n'+problems.length+' asset files need attention.');
  process.exitCode=1;
}else console.log('PASS '+Object.keys(manifest.assets).length+' exact full-quality runtime assets');
