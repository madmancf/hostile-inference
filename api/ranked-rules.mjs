import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
// Include the entire renderer-free import closure, including authored paths/data.
export const RULE_FILES=['demo/ranked-protocol.js','demo/engine.js','demo/operation.js','demo/faction-rules.js','demo/faction-tech.js','demo/building-catalog.js','demo/enemy-ai.js','v2/world.js','servers/territories.js','servers/roles.js'];
export async function rulesManifest(){
 const files={};for(const name of RULE_FILES)files[name]=createHash('sha256').update(await fs.readFile(new URL('game/'+name,root))).digest('hex');
 return {id:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
export const defaultDataDirectory=fileURLToPath(new URL('../.runtime/ranked/',import.meta.url));
