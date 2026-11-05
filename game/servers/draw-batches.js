import * as T from '../vendor/three/three.module.js';

// Copies complete geometry into native multi-draw buffers. Sources keep their
// animation hierarchy; only their draw submission is replaced.
export class DrawBatches {
 constructor(scene){this.scene=scene;this.groups=new Map();this.sources=new Map();}
 compatible(o){return o.isMesh&&!o.isSkinnedMesh&&!o.isInstancedMesh&&!o.isBatchedMesh&&!Array.isArray(o.material)&&!o.material.transparent&&!o.material.isShaderMaterial&&!Object.values(o.geometry.morphAttributes).some(v=>v.length)&&o.geometry.drawRange.start===0&&o.geometry.drawRange.count===Infinity&&o.layers.mask===1;}
 addRoot(root){root.updateMatrixWorld(true);root.traverse(o=>{if(this.compatible(o)&&!this.sources.has(o)&&o.matrixWorld.determinant()>0)this.add(o);});}
 add(o){
  const geometry=o.geometry,attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${(a.array||a.data.array).constructor.name}`).join('|');
  const key=[o.material.uuid,!!geometry.index,attributes,o.castShadow,o.receiveShadow,o.renderOrder].join('|');let g=this.groups.get(key);
  if(!g){const vertices=Math.max(4096,geometry.attributes.position.count+256),indices=Math.max(8192,(geometry.index?.count||0)+512),mesh=new T.BatchedMesh(64,vertices,indices,o.material);mesh.castShadow=o.castShadow;mesh.receiveShadow=o.receiveShadow;mesh.renderOrder=o.renderOrder;mesh.frustumCulled=false;mesh.perObjectFrustumCulled=false;mesh.sortObjects=false;mesh.matrixAutoUpdate=false;mesh.name='Native draw batch';this.scene.add(mesh);g={mesh,vertices,indices,vertexEnd:0,indexEnd:0,geometries:new Map(),members:new Set(),fragmented:false};this.groups.set(key,g);}
  let geo=g.geometries.get(geometry.uuid);
  if(!geo){const vertices=geometry.attributes.position.count,indices=geometry.index?.count||0;
   if(g.vertexEnd+vertices>g.vertices||g.indexEnd+indices>g.indices){if(g.fragmented){g.mesh.optimize();g.vertexEnd=[...g.geometries.values()].reduce((n,v)=>n+v.vertices,0);g.indexEnd=[...g.geometries.values()].reduce((n,v)=>n+v.indices,0);g.fragmented=false;}
    if(g.vertexEnd+vertices>g.vertices||g.indexEnd+indices>g.indices){g.vertices=Math.max(g.vertices*2,g.vertexEnd+vertices);g.indices=Math.max(g.indices*2,g.indexEnd+indices);g.mesh.setGeometrySize(g.vertices,g.indices);}}
   geo={id:g.mesh.addGeometry(geometry),references:0,vertices,indices};g.geometries.set(geometry.uuid,geo);g.vertexEnd+=vertices;g.indexEnd+=indices;
  }
  if(g.members.size>=g.mesh.maxInstanceCount)g.mesh.setInstanceCount(g.mesh.maxInstanceCount*2);
  const instance=g.mesh.addInstance(geo.id),entry={object:o,group:g,geo,instance,matrix:new T.Matrix4(),initialized:false};geo.references++;g.members.add(entry);this.sources.set(o,entry);o.layers.disable(0);
 }
 update(){
  for(const g of this.groups.values()){let any=false;for(const e of g.members){let visible=true;for(let p=e.object;p;p=p.parent)if(!p.visible){visible=false;break;}
    if(visible&&e.object.matrixWorld.determinant()<=0)visible=false;
    g.mesh.setVisibleAt(e.instance,visible);any||=visible;
    if(visible&&(!e.initialized||!e.matrix.equals(e.object.matrixWorld))){e.matrix.copy(e.object.matrixWorld);g.mesh.setMatrixAt(e.instance,e.matrix);e.initialized=true;}
   }g.mesh.visible=any;
  }
 }
 removeRoot(root){root.traverse(o=>{const e=this.sources.get(o);if(!e)return;const g=e.group;g.mesh.deleteInstance(e.instance);g.members.delete(e);this.sources.delete(o);o.layers.enable(0);if(--e.geo.references===0){g.mesh.deleteGeometry(e.geo.id);g.geometries.delete(o.geometry.uuid);g.fragmented=true;}if(!g.members.size){g.mesh.removeFromParent();g.mesh.dispose();for(const [key,value]of this.groups)if(value===g)this.groups.delete(key);}});}
 stats(){return {batches:this.groups.size,sourceMeshes:this.sources.size};}
 dispose(){for(const g of this.groups.values()){g.mesh.removeFromParent();g.mesh.dispose();}for(const o of this.sources.keys())o.layers.enable(0);this.groups.clear();this.sources.clear();}
}
