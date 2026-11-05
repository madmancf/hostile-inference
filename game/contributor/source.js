import {entryIntent,accountURL} from '../entry-flow.js';
// Preserve the faction selected on an account/game link, without starting a run.
document.getElementById('source-account').href=accountURL(entryIntent().faction);
