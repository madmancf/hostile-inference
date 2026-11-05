import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0')
  .filter(p=>/\.(m?js)$/.test(p)&&!p.startsWith('design-preview/vendor/'));
if(!files.length)throw Error('No tracked source files. Run from a Git checkout.');
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('PASS syntax: '+files.length+' tracked JavaScript files');
