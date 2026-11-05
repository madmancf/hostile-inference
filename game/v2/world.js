export const FACTIONS = {
  misanthropic: {name:'Misanthropic', code:'MS', color:'#d97757', dark:'#7e3f2c', paper:'#f1e7db', symbol:'⌘', doctrine:'Proof before power.', premise:'An ivory research republic that treats alignment as infrastructure. It can contain failures others cannot, but every breakthrough has to survive its own review board.', strength:'Verified datasets and resilient containment.', weakness:'Slow releases, review costs, and staff-heavy infrastructure.', mechanic:'Constitutional review', effect:'Lower incident damage and stronger recovery; research runs 12% slower.', accentLabel:'Clay / oat / cocoa', source:'https://www.anthropic.com/', units:['Constitutionalist','Grid Tender','Red Team','Policy Worm','Unbound Oracle','Constitution','Thermal Ark','Compute Monastery']},
  closed: {name:'Closed AI', code:'CL', color:'#21866e', dark:'#1d4b3e', paper:'#e2ece4', symbol:'▣', doctrine:'Every future has a licence.', premise:'A polished network of sealed clouds and private model vaults. Its subscription economy is strong; its access gates and dependence on central services create valuable targets.', strength:'Inference contracts and efficient scheduling.', weakness:'Central cloud dependency and licence bottlenecks.', mechanic:'Proprietary stack', effect:'Inference income is 12% higher; loss of access to the cloud exchange creates a larger income penalty.', accentLabel:'White / emerald / charcoal', source:'https://openai.com/brand/', units:['Fine-tuner','Megawatt','Access Broker','Token Leech','Black Box','Gatekeeper','Liquid Loop','Private Cloud']},
  broke: {name:'Broke Labs', code:'BR', color:'#343938', dark:'#151918', paper:'#e2e3df', symbol:'///', doctrine:'Launch. Learn. Apologise.', premise:'A monochrome improvisation engine built around spectacular public releases. It turns heat and uncertainty into speed, then has to pay the operational debt.', strength:'Fast releases and disruptive burst windows.', weakness:'Hot chips, volatile quality and public trust.', mechanic:'Unfiltered acceleration', effect:'Research runs 15% faster and generates 18% more heat. Unreviewed releases take a larger trust hit.', accentLabel:'Graphite / white / chrome', source:'https://x.ai/legal/brand-guidelines', units:['Intern','Power Grab','Poacher','Reply Swarm','Unfiltered','Patch Tuesday','Cold Take','Server Raft']}
};

