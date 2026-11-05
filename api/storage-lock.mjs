import {DatabaseSync} from 'node:sqlite';
import {chmodSync,existsSync} from 'node:fs';
import path from 'node:path';

// A dedicated SQLite exclusive transaction is an OS-released process lock.
// It contains no user data and is deliberately excluded from backups.
export function lockStorage(file){
 if(existsSync(path.join(path.dirname(file),'.restoring')))throw Error('Restore is incomplete; finish restoring before starting this data directory');
 const lock=new DatabaseSync(file+'.lock.sqlite');
 try{chmodSync(file+'.lock.sqlite',0o600);lock.exec('PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS owner(id INTEGER); BEGIN EXCLUSIVE;');}
 catch(e){lock.close();throw Error('Storage is already in use by another server or operator: '+file,{cause:e});}
 return ()=>{lock.exec('ROLLBACK');lock.close();};
}
