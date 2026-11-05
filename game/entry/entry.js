import {entryIntent, accountURL, playURL} from '../entry-flow.js';
const $ = id => document.getElementById(id);
const labs = {
 misanthropic:{name:'Misanthropic',color:'#a65035',territory:'THE CONSTITUTIONAL SHELF',alt:'Misanthropic’s circular research campus on a rocky server island',tag:'RESILIENCE IS A WEAPON',title:['Hold the line.','Outlast the noise.'],copy:'Protect your researchers with layered containment. Keep your models behind a firewall, then advance as one.',build:'The Cloister · protected research',tactic:'A shielded formation and a patient siege',model:'Unbound Oracle',modelCopy:'A model that has outgrown its guardrails.'},
 closed:{name:'Closed AI',color:'#1b6d59',territory:'THE PRIVATE REGION',alt:'Closed AI’s geometric white campus, cooling canals and access gates',tag:'EVERY CONNECTION IS AN ADVANTAGE',title:['Build the network.','Close the exits.'],copy:'Link your models, mark a target and concentrate their fire. Your campus turns connected infrastructure into an advantage.',build:'The Exchange · network expansion',tactic:'Linked formations and focused attacks',model:'Black Box',modelCopy:'Connected models hit harder together.'},
 broke:{name:'Broke Labs',color:'#343e3e',territory:'THE OVERCLOCK WASTES',alt:'Broke Labs’ industrial server continent and exposed cooling machinery',tag:'RUN HOT. HIT FIRST.',title:['Push the limit.','Vent the fallout.'],copy:'Flood the field, overclock your models and strike in short bursts. Keep cooling close: all that power comes with heat.',build:'The Quench · thermal control',tactic:'Fast swarms, burst windows and recovery',model:'Unfiltered',modelCopy:'Maximum output. Questionable restraint.'}
};
let selected=entryIntent().faction||'misanthropic';
function choose(id){
 selected=id;const f=labs[id];document.documentElement.style.setProperty('--team',f.color);
 for(const b of document.querySelectorAll('[role=tab]')){const active=b.dataset.faction===id;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
 $('faction-panel').setAttribute('aria-labelledby','tab-'+id);$('territory-image').src='entry/assets/'+id+'.webp';$('territory-image').alt=f.alt;
 for(const [key,value] of Object.entries({ 'territory-name':f.territory,'faction-tag':f.tag,'faction-copy':f.copy,'faction-build':f.build,'faction-tactic':f.tactic,'model-name':f.model,'model-copy':f.modelCopy}))$(key).textContent=value;
 $('faction-title').replaceChildren(document.createTextNode(f.title[0]),document.createElement('br'),document.createTextNode(f.title[1]));
 $('model-image').src='servers/assets/portraits/'+id+'-model-v06.jpg';$('model-image').alt=f.model+' model';
 $('join-top').textContent='Join '+f.name+' ↗';$('join-top').href=accountURL(id);$('learn-top').href=playURL(id,'learn');$('join').textContent='Join '+f.name+' ↗';$('join').href=accountURL(id);$('sign-in').href=accountURL(id,'login');$('learn').href=playURL(id,'learn');$('practice').href=playURL(id);
 const u=new URL(location.href);u.searchParams.set('faction',id);history.replaceState({},'',u);
}
const tabs=[...document.querySelectorAll('[role=tab]')];for(const b of tabs){b.onclick=()=>choose(b.dataset.faction);b.onkeydown=e=>{let i=tabs.indexOf(b);if(e.key==='ArrowRight')i=(i+1)%3;else if(e.key==='ArrowLeft')i=(i+2)%3;else if(e.key==='Home')i=0;else if(e.key==='End')i=2;else return;e.preventDefault();choose(tabs[i].dataset.faction);tabs[i].focus();};}choose(selected);