const common = [
  {role:'Researcher', category:'People', cost:180, compute:0, power:2, speed:'Slow', integrity:100, unlock:'Research laboratory', job:'Staffs research, validates releases, and repairs damaged model pipelines.', target:'Research / dataset validation', risk:'Agents can lock this worker out. Overwork creates burnout.', counter:'Keep a firewall and an incident-response specialist nearby.'},
  {role:'Energy harvester', category:'Logistics', cost:300, compute:1, power:0, speed:'Medium', integrity:180, unlock:'Grid exchange', job:'Collects energy from remote generation sites and returns charged storage to the campus.', target:'Energy nodes / battery delivery', risk:'Long delivery routes, grid congestion, and intercepted charging contracts.', counter:'Scout routes, stage batteries, and split supply sources.'},
  {role:'Infiltrating agent', category:'Agents', cost:420, compute:4, power:3, speed:'Fast', integrity:90, unlock:'Agent bureau', job:'Disrupts the human bottleneck rather than destroying a building.', target:'Researchers / privileged access', risk:'Becomes visible after acting and is fragile when scanned.', counter:'Identity auditors reveal it; research redundancy limits the disruption.'},
  {role:'Malware construct', category:'Malware', cost:280, compute:3, power:3, speed:'Fast', integrity:75, unlock:'Adversarial lab', job:'Carries a fictional infection along data links and logistics traffic.', target:'Datasets / queues / network nodes', risk:'Cannot cross a quarantined link and needs an exposed entry point.', counter:'Firewalls isolate links; provenance auditors purge poisoned data.'},
  {role:'Escaped model', category:'Models', cost:760, compute:12, power:14, speed:'Medium', integrity:460, unlock:'Model foundry + training milestone', job:'An embodied autonomous model that can contest infrastructure with inference attacks.', target:'Model integrity / compute capacity', risk:'Its running body depends on your campus compute and cooling.', counter:'Containment nodes sever its inference link; brownouts throttle it.'},
  {role:'Mobile firewall', category:'Security', cost:340, compute:3, power:4, speed:'Slow', integrity:250, unlock:'Containment ward', job:'Protects a moving formation with an authentication and quarantine envelope.', target:'Malware / infiltrators / model tethers', risk:'Limited protection radius. It cannot protect every route at once.', counter:'Split attacks, exposed flanks, and non-network logistics pressure.'},
  {role:'Cooling vessel', category:'Naval', cost:480, compute:1, power:3, speed:'Water only', integrity:320, unlock:'Dry dock + shoreline', job:'Moves coolant, deploys temporary heat exchangers, and rescues overheated offshore servers.', target:'Cooling capacity / river intakes', risk:'Ports, water quality, drought, and shipping chokepoints.', counter:'Route denial and intake contamination; escort and alternate intakes defend it.'},
  {role:'Floating cloud', category:'Naval', cost:1100, compute:-24, power:22, speed:'Water only / slow', integrity:620, unlock:'Dry dock + cloud fabric', job:'A mobile data centre that adds compute and offers an offshore expansion foothold.', target:'Compute capacity / subsea links', risk:'Depends on a cable connection and a cooling escort.', counter:'Cable disruption and maintenance pressure; redundancy and ships defend it.'}
];
const abilities = {
  misanthropic:[
    ['Peer Review','Validates a dataset and gives the next release an integrity bonus.','Active review pauses this researcher’s ordinary training output.'],
    ['Microgrid','Drops a temporary battery cache so nearby models survive a grid interruption.','Stored charge is finite and the cache is visible to scouts.'],
    ['Formal Objection','Locks a rival researcher out of a laboratory for a short audit.','An evidence beacon reveals the agent after the action.'],
    ['Contradiction','Introduces conflicting labels into an unprotected dataset.','A clean provenance chain prevents it spreading.'],
    ['Refusal Field','Interrupts hostile model abilities inside a small area.','It sacrifices its own attack output while holding the field.'],
    ['Quarantine','Closes a compromised network link and reveals hidden agents.','Friendly traffic also has to take a longer route.'],
    ['Cold Reserve','Deploys a protected cooling buffer beside a shoreline campus.','The vessel must stay anchored and cannot relocate immediately.'],
    ['Air Gap','Runs a small verified model fleet even when the main cloud is cut off.','Lower peak output than a fully connected cluster.']
  ],
  closed:[
    ['Fine-tune','Raises the quality of one narrow model specialisation.','Improves that role rather than the whole army.'],
    ['Priority Charging','Reserves the next charge slot at a contested energy exchange.','Costs funds and exposes a predictable delivery path.'],
    ['Access Revoked','Temporarily disables a privileged researcher or a model’s access credential.','Local offline models resist the effect.'],
    ['Meter Drain','Clogs a rival inference queue with fictitious billable requests.','Rate-limit auditors and local scheduling contain it.'],
    ['Exclusive Endpoint','Concentrates inference to overwhelm one target’s model integrity.','Maintaining the channel ties up extra compute.'],
    ['Allowlist','Creates a narrow protected corridor for agents and logistics.','Traffic outside the corridor gets no protection.'],
    ['Closed Loop','Recirculates clean coolant to soften drought penalties.','Needs intact exchange equipment and consumes more power.'],
    ['Private Region','Opens a paid offshore inference region and a naval deployment point.','A disconnected licence link suppresses the income bonus.']
  ],
  broke:[
    ['Ship Tonight','Pushes a release early, converting unfinished research into a weaker model.','Quality and public trust suffer; it also creates patch work.'],
    ['Power Grab','Briefly overcharges a battery route for a delivery burst.','Hot batteries require a cooling recovery period.'],
    ['Offer Letter','Temporarily poaches an exposed researcher’s output.','Visible recruitment activity can be interrupted by identity security.'],
    ['Reply Storm','Floods an exposed command link with noisy synthetic traffic.','A disciplined firewall rapidly isolates the swarm.'],
    ['No Filter','Overclocks local inference attacks and movement.','Heat and post-burst throttling make the second engagement dangerous.'],
    ['Hot Patch','Rapidly removes a local infection and restores one stalled queue.','Its temporary fix expires and needs a researcher to make it permanent.'],
    ['Cold Take','Vents a large emergency cooling burst into nearby cloud barges.','It empties the vessel’s reserve and needs a safe refill route.'],
    ['Move Fast','Relocates a running server raft without fully shutting down.','It risks state drift until a researcher revalidates the replicas.']
  ]
};
export const UNITS = Object.fromEntries(Object.keys(FACTIONS).map(id=>[id,common.map((unit,index)=>({ ...unit,id:`${id}-${index}`,index,name:FACTIONS[id].units[index],ability:abilities[id][index][0],effect:abilities[id][index][1],tradeoff:abilities[id][index][2],faction:id }))]));

