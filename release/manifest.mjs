// Deliberate entry points, not a directory copy. The build follows static JS
// imports and separately names dynamic art/model assets used by those entries.
export const pages=['index.html','account/index.html','leaderboards/index.html','demo/index.html','information/index.html'];
export const entryScripts=['entry/entry.js','account/account.js','leaderboards/leaderboards.js','demo/game.js'];
export const styles=['entry/entry.css','account/account.css','leaderboards/leaderboards.css','demo/game.css'];
export const factions=['misanthropic','closed','broke'];
export const roles=['researcher','harvester','agent','malware','model','firewall','cooler','cloud'];
export const apiFiles=['accounts.mjs','ranked-service.mjs','ranked-rules.mjs','replay-worker.mjs','leaderboards.mjs','http-policy.mjs','storage-lock.mjs','operations.mjs','account-safety.mjs','client-source.mjs','mail-delivery.mjs'];
