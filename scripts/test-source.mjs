import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
await fs.mkdir('output/playwright',{recursive:true});
// Deliberately separate from full-art tests: these all run from a public clone.
const suites=['simulation','demo','tutorial','draw-batches','faction-assets',
  'local-game','faction-gameplay','faction-tech','enemy-ai','ranked','ranked-actions',
  'ranked-recovery','accounts','leaderboards','model-cache','verification-jobs',
  'operations','account-abuse','email-delivery','history-growth','history-integrity'];
for(const suite of suites){
  const args=[...(suite==='history-growth'?['--expose-gc']:[]),'checks/'+suite+'.mjs'];
  const result=spawnSync(process.execPath,args,{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('PASS '+suites.length+' public-source suites; full-art browser/FPS checks are separate');
