// Test-only legal commander. Policy bookkeeping stays outside the game state.
import {kit,unitType,abilityProblem} from '../game/demo/faction-rules.js';
import {compute,ROLES,distance} from '../game/demo/engine.js';
import {tree,nodeInfo,branchAt,techCost} from '../game/demo/faction-tech.js';
function infrastructure(g,issue){
 const s=g.infrastructure[g.faction];if(s.project?.type==='research'&&(s.buildings[s.project.site].hp<=0||nodeInfo(g.faction,s.project.id).tier===3&&Object.values(s.buildings).filter(b=>b.hp>0).length<2))issue({type:'cancelProject'});if(s.project||g.time<12)return;
 const b=tree(g.faction).branches,broken=Object.entries(s.buildings).find(([,v])=>v.built&&v.hp<=0);if(broken){issue({type:'project',id:branchAt(g.faction,broken[0]).id});return;}
 const first=b[0],second=b[g.faction==='broke'?2:1],sequence=[first.id,first.research[0].id];if(g.time>180)sequence.push(second.id,first.research[1].id);
 const next=sequence.find(id=>{const n=nodeInfo(g.faction,id);return n.type==='build'?!s.buildings[n.site].built:!s.completed.includes(id);});if(next&&g.funds>=nodeInfo(g.faction,next).cost+(g.time<60?0:80))issue({type:'project',id:next});
}
export function drive(g,policy,issue) {
  const activateEconomy=()=>issue({type:'economy'}),deploy=(_,role)=>issue({type:'deploy',role}),launchRaid=(_,target,ids)=>issue({type:'raid',target,ids}),captureRelay=(_,ids)=>issue({type:'capture',ids}),command=(_,ids,kind,target)=>issue({type:'order',ids,kind,target}),activateDoctrine=()=>issue({type:'doctrine'}),ability=(_,ids)=>issue({type:'ability',ids});
  const op = g.operation;
  if (!op || g.result || g.paused) return;
  if (!policy.started) {
    policy.started=true;
    Object.assign(policy,{nextDecision:0,defender:g.units.find(u=>u.team==='player'&&u.role==='model')?.id,shield:g.units.find(u=>u.team==='player'&&u.role==='firewall')?.id});
    activateEconomy(g);
  }

  if (g.time < policy.nextDecision) return;
  policy.nextDecision = g.time + 1;
  infrastructure(g,issue);
  const own = g.units.filter(u => u.team === 'player');
  for(const [key,role] of [['defender','model'],['shield','firewall']])if(!own.some(u=>u.id===policy[key]))policy[key]=own.find(u=>u.role===role&&u.server===g.faction&&!u.raid&&!u.transit)?.id;
  const count = role => own.filter(u => u.role === role).length + g.queue.filter(q => q.role === role).length;
  const k=kit(g.faction),capacity=compute(g);
  // Build a mixed force before replenishing losses; cheap raiders must not starve its models.
  if(g.faction==='broke'&&!own.some(u=>u.id===policy.secondDefender))policy.secondDefender=own.find(u=>u.role==='model'&&u.server===g.faction&&!u.raid&&!u.transit&&u.id!==policy.defender)?.id;
  const targets={...k.army,model:g.faction==='broke'?5:k.army.model,harvester:2,cooler:g.faction==='broke'&&g.heat>48?2:1};
  const priority=g.faction==='misanthropic'?['model','firewall','agent','malware','harvester']:g.faction==='closed'?['model','firewall','agent','malware','harvester']:['model','firewall','malware','agent','harvester'];
  const planned=count('cooler')<targets.cooler?'cooler':count('harvester')<2?'harvester':priority.filter(r=>count(r)<targets[r]).sort((a,b)=>count(a)/targets[a]-count(b)/targets[b])[0];
  const want=planned&&capacity.capacity-g.used<unitType(g.faction,planned).compute&&count('cloud')<2?'cloud':planned;
  const savingForSpecialization=g.time>180&&!g.infrastructure[g.faction].specialization&&own.filter(u=>u.role==='model').length>=3&&!op.homeThreat;
  if (want&&!savingForSpecialization&&(!op.homeThreat||g.funds>=unitType(g.faction,want).cost+60)) deploy(g, want);
  activateEconomy(g);
  const ids = own.filter(u => u.server === g.faction && !u.transit && !u.raid && ROLES.find(r => r.key === u.role).dps > 0 && ![policy.defender, policy.shield,policy.secondDefender].includes(u.id)).map(u => u.id);
  const hasRaid=own.some(u=>u.server===op.rival&&!u.transit&&u.role==='model');
  if (g.time > 100 && ids.length && (own.filter(u=>ids.includes(u.id)&&u.role==='model').length>=2&&ids.length>=4&&own.some(u=>ids.includes(u.id)&&u.role==='firewall')||hasRaid&&ids.length>=2)) launchRaid(g, op.rival, ids);
  if(hasRaid&&g.time%40<1&&ids.length>=2)launchRaid(g,op.rival,ids);
  const agent = own.find(u => u.role === 'agent' && u.server === op.rival && !u.transit && !u.raid);
  if (agent && !op.relay.captured && agent.order !== 'capture') captureRelay(g, [agent.id]);
  if (op.relay.captured && agent?.order === 'capture') command(g, [agent.id], 'siege', 'campus');
  if ((op.homeThreat||own.some(u=>u.server===op.rival)) && g.time >= op.doctrineReady) activateDoctrine(g);
  for(const u of own){
    if(op.homeThreat&&u.server===g.faction&&!u.raid&&!u.transit&&['model','firewall'].includes(u.role)){const intruder=g.units.filter(e=>e.team!=='player'&&e.hp>0&&!e.transit&&e.server===g.faction).sort((a,b)=>distance(a,u)-distance(b,u))[0];if(intruder&&u.target!==intruder.id)command(g,[u.id],'attack',intruder.id);}
    if(u.role==='model'&&u.server===op.rival&&!u.transit&&!u.raid){
      const threat=g.units.filter(e=>e.team!=='player'&&e.hp>0&&!e.transit&&(g.faction!=='misanthropic'||unitType(e.faction,e.role).dps>0)&&unitType(e.faction,e.role).domain==='land'&&e.server===u.server&&distance(e,u)<(g.faction==='misanthropic'?170:190)).sort((a,b)=>(a.role==='firewall'?-1:0)-(b.role==='firewall'?-1:0)||a.hp-b.hp)[0];
      if(threat&&u.target!==threat.id)command(g,[u.id],'attack',threat.id);
      else if(g.faction==='misanthropic'&&!threat&&u.order==='attack')command(g,[u.id],'siege','campus');
    }
    if(u.faction==='misanthropic'&&u.role==='firewall'&&u.server===op.rival&&u.order==='hold'&&!g.units.some(e=>e.team!=='player'&&e.hp>0&&e.server===u.server&&distance(e,u)<165))command(g,[u.id],'siege','campus');
    if(u.raid||abilityProblem(g,u)||g.funds<60)continue;
    const savingForUnit=want&&!g.queue.length&&g.funds<techCost(g,g.faction,want,unitType(g.faction,want).cost)+60;
    if(savingForUnit&&!(g.faction==='broke'&&u.role==='model')&&u.role!=='cooler'&&!(u.role==='firewall'&&u.hp<u.maxHp*.5))continue;
    const contact=g.units.some(e=>e.team!=='player'&&e.hp>0&&!e.transit&&unitType(e.faction,e.role).domain==='land'&&e.server===u.server&&distance(e,u)<125);
    if(u.role==='cooler'&&g.heat>55||!u.moving&&contact&&['model','agent','malware','firewall'].includes(u.role))ability(g,[u.id]);
  }
}
