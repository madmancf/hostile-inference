import {techBonuses} from '../demo/faction-tech.js';
import * as T from '../vendor/three/three.module.js';

// Analytic, camera-facing steam: no low-poly spheres or low-resolution bitmap.
export function coolingVapour(){
 const geometry=new T.PlaneGeometry(1,1),seeds=Float32Array.from({length:48},(_,i)=>i/48);geometry.setAttribute('aSeed',new T.InstancedBufferAttribute(seeds,1));
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},
 vertexShader:`attribute float aSeed;uniform float time;varying vec2 vUv;varying float vAge;void main(){vUv=uv;float age=fract(time*.12+aSeed);vAge=age;vec3 offset=vec3(sin(aSeed*73.+time*.22)*age*.8,age*3.7,cos(aSeed*53.+time*.17)*age*.6);vec4 centre=modelViewMatrix*instanceMatrix*vec4(offset,1.);float size=.34+age*1.65;centre.xy+=position.xy*size;gl_Position=projectionMatrix*centre;}`,
 fragmentShader:`varying vec2 vUv;varying float vAge;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){vec2 p=vUv*2.-1.;float n=noise(p*3.+vec2(time*.09,-time*.15))*.65+noise(p*6.-time*.08)*.35;float density=exp(-dot(p,p)*4.8)*smoothstep(.18,.62,n);float fade=smoothstep(0.,.18,vAge)*(1.-smoothstep(.5,1.,vAge));float alpha=density*fade*.21;if(alpha<.003)discard;gl_FragColor=vec4(vec3(.96,.97,.96),alpha);\n#include <colorspace_fragment>\n}`});
 const mesh=new T.InstancedMesh(geometry,material,48),dummy=new T.Object3D();for(let i=0;i<48;i++){dummy.position.set(i%2?1.5:-1.5,2.8,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.frustumCulled=false;mesh.userData.dynamic=true;mesh.renderOrder=8;return {mesh,update:t=>material.uniforms.time.value=t};
}

// Preallocated packets, impact halos and sparks. Combat never rebuilds geometry.
export class BattleEffects{
 constructor(parent){this.root=new T.Group();parent.add(this.root);this.seen=new WeakSet();this.slots=[];this.cursor=0;this.materials=new Map();this.axis=new T.Vector3(0,1,0);this.a=new T.Vector3();this.b=new T.Vector3();this.delta=new T.Vector3();
  this.ball=new T.SphereGeometry(.13,10,6);this.streak=new T.CylinderGeometry(.025,.025,1,6);this.ring=new T.RingGeometry(.85,1,40);this.plane=new T.PlaneGeometry(1,1);
  for(let i=0;i<40;i++){const root=new T.Group(),packet=new T.Mesh(this.ball),tail=new T.Mesh(this.streak),halo=new T.Mesh(this.ring,new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.65,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide})),flare=new T.Mesh(this.plane,new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{color:{value:new T.Color()},opacity:{value:1}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;uniform vec3 color;uniform float opacity;void main(){vec2 p=v*2.-1.;float a=exp(-dot(p,p)*7.)*opacity;gl_FragColor=vec4(color,a);\n#include <colorspace_fragment>\n}'}));root.add(packet,tail,halo,flare);halo.rotation.x=-Math.PI/2;root.visible=false;this.root.add(root);this.slots.push({root,packet,tail,halo,flare,start:-100,p:new T.Vector3(),q:new T.Vector3(),server:null,mode:'shot',role:null});}
  this.particleCount=480;const positions=new Float32Array(this.particleCount*3),colours=new Float32Array(this.particleCount*3),sizes=new Float32Array(this.particleCount),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));g.setAttribute('color',new T.BufferAttribute(colours,3).setUsage(T.DynamicDrawUsage));g.setAttribute('size',new T.BufferAttribute(sizes,1).setUsage(T.DynamicDrawUsage));const material=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{pixelRatio:{value:1}},vertexShader:'attribute vec3 color;attribute float size;varying vec3 c;uniform float pixelRatio;void main(){c=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*pixelRatio;}',fragmentShader:'varying vec3 c;void main(){vec2 p=gl_PointCoord*2.-1.;float a=exp(-dot(p,p)*5.);if(a<.02)discard;gl_FragColor=vec4(c,a);\n#include <colorspace_fragment>\n}'});this.sparks=new T.Points(g,material);this.sparks.frustumCulled=false;this.root.add(this.sparks);this.buffers={positions,colours,sizes};
 }
 colour(color){if(!this.materials.has(color))this.materials.set(color,new T.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));return this.materials.get(color);}
 update(effects,server,time,camera,pixelRatio=1){
  for(const e of effects){if(e.server!==server||this.seen.has(e))continue;this.seen.add(e);const s=this.slots[this.cursor++%this.slots.length];s.start=time;s.server=server;s.mode=e.tx!==undefined?'shot':e.burst?'burst':'ring';s.role=e.role;s.p.set((e.x-836)/22,3.5,(e.y-470.5)/22);s.q.set(((e.tx??e.x)-836)/22,e.kind==='siege'?5.2:3.5,((e.ty??e.y)-470.5)/22-(e.kind==='siege'?7.3:0));s.color=new T.Color(e.color);const m=this.colour(e.color);s.packet.material=s.tail.material=m;s.halo.material.color.copy(s.color);s.flare.material.uniforms.color.value.copy(s.color);}
  let count=0;const {positions,colours,sizes}=this.buffers;sizes.fill(0);
  for(const s of this.slots){const age=time-s.start,duration=s.mode==='shot'?.8:1;s.root.visible=s.server===server&&age>=0&&age<duration;if(!s.root.visible)continue;const flight=.35,impact=Math.max(0,(age-flight)/(duration-flight));s.packet.visible=s.tail.visible=s.mode==='shot'&&age<flight;s.halo.visible=s.flare.visible=s.mode!=='shot'||age>=flight;
   if(s.mode==='shot'&&age<flight){const k=age/flight;this.a.copy(s.p).lerp(s.q,k);this.a.y+=Math.sin(k*Math.PI)*(s.role==='model'?1.2:.45);this.b.copy(s.p).lerp(s.q,Math.max(0,k-.1));this.b.y+=Math.sin(Math.max(0,k-.1)*Math.PI)*(s.role==='model'?1.2:.45);s.packet.position.copy(this.a);s.packet.scale.setScalar(s.role==='model'?1.5:1);this.delta.copy(this.a).sub(this.b);s.tail.position.copy(this.a).add(this.b).multiplyScalar(.5);s.tail.scale.y=this.delta.length();this.delta.normalize();s.tail.quaternion.setFromUnitVectors(this.axis,this.delta);}
   const k=s.mode==='shot'?impact:age/duration,radius=s.mode==='shot'? .3+k*1.1:.4+k*3;s.halo.position.copy(s.q);s.halo.position.y=2.04;s.halo.scale.setScalar(radius);s.halo.material.opacity=(1-k)*.65;s.flare.position.copy(s.q);s.flare.quaternion.copy(camera.quaternion);s.flare.scale.setScalar((s.mode==='shot'?2.2:3)*(1-k));s.flare.material.uniforms.opacity.value=(1-k)*.8;
   if(s.mode==='shot'&&age<flight)continue;for(let i=0;i<12&&count<this.particleCount;i++){const a=i*2.399963,spread=k*(s.mode==='burst'?3:1.8),o=count*3;positions[o]=s.q.x+Math.cos(a)*spread;positions[o+1]=s.q.y+Math.sin(i*4.1)*spread*.5+k-k*k*2;positions[o+2]=s.q.z+Math.sin(a)*spread;colours[o]=s.color.r;colours[o+1]=s.color.g;colours[o+2]=s.color.b;sizes[count]=(1-k)*4;count++;}
  }
  this.sparks.material.uniforms.pixelRatio.value=pixelRatio;for(const a of Object.values(this.sparks.geometry.attributes))a.needsUpdate=true;
 }
 reset(){this.seen=new WeakSet();this.cursor=0;for(const s of this.slots){s.start=-Infinity;s.root.visible=false;}this.buffers.sizes.fill(0);}
 dispose(){for(const g of [this.ball,this.streak,this.ring,this.plane,this.sparks.geometry])g.dispose();for(const m of this.materials.values())m.dispose();for(const s of this.slots){s.flare.material.dispose();s.halo.material.dispose();}this.sparks.material.dispose();this.root.parent?.remove(this.root);}
}

