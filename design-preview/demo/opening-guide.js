import {techCost,techCompute} from './faction-tech.js';
import {point,distance} from './engine.js';
import { kit, unitType } from './faction-rules.js';
import { ROLES } from '../servers/roles.js';
import { FACTIONS, UNITS } from '../v2/world.js';

const combat = u => ROLES.find(r => r.key === u.role)?.dps > 0;
const own = g => g.units.filter(u => u.team === 'player' && u.hp > 0);
export function openingChecklist(g) {
  const home = own(g).filter(u => u.server === g.faction && !u.transit);
  return [
    { label: 'Research', done: home.some(u => u.role === 'researcher' && u.order === 'research' && !u.locked) },
    { label: 'Power', done: home.some(u => u.role === 'harvester' && u.order === 'harvest') },
    { label: 'Cooling', done: home.some(u => u.role === 'cooler' && u.order === 'cool') }
  ];
}

// A suggested selection, never a forced change to orders or the player's group.
// Keep one model and one firewall home; newly produced forces can join the raid.
export function suggestedRaid(g) {
  const home = own(g).filter(u => u.server === g.faction && !u.transit && !u.raid && combat(u));
  const defenders = ['model', 'firewall'].map(role => home.find(u => u.role === role)?.id);
  return home.filter(u => !defenders.includes(u.id)).map(u => u.id);
}

export function operationGuide(g, selected = []) {
  const op = g.operation;
  if (!op) return null;
  const team = own(g), home = team.filter(u => u.server === g.faction && !u.transit);
  const check = openingChecklist(g);
  if (op.homeThreat) return { title: 'Defend your laboratory', task: 'Red triangles mark intruders. Your raid keeps fighting while you select the defenders at home.', action: 'defend', label: 'Find home defenders' };
  if (home.some(u => u.role === 'researcher' && u.locked > 0)) return { title: 'Researcher locked out', task: 'Production is waiting for staff. Select a nearby firewall and use its pulse to clear the lockout.', action: 'defend', label: 'Find home defenders' };
  if (!check.every(x => x.done)) return { title: 'Bring your lab online', task: 'Start research, battery deliveries and cooling. Open Systems to construct faction facilities and choose your research branch.', action: 'economy', label: 'Start home economy' };
  const transit = g.raids.some(r => r.player && r.state !== 'done');
  const activeRaid = team.some(u => u.server === op.rival && !u.transit && combat(u));
  if (!op.enteredRival || (!activeRaid && !transit)) {
    if (g.activeServer !== g.faction) return { title: 'Your raid needs reinforcements', task: 'The field team has fallen. Your laboratory is still online. Return home, build a replacement model and choose another raiding team.', action: 'home', label: 'Return to home production' };
    if (transit) return { title: 'Your team is transferring', task: 'The team is heading through your uplink. The rival continent opens when they arrive. Your home crews keep working.', action: 'watch', label: 'Follow the uplink' };
    const k=kit(g.faction),next=k.openingPlan.find(([role,count])=>team.filter(u=>u.role===role).length<count),role=next?.[0];
    if (next) {
      const q = g.queue.find(q => q.role === role);
      if (q) return { title: op.productionPaused ? 'Staff heading to the lab' : 'Your '+UNITS[g.faction][unitType(g.faction,role).index].name+' is assembling', task: op.productionPaused ? 'The researcher is travelling. Production starts on arrival; the paid order is safe in the queue below.' : k.tactic+' Keep one model and firewall home.', action: 'queue', label: 'Show deployment queue', suggested: role };
      const required=techCompute(g,g.faction,role,unitType(g.faction,role).compute);
      if(g.used+required>g.capacity){
        const cloudQueue=g.queue.find(q=>q.role==='cloud');
        if(cloudQueue)return {title:'Offshore compute is assembling',task:'Your paid floating cloud is in the deployment queue. When it arrives, anchor it at your home intake to connect its compute.',action:'queue',label:'Show cloud deployment',suggested:'cloud'};
        const unconnected=home.find(u=>u.role==='cloud'&&distance(u,point('intake',g.faction))>=80);
        if(unconnected)return {title:'Connect your floating cloud',task:'The cloud is built, but its compute only counts at the home cooling intake. Anchor it there, then continue assembling the raid.',action:'economy',label:'Connect offshore compute'};
        const cost=techCost(g,g.faction,'cloud',unitType(g.faction,'cloud').cost);
        return {title:'Your raid needs more compute',task:`${g.used} of ${g.capacity} compute is reserved. This unit needs ${required} more. Deploy a floating cloud (${cost} funds), then anchor it at your home intake. Battery deliveries keep funding the expansion.`,action:'deploy',label:`Deploy floating cloud · ${cost}`,suggested:'cloud',cost};
      }
      const cost = techCost(g,g.faction,role,unitType(g.faction,role).cost);
      return { title: 'Build your first raiding team', task: `Deploy ${UNITS[g.faction][unitType(g.faction,role).index].name} (${cost} funds). ${g.faction==='misanthropic'?'Pair your Oracle with a ward; keep a model and firewall home.':g.faction==='closed'?'Your raiding Black Box needs a Gatekeeper link. Leave the first pair home.':'Build a fast model with Swarm support. Keep a model and firewall home.'}`, action: 'deploy', label: `Deploy ${role} · ${cost}`, suggested: role, cost };
    }
    const ready = home.filter(u => selected.includes(u.id) && combat(u) && !u.raid);
    if (!ready.length) return { title: 'Choose who leaves home', task: 'Select a suggested raiding team. One model and one firewall stay behind. You can change the selection before transferring.', action: 'select', label: 'Select suggested raid team' };
    const staying = home.filter(u => combat(u) && !u.raid && !selected.includes(u.id));
    return { title: 'Cross into the rival server', task: `${ready.length} selected for transfer. ${staying.length ? `${staying.length} field units will stay at home.` : 'No field defenders will remain—adjust your selection if needed.'} Cross into ${FACTIONS[op.rival].name} when ready.`, action: 'transfer', label: `Transfer ${ready.length} selected units` };
  }
  if (g.activeServer === g.faction) return { title: 'Your raid is still active', task: 'Your field team continues fighting on the rival continent. Check your supply lines, then return to the raid.', action: 'rival', label: 'View the raiding team' };
  if (!op.relay.captured) return { title: 'Choose your target', task: 'Attack the endpoint directly, or send a unit to hold the data relay for 30 seconds. The relay weakens their shielding.', action: 'relay', label: 'Find the data relay' };
  return { title: 'Bring their endpoint offline', task: 'Relay secured. Rally your field team at the rival campus. Keep your own campus online to win.', action: 'rally', label: 'Rally at the endpoint' };
}
