import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectSetup} from '../scripts/doctor.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'hi-doctor-'));
try{
  execFileSync('git',['init','--quiet',root]);
  await fs.mkdir(path.join(root,'docs'));
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{'fixture-runtime':'1.0.0'}}));
  await fs.writeFile(path.join(root,'docs/runtime-assets.json'),JSON.stringify({assets:{'optional.glb':{bytes:4}}}));
  const missing=await inspectSetup({root});
  assert.equal(missing.sourceReady,false);
  assert.equal(missing.checks.find(c=>c.name==='Dependencies').ok,false);
  await fs.mkdir(path.join(root,'node_modules/fixture-runtime'),{recursive:true});
  await fs.writeFile(path.join(root,'node_modules/fixture-runtime/package.json'),'{"main":"index.js"}');
  await fs.writeFile(path.join(root,'node_modules/fixture-runtime/index.js'),'throw Error("Doctor must resolve, not execute, dependency code");');
  const source=await inspectSetup({root});
  assert.equal(source.sourceReady,true);assert.equal(source.art.present,0);
  assert.equal(source.art.fingerprintsVerified,false);
  await fs.writeFile(path.join(root,'optional.glb'),'bad');
  const wrong=await inspectSetup({root});
  assert.equal(wrong.sourceReady,true);assert.equal(wrong.art.wrongSize,1);
  await fs.writeFile(path.join(root,'optional.glb'),'size');
  const sized=await inspectSetup({root});
  assert.equal(sized.art.wrongSize,0);assert.equal(sized.art.fingerprintsVerified,false);
  assert.equal((await inspectSetup({root,nodeVersion:'22.0.0'})).sourceReady,false);
  assert.equal((await inspectSetup({root,platform:'win32'})).sourceReady,false);
  assert.equal((await fs.readdir(root)).includes('.runtime'),false);
  console.log('PASS read-only setup: missing dependencies fail; absent art permits source work; sizes never imply fingerprints; unsupported runtimes fail');
}finally{await fs.rm(root,{recursive:true,force:true});}
