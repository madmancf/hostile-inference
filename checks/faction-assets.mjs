import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {factionAssetKit as kit} from '../design-preview/servers/live-world.js';
import {buildFactionMachine,buildFactionBuilding,outfitFactionPerson} from '../design-preview/servers/faction-assets.js';
import {DrawBatches} from '../design-preview/servers/draw-batches.js';
const {T}=kit,factions=['misanthropic','closed','broke'],roles=['harvester','model','firewall','malware','cooler','cloud'],buildings=['lab','grid','gate','intake','dock','annex'];
// All surfaces deliberately use the same material: fingerprints cannot pass on palette changes.
const gray=new T.MeshStandardMaterial({color:'#808080'}),materials=Object.fromEntries(['paper','accent','dark','metal','glow'].map(k=>[k,gray]));
const report=[];
function signature(root){root.updateMatrixWorld(true);const hash=createHash('sha256'),v=new T.Vector3();let count=0;root.traverse(o=>{if(!o.isMesh)return;count++;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));hash.update(v.toArray().map(n=>n.toFixed(4)).join(','));}});assert.ok(count>5);return hash.digest('hex');}
for(const role of [...roles,...buildings]){
 const identities=[];
 for(const faction of factions){
  const scene=new T.Scene(),root=new T.Group(),animations=[];scene.add(root);
  if(buildings.includes(role))buildFactionBuilding({faction,kind:role,root,animations,materials,kit});else buildFactionMachine({faction,role,body:root,animations,materials,kit});
  for(const f of animations)f(0,{id:2,moving:false,animDistance:0,cargo:0,shot:0});const neutral=signature(root);identities.push(neutral);
  const before=new Map();root.traverse(o=>before.set(o,o.matrix.clone()));for(const f of animations)f(2.15,{id:2,moving:true,animDistance:167,cargo:40,shot:.3});signature(root);
  let motion=0;root.traverse(o=>{if(!o.matrix.equals(before.get(o))){motion++;assert.equal(o.userData.dynamic,true,'animated transforms must remain live after static freezing: '+faction+'/'+role);}});
  if(!['dock','annex'].includes(role))assert.ok(motion>0,faction+'/'+role+' must articulate');
  const batches=new DrawBatches(scene);batches.addRoot(root);scene.updateMatrixWorld(true);batches.update();assert.ok(batches.stats().sourceMeshes>0);for(const f of animations)f(3.2,{id:2,moving:true,animDistance:202,cargo:40,shot:0});scene.updateMatrixWorld(true);batches.update();batches.removeRoot(root);assert.equal(batches.stats().sourceMeshes,0);batches.dispose();
  report.push({faction,role,movingParts:motion});
 }
 assert.equal(new Set(identities).size,3,role+' must have three different grayscale geometries');
}
for(const faction of factions)for(const role of ['researcher','agent']){
 const body=new T.Group(),human=new T.Group(),spine=new T.Bone(),head=new T.Bone();spine.name='Spine02';spine.position.y=1.85;head.name='Head';head.position.y=2.42;human.add(spine,head);body.add(human);const gear=outfitFactionPerson({faction,role,body,human,materials,kit,animations:[]});assert.equal(gear.chest.parent,spine);assert.equal(gear.head.parent,head);body.updateMatrixWorld(true);const before=gear.head.matrixWorld.clone();head.rotation.z=.2;body.updateMatrixWorld(true);assert.ok(!gear.head.matrixWorld.equals(before),'equipment follows bone animation');assert.ok(gear.head.matrixWorld.elements.every(Number.isFinite));
}
console.log('PASS 36 neutral-material geometries, articulated transforms, native batching / deletion, and all six character equipment sets bound to animated bones');
