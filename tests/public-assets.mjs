// A disposable Git index proves the publication gate catches incomplete or
// accidental asset releases. No private art, account data or working index used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'hi-public-assets-'));
const git=(...args)=>execFileSync('git',args,{cwd:tmp,stdio:['ignore','pipe','pipe']});
const file='game/entry/assets/example.webp';
const bytes=Buffer.from('RIFFfixtureWEBP');
const run=()=>spawnSync(process.execPath,['tests/public-source.mjs'],{cwd:tmp,encoding:'utf8'});
try{
  await fs.mkdir(path.join(tmp,'tests'),{recursive:true});
  await fs.mkdir(path.join(tmp,'docs'));
  await fs.mkdir(path.join(tmp,path.dirname(file)),{recursive:true});
  await fs.copyFile(new URL('./public-source.mjs',import.meta.url),path.join(tmp,'tests/public-source.mjs'));
  await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
  await fs.writeFile(path.join(tmp,'docs/ASSETS.md'),'Fixture provenance');
  await fs.writeFile(path.join(tmp,'docs/ASSET_LICENSE.md'),'Fixture license');
  await fs.writeFile(path.join(tmp,'docs/runtime-assets.json'),JSON.stringify({assets:{[file]:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}}));
  await fs.writeFile(path.join(tmp,file),bytes);
  git('init','--quiet');git('add','.');
  assert.equal(run().status,0,'Complete licensed fixture passes');
  git('rm','--cached',file);assert.notEqual(run().status,0,'Missing asset rejected');git('add',file);
  await fs.writeFile(path.join(tmp,file),'changed');git('add',file);
  assert.notEqual(run().status,0,'Altered binary rejected');
  await fs.writeFile(path.join(tmp,file),bytes);git('add',file);
  await fs.writeFile(path.join(tmp,'game/entry/assets/unlisted.webp'),bytes);git('add','.');
  assert.notEqual(run().status,0,'Unlisted binary rejected');git('rm','--cached','game/entry/assets/unlisted.webp');
  git('rm','--cached','docs/ASSET_LICENSE.md');assert.notEqual(run().status,0,'Missing license rejected');
  git('add','docs/ASSET_LICENSE.md');assert.equal(run().status,0);
  console.log('PASS publication guard: complete assets accepted; missing, altered, unlisted binaries and absent license rejected');
}finally{await fs.rm(tmp,{recursive:true,force:true});}