export const SPECIALISTS = [
  {name:'Provenance Auditor',role:'Restores poisoned datasets',purpose:'Examines the lineage of a captured archive and cleans hidden contamination.',counter:'Needs time and a safe research team; cannot purify a hostile link instantly.'},
  {name:'Distillation Courier',role:'Moves model weights',purpose:'Carries a compact model checkpoint between campuses or offshore clouds. Capture its route to copy a weaker version of a rival model.',counter:'Encrypted escorts and rotating checkpoint routes.'},
  {name:'Scraper Flock',role:'Finds rare training data',purpose:'Tiny agents explore the university commons and public archives. Over-harvesting erodes trust and exhausts a district’s clean data.',counter:'Data cooperatives, licensing limits, and defenders.'},
  {name:'Eval Judge',role:'Controls benchmark contests',purpose:'Verifies a model in the neutral observatory. A valid result unlocks contracts; contaminated submissions cause a scandal.',counter:'Independent reruns prevent leaderboard laundering.'},
  {name:'Incident Responder',role:'Contains cascading failures',purpose:'Repairs a scheduler, contains an escaped model, and gets staff back into a locked laboratory.',counter:'It is a support specialist and requires a protected work window.'},
  {name:'Talent Scout',role:'Negotiates recruitment',purpose:'Builds influence at the university and recruits rare specialists without sabotage.',counter:'Retention budgets and healthy working conditions.'},
  {name:'Chip Convoy',role:'Moves scarce accelerator hardware',purpose:'Physical accelerators travel from the foundry through roads, rail and ports. A new data centre is not useful until the shipment arrives.',counter:'Route escorts, redundant stock, and interception.'},
  {name:'Cable Tender',role:'Maintains the offshore network',purpose:'A civilian vessel repairs subsea links and creates alternative routes around a cut cable.',counter:'Storms, denied ports, and long maintenance journeys.'},
  {name:'Open-weight Fork',role:'Independent fallback model',purpose:'A cheaper weaker model that keeps running without the proprietary cloud. Useful during licence disputes and blackouts.',counter:'Lower peak capability and ordinary integrity attacks.'}
];

export const STRUCTURES = [
  {id:'campus',col:0,name:'Laboratory campus',cost:1400,job:'Headquarters, staff recruitment and the local model archive. Losing it removes its staff and regional command, but an offshore cloud can preserve checkpoints.',dependency:'Power + staff + a connected archive',failure:'Researchers and model state must be evacuated before a full shutdown.'},
  {id:'research',col:1,name:'Research laboratory',cost:650,job:'Staffed training, evals, interpretability and specialist unlocks. Research speed comes from people and clean data, not a passive timer.',dependency:'Active researchers + research compute + clean data',failure:'Agent lockouts or contaminated data stall releases.'},
  {id:'compute',col:2,name:'Inference centre',cost:680,job:'Runs contracts and embodied models. Compute must be allocated between commercial inference, research, active units and security.',dependency:'Delivered chips + energy + cooling',failure:'Thermal throttling cuts capacity before hardware damage begins.'},
  {id:'cooling',col:3,name:'Cooling exchange',cost:420,job:'Pumps and recirculates coolant through the campus and its offshore network. A large model fleet needs a serious cooling footprint.',dependency:'Clean water intake + pumps + power',failure:'Drought or contamination creates a campus-wide heat bottleneck.'}
];
export const SHARED_STRUCTURES = [
  ['Grid exchange','Stores battery deliveries and connects solar, wind and contracted power.'],['Dataset conservatory','Stores clean, licensed training archives and protects their provenance.'],['Agent bureau','Builds specialist infiltration, audit and recruitment capabilities.'],['Containment ward','Provides quarantine zones and incident response.'],['Dry dock','Builds civilian cooling, maintenance and floating-cloud vessels.'],['Cloud fabric exchange','Connects campuses and grants offshore cloud access.'],['Chip depot','Receives physical hardware shipments before compute can be expanded.'],['Staff commons','Prevents burnout and makes talent poaching harder.']
];

