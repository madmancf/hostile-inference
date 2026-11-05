import assert from 'node:assert/strict';
import * as T from '../game/vendor/three/three.module.js';
import { DrawBatches } from '../game/servers/draw-batches.js';

const scene=new T.Scene(),root=new T.Group(),geometry=new T.BoxGeometry(1,2,3),material=new T.MeshStandardMaterial();scene.add(root);
const originals=Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,a.array.slice()])),indices=geometry.index.array.slice();
for(let i=0;i<90;i++){const mesh=new T.Mesh(geometry,material);mesh.position.set(i*.31,1.2,-3.9);mesh.rotation.y=i*.017;mesh.scale.set(.5+i*.01,1.2,.9);root.add(mesh);}
const batches=new DrawBatches(scene);batches.addRoot(root);scene.updateMatrixWorld();batches.update();
assert.equal(batches.stats().batches,1);assert.equal(batches.stats().sourceMeshes,90);
for(const [name,values]of Object.entries(originals))assert.deepEqual(geometry.attributes[name].array,values);assert.deepEqual(geometry.index.array,indices);
const e=batches.sources.get(root.children[89]),range=e.group.mesh.getGeometryRangeAt(e.geo.id,{});
for(const [name,a]of Object.entries(geometry.attributes)){const actual=e.group.mesh.geometry.attributes[name].array.slice(range.vertexStart*a.itemSize,(range.vertexStart+a.count)*a.itemSize);assert.deepEqual(actual,a.array);}
const actualIndex=e.group.mesh.geometry.index.array.slice(range.indexStart,range.indexStart+range.indexCount);assert.deepEqual(Array.from(actualIndex,i=>i-range.vertexStart),Array.from(indices));
const matrix=new T.Matrix4();e.group.mesh.getMatrixAt(e.instance,matrix);assert.deepEqual(Array.from(new Float32Array(matrix.elements)),Array.from(new Float32Array(e.object.matrixWorld.elements)));
root.rotation.z=.22;root.children[89].position.x=34.7;root.children[89].scale.x=.1;scene.updateMatrixWorld();batches.update();e.group.mesh.getMatrixAt(e.instance,matrix);assert.deepEqual(Array.from(new Float32Array(matrix.elements)),Array.from(new Float32Array(e.object.matrixWorld.elements)));
root.visible=false;batches.update();assert.equal(e.group.mesh.getVisibleAt(e.instance),false);root.visible=true;batches.update();assert.equal(e.group.mesh.getVisibleAt(e.instance),true);
const transparent=new T.Mesh(geometry,new T.MeshBasicMaterial({transparent:true})),skin=new T.SkinnedMesh(geometry,material),mirrored=new T.Mesh(geometry,material);mirrored.scale.x=-1;root.add(transparent,skin,mirrored);batches.addRoot(root);assert.equal(transparent.layers.mask,1);assert.equal(skin.layers.mask,1);assert.equal(mirrored.layers.mask,1);
batches.removeRoot(root);assert.equal(batches.stats().sourceMeshes,0);assert.equal(batches.stats().batches,0);assert.equal(root.children[0].layers.mask,1);
const next=new T.Group();scene.add(next);next.add(new T.Mesh(geometry,material));batches.addRoot(next);scene.updateMatrixWorld();batches.update();assert.equal(batches.stats().sourceMeshes,1);batches.dispose();assert.equal(batches.stats().batches,0);
console.log('PASS complete vertex attributes and oriented indices, material identity, capacity growth, animated transforms, ancestor visibility, skin/alpha/mirrored fallback, destruction and replay');