// One bounded buffer for the whole network. Links never allocate scene objects in combat.
export class NetworkLinks {
 constructor(parent){
  this.positions=new Float32Array(64*6);this.geometry=new T.BufferGeometry();
  this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
  this.material=new T.LineBasicMaterial({color:'#6fd3b5',transparent:true,opacity:.38,depthWrite:false});
  this.mesh=new T.LineSegments(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.userData.dynamic=true;parent.add(this.mesh);
 }
 update(game){
  let n=0;
  for(const u of game.units){
   if(n>=64||u.faction!=='closed'||u.role==='firewall'||u.hp<=0||u.transit||u.server!==game.activeServer||!u.linked)continue;
   const f=game.units.find(f=>f.faction==='closed'&&f.role==='firewall'&&f.hp>0&&!f.transit&&!f.locked&&f.team===u.team&&f.server===u.server&&Math.hypot(f.x-u.x,f.y-u.y)<155+(techBonuses(game,f.faction).linkRange||0));
   if(!f)continue;
   const i=n++*6;this.positions[i]=(u.x-836)/22;this.positions[i+1]=2.12;this.positions[i+2]=(u.y-470.5)/22;
   this.positions[i+3]=(f.x-836)/22;this.positions[i+4]=2.12;this.positions[i+5]=(f.y-470.5)/22;
  }
  this.geometry.setDrawRange(0,n*2);this.geometry.attributes.position.needsUpdate=true;this.mesh.visible=n>0;
 }
 dispose(){this.geometry.dispose();this.material.dispose();this.mesh.parent?.remove(this.mesh);}
}