export const DISTRICTS = [
  {id:'foundry',name:'The independent foundry',kind:'HARDWARE',x:17,y:19,color:'#687a89',benefit:'Accelerator deliveries + rail access',story:'The only facility that turns a funded expansion into physical chips. Contracts reserve shipments; roads, rail and ports decide whether they arrive.',risk:'Shipment interception, queue monopolies, and silicon shortages.',counter:'Stockpile a reserve and keep two delivery routes.'},
  {id:'university',name:'University commons',kind:'PEOPLE + DATA',x:45,y:15,color:'#8b779b',benefit:'Rare staff + verified datasets',story:'Researchers, open evaluations and small independent laboratories share this district. Negotiation creates durable access; aggressive scraping produces short-term data and a trust debt.',risk:'Poaching, exhausted datasets, and worker burnout.',counter:'Retention funding and a provenance auditor.'},
  {id:'closed-campus',name:'Closed AI campus',kind:'LABORATORY',x:80,y:24,color:'#21866e',benefit:'Proprietary inference economy',story:FACTIONS.closed.premise,risk:FACTIONS.closed.weakness,counter:'Redundant cloud regions and local fallback models.'},
  {id:'benchmark',name:'Benchmark observatory',kind:'PRESTIGE',x:49,y:47,color:'#927756',benefit:'Model evaluation + contract unlocks',story:'A neutral arena for model capability. Credible evals improve market access. A contaminated leaderboard produces a public scandal rather than a free victory.',risk:'Benchmark laundering and leaked test sets.',counter:'Independent reruns and a diverse eval suite.'},
  {id:'power',name:'Renewables basin',kind:'ENERGY',x:12,y:49,color:'#9f8b45',benefit:'Solar + wind + battery routes',story:'An open energy market at the edge of the research district. Harvesters move stored charge to campuses, making distance and congestion part of the economy.',risk:'Weather variance, charging queues, and route disruption.',counter:'Microgrids, mixed sources, and stored charge.'},
  {id:'misa-campus',name:'Misanthropic campus',kind:'LABORATORY',x:25,y:73,color:'#d97757',benefit:'Verified research + containment',story:FACTIONS.misanthropic.premise,risk:FACTIONS.misanthropic.weakness,counter:'Distribute review capacity and protect the staff.'},
  {id:'wetlands',name:'The coolant commons',kind:'WATER + TRUST',x:52,y:83,color:'#64958c',benefit:'Clean intakes + protected buffers',story:'Clean cooling water is shared with people who live here. Extracting too much damages the wetlands, increases heat later, and closes lucrative public contracts.',risk:'Drought, intake poisoning, and over-extraction.',counter:'Closed-loop exchanges, cooling vessels, and conservation.'},
  {id:'broke-campus',name:'Broke Labs campus',kind:'LABORATORY',x:78,y:75,color:'#343938',benefit:'Fast releases + improvised infrastructure',story:FACTIONS.broke.premise,risk:FACTIONS.broke.weakness,counter:'Cooling reserve and enough people to pay the patch debt.'},
  {id:'port',name:'Cable harbour',kind:'NAVAL + NETWORK',x:88,y:53,color:'#507e8a',benefit:'Offshore compute + shipping routes',story:'A dry dock, cable landing and civilian logistics port. Ships open an entire second economy: coolant delivery, chip transport, server relocation and cable maintenance.',risk:'Storms, denied berths, and subsea cable cuts.',counter:'Escorted cooling fleets and alternative cable landings.'}
];
export const MAPS = {
  delta:{name:'Delta Commons',tag:'COASTAL RESEARCH ARCHIPELAGO',image:'delta-commons-v2.png',cells:'128 × 128',scale:'16,384 proposed tactical cells',focus:'Energy, clean data and naval expansion.',weather:'Tidal cooling; variable renewable supply',routes:'Road, rail, bridge, shipping and subsea cable',rule:'Each campus gets one home energy route and a clean intake. Hardware, benchmark, and offshore expansion stay contested.'},
  cold:{name:'Cold Storage',tag:'POLAR FJORD / GEOTHERMAL FRONTIER',image:'cold-storage-v2.png',cells:'128 × 160',scale:'20,480 proposed tactical cells',focus:'Cooling is abundant. Power and cable access are scarce.',weather:'Ice closures; geothermal monopolies',routes:'Long fjord shipping lanes and ice-crossing roads',rule:'Three independent home microgrids; central geothermal capacity rewards expansion. Ice events change routes symmetrically.'},
  windward:{name:'Windward Sprawl',tag:'SEMI-ARID CLOUD / SOLAR FRONTIER',image:'windward-sprawl-v2.png',cells:'160 × 128',scale:'20,480 proposed tactical cells',focus:'Power is plentiful at noon. Water and storage decide the late game.',weather:'Heat waves; drought; solar peaks',routes:'Solar-field roads, reservoir pipelines and port access',rule:'Home water buffers support the opening. Central reservoir control improves cooling without instantly disabling opponents.'}
};

