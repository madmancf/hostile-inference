import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const current=JSON.parse(await fs.readFile(path.join(root,'dist/current.json')));
const child=spawn(process.execPath,[path.join(current.path,'server.mjs')],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('exit',code=>process.exitCode=code??1);
