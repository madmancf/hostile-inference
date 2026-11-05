// Authored plots share the road graph; architecture and rules belong to each lab.
const branch=(id,name,cost,seconds,hp,effect,bonus,research)=>({id,name,cost,seconds,hp,effect,bonus,research});
const tech=(id,name,cost,seconds,effect,bonus)=>({id,name,cost,seconds,effect,bonus});
export const BUILDING_TREES={
 misanthropic:{title:'The constitutional campus',identity:'Establish protected infrastructure. Research makes your slow formations harder to dislodge.',plots:[[.48,.68,'reviewBridge'],[.49,.25,'lab'],[.78,.60,'eastRoad']],branches:[
  branch('cloister','Containment Cloister',300,16,1050,'Established wards absorb 25% damage instead of 20%.',{wardReduction:.05},[
   tech('layered-proof','Layered Proof',240,18,'Ward radius grows from 145m to 170m.',{wardRange:25}),
   tech('immutable-charter','Immutable Charter',600,32,'Wards absorb 35% damage and repair occupants at 2 HP/s. Requires a stationary Constitution.',{wardReduction:.10,wardRegen:2})]),
  branch('archive','Audit Spire',340,20,850,'Researchers validate checkpoints 25% faster.',{validation:.25},[
   tech('proof-carrying','Proof-carrying Models',260,20,'Models deal 15% more endpoint damage.',{siege:.15}),
   tech('consensus','Consensus Protocol',620,34,'Abilities recharge 25% faster; researchers repair 2 extra HP/s. Models move 10% slower.',{abilityRecharge:-.25,repair:2,modelSpeed:-.10})]),
  branch('reservoir','Cold Archive',380,22,1100,'Passive cooling: 0.35°/s; energy consumption falls 5%.',{cooling:.35,energyUse:-.05},[
   tech('closed-circuit','Sealed Circulation',220,18,'Each battery delivers 15 additional energy.',{harvestEnergy:15}),
   tech('cold-storage','Cold Storage',580,30,'Adds 20 compute and cuts energy consumption another 20%.',{capacity:20,energyUse:-.20})])]},
 closed:{title:'The proprietary stack',identity:'Connect services, collect access revenue, then choose control, scale or concentrated force.',plots:[[.40,.68,'gateRoad'],[.35,.30,'lab'],[.79,.56,'eastArc']],branches:[
  branch('exchange','Routing Exchange',320,18,900,'Gatekeeper links extend from 155m to 180m.',{linkRange:25},[
   tech('latency-market','Priority Lanes',260,20,'Staffed unit assembly is 15% faster.',{assembly:.15}),
   tech('network-effects','Network Effects',640,34,'Focus damage grows by 10 per repeated hit instead of 7. Energy consumption rises 20%.',{focusDamage:3,energyUse:.20})]),
  branch('bureau','Licensing Bureau',360,20,850,'Access contracts earn 2 additional funds per second.',{income:2},[
   tech('metered-access','Metered Access',260,20,'Each battery contract earns 40 additional funds.',{harvestFunds:40}),
   tech('license-lock','Exclusive Licence',620,32,'Marks amplify linked damage by 40% instead of 25%; +2 funds/s. Ability recharge takes 15% longer.',{markDamage:.15,income:2,abilityRecharge:.15})]),
  branch('fabric','Private Fabric',400,24,1100,'Adds 12 compute capacity.',{capacity:12},[
   tech('reserved-instances','Reserved Instances',280,22,'Each Black Box reserves 2 less compute, including existing and queued models.',{modelCompute:-2}),
   tech('sovereign-cloud','Sovereign Cloud',650,36,'Adds 20 compute; linked units absorb 15% damage. Energy consumption rises 30%.',{capacity:20,linkedArmour:.15,energyUse:.30})])]},
 broke:{title:'The acceleration stack',identity:'Cheap industry and fast iteration. Specialize in throughput, dangerous bursts or thermal endurance.',plots:[[.67,.27,'labRoad'],[.19,.36,'upperRoad'],[.72,.66,'campus']],branches:[
  branch('foundry','Fork Foundry',260,12,750,'Staffed unit assembly is 20% faster.',{assembly:.20},[
   tech('fork-bomb','Mass Forking',200,16,'New Reply Swarms cost 40 less funds.',{malwareDiscount:40}),
   tech('ship-everything','Ship Everything',540,26,'Adds 35% assembly speed, but generates 0.5° heat/s even when the queue is empty.',{assembly:.35,heat:.5})]),
  branch('reactor','Scrapyard Reactor',280,14,800,'Battery deliveries earn 25 extra funds.',{harvestFunds:25},[
   tech('salvage-rights','Salvage Rights',220,18,'Contain an opposing unit to recover 40 funds.',{bounty:40}),
   tech('run-hot','Run Hot',560,28,'No Filter deals 75% bonus damage instead of 55%. Every model shot adds 0.3° extra heat; recovery lasts 2s longer.',{burstDamage:.20,shotHeat:.3,recovery:2})]),
  branch('quench','Quench Tower',320,16,950,'Passive cooling removes 0.45° heat/s.',{cooling:.45},[
   tech('thermal-buffer','Thermal Buffer',220,18,'Inference throttling begins at 80° instead of 70°.',{heatThreshold:10}),
   tech('deep-freeze','Deep Freeze',560,28,'Cold Take vents 40° instead of 28°; shots and field abilities generate 25% less heat.',{coolerBurst:12,heatGain:-.25})])]}
};
export const facilitySite=index=>'facility'+(index+1);
export const tree=faction=>BUILDING_TREES[faction];
export const branchAt=(faction,site)=>tree(faction).branches[Number(site.slice(8))-1];
const NODE_INDEX=Object.fromEntries(Object.entries(BUILDING_TREES).map(([f,t])=>[f,Object.fromEntries(t.branches.flatMap((b,index)=>[[b.id,Object.freeze({...b,type:'build',site:facilitySite(index),branch:b,tier:1})],...b.research.map((r,n)=>[r.id,Object.freeze({...r,type:'research',site:facilitySite(index),branch:b,tier:n+2})])]))]));
export const nodeInfo=(faction,id)=>Object.hasOwn(NODE_INDEX,faction)&&Object.hasOwn(NODE_INDEX[faction],id)?NODE_INDEX[faction][id]:null;
