// Scan the exact staged/committed tree, never private untracked workspace files.
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
assert.ok(files.length,'A Git checkout with tracked files is required');
// GitHub gives .github/README precedence over the root README. Keep contribution
// policies in CONTRIBUTING.md so they cannot silently replace the game overview.
assert.deepEqual(files.filter(file=>/^\.github\/readme(?:\.[^/]+)?$/i.test(file)),[],
  'A .github README would replace the root project overview; use .github/CONTRIBUTING.md');
const known=new Set(files),failures=[];
const forbidden=/(^|\/)(node_modules|dist|output|provenance|\.runtime|\.gstack|\.playwright[^/]*)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:sqlite(?:-wal|-shm)?|db|pem|key|log|png|jpe?g|webp|glb|zip|tgz)$/i;
const secrets=[/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,/\bAKIA[A-Z0-9]{16}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsk-[A-Za-z0-9_-]{28,}\b/,/https?:\/\/[^\s"']+[?&](?:X-Amz-Signature|token|api_key)=/i];
for(const file of files){
  if(forbidden.test(file)){failures.push(file+': excluded/private/binary path');continue;}
  const bytes=execFileSync('git',['show',':'+file],{maxBuffer:8*1024*1024});
  if(bytes.includes(0)||bytes.length>5*1024*1024){failures.push(file+': unexpected binary or oversized file');continue;}
  const text=bytes.toString('utf8');
  if(file==='README.md'&&/https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?=[:/\s`<>]|$)/i.test(text))failures.push(file+': loopback URLs belong in the local development guide, not the public overview');
  if(/\/(?:Users|home)\/[a-zA-Z][^\s'"/]+\//.test(text))failures.push(file+': personal absolute path');
  if(secrets.some(re=>re.test(text)))failures.push(file+': possible credential (value withheld)');
  if(file.endsWith('.md'))for(const match of text.matchAll(/\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)){
    const target=match[1].split('#')[0];
    if(!target||/^[a-z]+:/i.test(target))continue;
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),decodeURIComponent(target)));
    if(!known.has(resolved))failures.push(file+': link absent from public tree: '+target);
  }
}
assert.deepEqual(failures,[],failures.join('\n'));
console.log('PASS public tree: '+files.length+' files; no detected private paths, credentials, excluded assets or broken local Markdown links');
console.log('Pattern scanning is defense in depth, not a complete security audit.');