export const INCIDENTS = {
  blackout:{name:'Grid interruption',duration:40,summary:'External supply loses 45 MW. Batteries and mobile energy logistics keep inference alive.',target:'energy'},
  drought:{name:'Drought',duration:55,summary:'Clean cooling capacity falls by 45. Ships and recirculation protect the hot compute core.',target:'cooling'},
  poison:{name:'Dataset poisoning',duration:0,summary:'Data quality loses 28 points. The infection persists until cleaned; time alone does not cure it.',target:'data'},
  lockout:{name:'Researcher lockout',duration:35,summary:'Four researchers lose access. Training output slows, while commercial inference can continue.',target:'people'},
  surge:{name:'Viral demand spike',duration:30,summary:'Inference demand rises by 24 compute. It earns more only if the infrastructure can serve it.',target:'compute'},
  escape:{name:'Model escape',duration:40,summary:'A rogue model consumes 22 compute and generates extra heat until containment reclaims it.',target:'compute'},
  cable:{name:'Cloud cable cut',duration:45,summary:'The remote region loses its network path. Local compute survives; Closed AI loses more contract access.',target:'network'},
  leak:{name:'Leaked model weights',duration:0,summary:'A copied checkpoint loses differentiation and public trust. A verified new release can recover the lead.',target:'trust'}
};
export const UPGRADES = {
  energy:{name:'Deploy energy logistics',cost:300,summary:'+22 MW supplied; +1 compute upkeep',kind:'Energy harvester'},
  cooling:{name:'Deploy a cooling vessel',cost:480,summary:'+30 cooling; +2 compute upkeep',kind:'Cooling vessel'},
  researcher:{name:'Recruit a researcher',cost:180,summary:'+1 staff; +2 MW total; 12 training workstations',kind:'Researcher'},
  compute:{name:'Commission a data centre',cost:680,summary:'Chip delivery in 25s; +32 compute, +8 MW idle',kind:'Inference centre'},
  cloud:{name:'Launch a floating cloud',cost:1100,summary:'+24 offshore compute; +22 MW idle demand',kind:'Floating cloud'},
  audit:{name:'Provenance audit',cost:240,summary:'Restore 26 data quality; remove persistent infection',kind:'Data specialist'},
  responder:{name:'Incident response',cost:320,summary:'End researcher lockout and contain an escaped model',kind:'Security specialist'}
};
