// Authored, articulated faction assets. Shapes carry identity before colour does.
// The renderer supplies its cached geometry/material kit and batches these meshes.
export const FACTION_DESIGN = Object.freeze({
 misanthropic:{name:'Ceramic republic',shape:'Petals, arches and concentric shells',motion:'Folding, deliberate articulation',machine:'Solar scarab / ceramic ward / unfolding oracle'},
 closed:{name:'Sealed infrastructure',shape:'Offset monoliths, planar shutters and enclosed modules',motion:'Linear slides, indexed alignment',machine:'Battery tug / access monolith / sealed endpoint'},
 broke:{name:'Exposed acceleration',shape:'Flywheels, trusses, pistons and suspended racks',motion:'Mechanical gait, counter-rotation and loaded suspension',machine:'Capacitor walker / patch crawler / inference flywheel'}
});

function toolkit(k,materials,animations){
 const {T,box,cyl,sphere,torus,tube,group,mesh,rounded,geo,fan}=k;
 const {paper,accent,dark,metal,glow}=materials;
 const moving=o=>(o.userData.dynamic=true,o);
 const shell=(g,x,y,z,w,h,d,m=paper,r=.12)=>mesh(g,rounded(w,h,d,r),m,x,y,z);
 const ring=(g,x,y,z,r,t,m=metal,horizontal=false)=>{const o=torus(g,x,y,z,r,t,m);if(horizontal)o.rotation.x=Math.PI/2;return o;};
 const rod=(g,a,b,r=.055,m=metal)=>{const p=new T.Vector3(...a),q=new T.Vector3(...b),v=q.clone().sub(p),o=cyl(g,...p.clone().add(q).multiplyScalar(.5).toArray(),r,v.length(),m,12);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;};
 const vents=(g,x,y,z,w,h,count=7,m=dark)=>{for(let i=0;i<count;i++)box(g,x+(i-(count-1)/2)*w/count,y,z,w/count*.45,h,.035,m);};
 const wheels=(g,sides=[-1,1],zs=[-.7,.7],r=.4,width=1)=>{for(const x of sides)for(const z of zs){const axle=moving(group(g,x*width,r+.12,z));ring(axle,0,0,0,r,.12,dark).rotation.y=Math.PI/2;cyl(axle,0,0,0,r*.75,.2,metal,24).rotation.z=Math.PI/2;for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rod(axle,[x*.13,0,0],[x*.13,Math.sin(a)*r*.66,Math.cos(a)*r*.66],.035,accent);}animations.push((t,s)=>axle.rotation.x=-(s.animDistance||0)/22/r);}};
 const petal=(g,w=1,h=2,m=paper)=>{const o=mesh(g,geo('ceramic-leaf-'+w+','+h,()=>{const s=new T.Shape();s.moveTo(0,-h/2);s.bezierCurveTo(w*.7,-h*.12,w*.5,h*.25,0,h/2);s.bezierCurveTo(-w*.5,h*.25,-w*.7,-h*.12,0,-h/2);const a=new T.ExtrudeGeometry(s,{depth:.14,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:3,curveSegments:12,steps:1});a.translate(0,0,-.07);return a;}),m);return o;};
 const rack=(g,x,y,z,w=1,h=1.5,d=.8)=>{shell(g,x,y,z,w,h,d,dark,.07);for(let i=0;i<5;i++){box(g,x,y-h*.36+i*h*.18,z+d/2+.025,w*.78,.055,.045,metal);box(g,x+w*.3,y-h*.36+i*h*.18,z+d/2+.05,.07,.045,.035,glow);}vents(g,x,y+h*.1,z-d/2-.025,w*.8,h*.65);};
 const feet=(g,count=6,r=1.1,height=1.2)=>{for(let i=0;i<count;i++){const a=i*Math.PI*2/count,p=moving(group(g,Math.cos(a)*r*.65,height,Math.sin(a)*r*.65));p.rotation.y=-a;const hip=moving(group(p));sphere(hip,0,0,0,.13,accent);rod(hip,[0,0,0],[r*.48,-height*.4,0],.07);const knee=moving(group(hip,r*.48,-height*.4,0));sphere(knee,0,0,0,.10,metal);rod(knee,[0,0,0],[r*.14,-height*.53,0],.065,dark);shell(knee,r*.14,-height*.56,0,.3,.11,.28,metal,.05);animations.push((t,s)=>{const walk=s.moving?1:0,phase=(s.animDistance||0)/22*4.5+i*Math.PI;hip.rotation.z=Math.sin(phase)*.22*walk;knee.rotation.z=Math.max(0,-Math.sin(phase))*.38*walk;p.rotation.y=-a+Math.cos(phase)*.18*walk;});}};
 const propellers=(g,x,y,z,r=.3)=>fan(g,x,y,z,r,metal,animations,'y',4);
 return {...k,...materials,moving,shell,ring,rod,vents,wheels,petal,rack,feet,propellers};
}

export function buildFactionMachine({faction,role,body,animations,materials,kit}){
 const a=toolkit(kit,materials,animations),{T,box,cyl,sphere,tube,group,mesh,geo,fan,paper,accent,dark,metal,glow,moving,shell,ring,rod,vents,wheels,petal,rack,feet,propellers}=a;
 body.userData.dynamic=true;body.userData.factionDesign=FACTION_DESIGN[faction].name;body.userData.assetRole=role;
 let height=3,core=null;
 if(role==='harvester'){
  if(faction==='misanthropic'){
   height=2.4;wheels(body,[-1,1],[-.85,.85],.43,.93);shell(body,0,1,0,1.6,.63,2.5,paper,.3);shell(body,0,1.33,.92,1.2,.35,.45,accent,.15);
   cyl(body,0,1.42,-.35,.54,.65,accent,32);for(const side of [-1,1]){const hinge=moving(group(body,side*.18,1.9,-.3));hinge.rotation.z=side*.18;const leaf=petal(hinge,1.5,2,paper);leaf.rotation.x=Math.PI/2;leaf.position.x=side*.65;petal(leaf,1.3,1.8,materials.solar||dark).position.z=-.13;for(let i=0;i<5;i++){const y=-.6+i*.3;box(leaf,0,y,-.25,.65*(1-Math.abs(y)*.45),.018,.025,metal);}animations.push((t,s)=>hinge.rotation.z=side*(.18+(s.moving?.04:Math.sin(t*.4)*.025)));}
   core=cyl(body,0,1.78,-.35,.26,.22,glow,24);tube(body,[[-.65,1.4,-1],[-.65,1.7,0],[-.65,1.2,1]],.065,accent);
  }else if(faction==='closed'){
   height=2.25;wheels(body,[-1,1],[-1,0,1],.34,1.08);shell(body,0,.72,0,2.15,.6,3.15,paper,.24);shell(body,0,1.3,-.45,1.85,.8,1.9,paper,.14);shell(body,0,1.73,-.45,1.95,.12,2,accent,.08);
   for(const x of [-.53,.53]){shell(body,x,1.3,.87,.85,.62,.6,metal,.09);box(body,x,1.37,1.21,.55,.13,.025,glow);}vents(body,0,.85,1.65,1.6,.18,9);box(body,0,1.4,-1.43,1.3,.2,.025,dark);const dock=moving(group(body,0,1.22,.75));box(dock,0,0,0,1.8,.06,.8,accent);animations.push((t,s)=>dock.position.z=.75+(s.moving?0:.10*Math.sin(t*1.2)));core=box(body,0,1.92,-.45,.9,.04,1.3,glow);
  }else{
   height=2.6;feet(body,6,1.05,1.15);ring(body,0,1.25,0,.78,.13,metal,true);cyl(body,0,1.38,0,.74,.36,dark,32);const rotor=moving(group(body,0,1.78,0));cyl(rotor,0,0,0,.53,.87,metal,32);ring(rotor,0,.34,0,.56,.045,accent,true);for(let i=0;i<12;i++){const q=i*Math.PI/6;box(rotor,Math.cos(q)*.55,0,Math.sin(q)*.55,.055,.66,.055,dark);}for(const z of [-.48,.48])tube(body,[[-.65,1.3,z],[-.92,1.8,z],[-.6,2.3,z],[.6,2.3,z],[.92,1.8,z],[.65,1.3,z]],.065,metal);core=cyl(rotor,0,.52,0,.24,.15,glow,24);animations.push((t,s)=>{rotor.rotation.y=t*(s.cargo?2:1.1);body.position.y=s.moving?Math.sin(s.animDistance/22*9)*.025:0;});
  }
  const charge=moving(group(body));for(let i=0;i<4;i++)box(charge,(i-1.5)*.19,height-.2,.5,.13,.07,.06,glow);animations.push((t,s)=>charge.visible=!!s.cargo);
 }else if(role==='model'){
  if(faction==='misanthropic'){
   height=4.8;body.position.y=2.35;core=mesh(body,geo('oracle-core',()=>new T.IcosahedronGeometry(.65,2)),glow);ring(body,0,-.25,0,.78,.09,metal,true);
   for(let i=0;i<5;i++){const q=i*Math.PI*2/5,arm=moving(group(body,Math.cos(q)*1.05,0,Math.sin(q)*1.05));arm.rotation.y=-q+Math.PI/2;const wing=moving(group(arm));petal(wing,1.15,3.05);petal(wing,.73,2.25,accent).position.z=-.13;rod(arm,[0,-.9,-.2],[0,.8,-.2],.035,metal);animations.push((t,s)=>{const attack=Math.min(1,(s.shot||0)/.35);wing.rotation.x=.12+Math.sin(t*.7+i)*.10+attack*.28;arm.position.y=Math.sin(t*1.1+i*.4)*.08;});}
   animations.push((t,s)=>{body.position.y=2.35+Math.sin(t*1.1)*.07;core.rotation.y=t*.45;core.scale.setScalar(1+(s.shot||0)*.35);});
  }else if(faction==='closed'){
   height=4.7;body.position.y=2.4;core=box(body,0,0,0,.82,2.55,.82,glow);for(const side of [-1,1]){const casing=moving(group(body,side*.71,0,0));shell(casing,0,0,0,1.08,3.55,1.65,paper,.13);box(casing,-side*.52,0,0,.06,3.1,1.15,accent);vents(casing,0,-1.2,.86,.8,.22);animations.push((t,s)=>casing.position.x=side*(.71+(s.shot||0)*.8));}for(const y of [-1.35,1.35]){const seal=moving(group(body,0,y,0));shell(seal,0,0,0,2.6,.2,1.9,metal,.08);animations.push((t,s)=>seal.rotation.y=Math.sin(t*.45)*.04);}animations.push(t=>body.position.y=2.4+Math.sin(t)*.035);
  }else{
   height=5;body.position.y=2.5;core=box(body,0,0,0,.78,1.2,.78,glow);for(const side of [-1,1]){const gyro=moving(group(body,0,0,side*.6));ring(gyro,0,0,0,1.65,.16,metal);ring(gyro,0,0,0,1.44,.055,accent);for(let i=0;i<8;i++){const q=i*Math.PI/4;rod(gyro,[Math.cos(q)*.6,Math.sin(q)*.6,0],[Math.cos(q)*1.52,Math.sin(q)*1.52,0],.065,dark);const module=shell(gyro,Math.cos(q)*1.61,Math.sin(q)*1.61,0,.47,.65,.43,dark,.07);module.rotation.z=q;box(module,0,0,.24,.27,.28,.035,metal);}animations.push((t,s)=>gyro.rotation.z=side*(t*1.1+(s.animDistance||0)/22*.13));}for(const x of [-1.8,1.8]){rod(body,[x,-1.5,-.8],[x,1.2,.8],.08);tube(body,[[x,-1.5,.8],[x,1.5,.8],[0,1.75,.8]],.09,metal);}animations.push((t,s)=>{body.position.y=2.5+Math.sin(t*1.5)*.055;core.rotation.y=t*.8;});
  }
 }else if(role==='firewall'){
  if(faction==='misanthropic'){
   height=3.8;wheels(body,[-1,1],[-.58,.58],.33,.76);cyl(body,0,.65,0,.89,.4,paper,32);core=sphere(body,0,1.8,0,.35,glow);for(let i=0;i<3;i++){const arch=moving(group(body,0,1.8,0));arch.rotation.y=i*Math.PI/3;ring(arch,0,0,0,1.35,.13,paper);for(const x of [-1.25,1.25])shell(arch,x,0,0,.27,.7,.35,accent);animations.push((t,s)=>arch.rotation.y=i*Math.PI/3+Math.sin(t*.35)*.08+(s.shot||0)*.15);}
  }else if(faction==='closed'){
   height=3.4;wheels(body,[-1,1],[-.52,.52],.32,.72);shell(body,0,.73,0,1.5,.42,1.6,paper);shell(body,0,1.65,0,1.25,1.5,.75,paper);core=box(body,0,1.6,.41,.6,.9,.04,glow);for(const side of [-1,1]){const shutter=moving(group(body,side*.67,1.8,0));shell(shutter,0,0,0,.42,2.5,1.02,accent);animations.push((t,s)=>shutter.position.x=side*(.67+(s.shot||0)*.65));}shell(body,0,3.08,0,1.75,.15,1.05,metal);
  }else{
   height=3.2;for(const side of [-1,1]){shell(body,side*.85,.46,0,.52,.38,2.1,dark);wheels(body,[side],[-.73,0,.73],.3,.88);for(let i=0;i<8;i++)box(body,side*.85,.70,(i-3.5)*.24,.52,.045,.1,metal);}rack(body,0,1.25,0,1.15,1.1,1.3);const cage=moving(group(body,0,2.4,0));ring(cage,0,0,0,.83,.12,metal);for(let i=0;i<6;i++){const q=i*Math.PI/3;rod(cage,[Math.cos(q)*.83,Math.sin(q)*.83,-.35],[Math.cos(q)*.83,Math.sin(q)*.83,.35],.05,accent);}core=sphere(cage,0,0,0,.33,glow);animations.push((t,s)=>cage.rotation.z=t*1.2+(s.shot||0)*.8);
  }
 }else if(role==='malware'){
  if(faction==='misanthropic'){
   height=1.6;for(let i=0;i<7;i++){const link=moving(group(body,0,.52,(i-3)*.34));const scale=1-Math.abs(i-3)*.12;sphere(link,0,0,0,.39*scale,paper);ring(link,0,0,0,.33*scale,.045,accent);for(const side of [-1,1])rod(link,[side*.22,-.1,0],[side*.44,-.39,.12],.035,metal);animations.push((t,s)=>{const phase=(s.animDistance||0)/22*5+i*.65;link.position.x=Math.sin(phase)*.15;link.position.y=.52+Math.cos(phase)*.04;});}core=sphere(body,0,.7,1.28,.16,glow);
  }else if(faction==='closed'){
   height=1.6;for(let i=0;i<3;i++){const segment=moving(group(body,0,.6,(i-1)*.73));shell(segment,0,0,0,.85,.58,.65,paper,.07);box(segment,0,.32,0,.65,.04,.46,accent);for(const side of [-1,1]){const leg=moving(group(segment,side*.46,0,0));rod(leg,[0,0,0],[side*.30,-.3,.15],.045,dark);animations.push((t,s)=>leg.rotation.y=Math.sin((s.animDistance||0)/22*6+i+side)*.32*(s.moving?1:0));}animations.push((t,s)=>segment.rotation.y=Math.sin((s.animDistance||0)/22*3-i*.5)*.12);}core=box(body,0,.61,1.13,.45,.21,.045,glow);
  }else{
   height=1.7;for(let i=0;i<3;i++){const bug=moving(group(body,Math.cos(i*2.1)*.5,0,Math.sin(i*2.1)*.65));mesh(bug,geo('swarm-shell',()=>new T.OctahedronGeometry(.42,1)),dark,0,.7,0);feet(bug,4,.63,.55);sphere(bug,0,.78,.32,.10,glow);animations.push((t,s)=>{bug.rotation.y=Math.sin((s.animDistance||0)/22*3+i)*.17;bug.position.y=s.moving?Math.sin(s.animDistance/22*11+i)*.035:0;});}core=null;
  }
 }else if(role==='cooler'||role==='cloud'){
  const cloud=role==='cloud';height=cloud?4.1:2.8;
  if(faction==='misanthropic'){
   for(const side of [-1,1]){shell(body,side*.95,.35,0,.66,.65,4.1,paper,.3);shell(body,side*.95,.69,0,.7,.06,3.5,accent,.1);}shell(body,0,.74,0,2.4,.28,2.8,paper,.22);
   if(cloud){for(const z of [-.65,.65]){const roof=group(body,0,1.9,z);cyl(roof,0,0,0,.83,1.95,paper,32);ring(roof,0,.87,0,.87,.09,accent,true);sphere(roof,0,1.05,0,.79,metal).scale.y=.35;for(let i=0;i<8;i++){const q=i*Math.PI/4;box(roof,Math.cos(q)*.835,0,Math.sin(q)*.835,.075,1.4,.075,dark);}}rod(body,[0,1,-1.6],[0,3.8,-1.6],.05);const sail=petal(group(body,0,2.65,-1.6),1.5,2.1);sail.rotation.y=.4;}
   else{for(const side of [-1,1]){cyl(body,side*.62,1.4,0,.46,1.1,paper,32);ring(body,side*.62,1.95,0,.5,.065,accent,true);propellers(body,side*.62,1.98,0,.35);tube(body,[[side*.62,1.8,-.6],[side*.62,1.8,1],[side*.62,.7,1.55]],.10,metal);}}
  }else if(faction==='closed'){
   shell(body,0,.4,0,2.3,.77,4.2,paper,.42);shell(body,0,.86,0,2,.17,3.4,accent,.12);if(cloud){for(const side of [-1,1]){shell(body,side*.58,1.8,-.1,1.05,1.85,2.1,paper,.1);box(body,side*.58,1.84,1,.78,1.5,.03,dark);for(let i=0;i<5;i++)box(body,side*.58,1.23+i*.3,1.03,.62,.055,.045,glow);}shell(body,0,2.82,-.1,2.35,.13,2.45,metal);propellers(body,0,2.94,-.6,.54);}
   else{shell(body,0,1.25,0,1.5,.63,2.3,paper,.2);const loop=ring(body,0,1.7,0,.62,.17,metal,true);for(const z of [-.75,.75]){shell(body,0,1.64,z,1.65,.12,.5,accent);propellers(body,0,1.73,z,.25);}tube(body,[[-.65,1,-1.25],[-.85,1.6,0],[-.65,1,1.25]],.075,metal);}shell(body,0,1.04,1.46,1,.3,.55,dark);
  }else{
   for(const side of [-1,1]){cyl(body,side*1.12,.25,0,.45,3.9,metal,32).rotation.x=Math.PI/2;ring(body,side*1.12,.25,1.75,.47,.07,dark);ring(body,side*1.12,.25,-1.75,.47,.07,dark);}box(body,0,.72,0,2.85,.22,3.25,dark);for(let i=0;i<9;i++)box(body,0,.85,(i-4)*.34,2.5,.035,.10,metal);
   if(cloud){for(const side of [-1,1]){rod(body,[side*1.3,.8,-1.3],[side*1.3,3.4,-1.3],.07);rod(body,[side*1.3,.8,1.3],[side*1.3,3.4,1.3],.07);rod(body,[side*1.3,.8,-1.3],[side*1.3,3.4,1.3],.045);rod(body,[side*1.3,3.4,-1.3],[side*1.3,3.4,1.3],.08);}for(const z of [-.72,.72])rack(body,0,1.96,z,1.55,2,.8);for(const x of [-.75,.75])propellers(body,x,3.12,0,.45);}
   else{for(const z of [-.7,.7]){cyl(body,0,1.48,z,.64,1.6,metal,32).rotation.z=Math.PI/2;fan(body,1,1.48,z,.57,metal,animations,'x',4.2);tube(body,[[-1,1.48,z],[-1.2,2,z],[-.4,2.1,z],[.4,1.7,z]],.10,accent);}}for(const side of [-1,1])rod(body,[side*1.33,.84,-1.5],[side*1.33,1.2,1.5],.035);
  }
  animations.push((t,s)=>{body.position.y=Math.sin(t*.9+(s.id||0))*.035;body.rotation.z=Math.sin(t*.65+(s.id||0))*.016;});
 }
 if(core)core.userData.dynamic=true;
 return {height,core};
}

export function buildFactionBuilding({faction,kind,root,animations,materials,kit}){
 const a=toolkit(kit,materials,animations),{T,box,cyl,sphere,tube,group,mesh,geo,fan,paper,accent,dark,metal,glow,moving,shell,ring,rod,vents,petal,rack}=a;
 root.userData.factionDesign=FACTION_DESIGN[faction].name;root.userData.assetRole=kind;
 if(kind==='lab'||kind==='annex'){
  const small=kind==='annex';const b=small?group(root):group(root,0,0,-3.6);if(small)b.scale.setScalar(.62);
  if(faction==='misanthropic'){
   cyl(b,0,.22,0,3.1,.44,paper,48);cyl(b,0,1.5,0,2.6,2.35,paper,48);cyl(b,0,2.7,0,2.95,.2,accent,48);sphere(b,0,2.65,0,2.45,materials.glass||metal).scale.y=.43;
   for(let i=0;i<12;i++){const q=i*Math.PI/6;box(b,Math.sin(q)*2.64,1.57,Math.cos(q)*2.64,.16,1.6,.16,metal);const arch=ring(b,Math.sin(q)*2.66,1.7,Math.cos(q)*2.66,.4,.065,paper);arch.rotation.y=q;box(b,Math.sin(q)*2.65,1.1,Math.cos(q)*2.65,.35,.9,.10,dark).rotation.y=q;}
   const shutters=moving(group(b,0,3.80,0));for(let i=0;i<5;i++){const q=i*Math.PI*2/5,o=petal(shutters,.65,1.6,accent);o.position.set(Math.cos(q)*.8,0,Math.sin(q)*.8);o.rotation.set(Math.PI/2,0,q);}animations.push(t=>shutters.rotation.y=Math.sin(t*.15)*.15);
  }else if(faction==='closed'){
   shell(b,0,.22,0,6,.44,5,paper,.14);shell(b,-.7,1.7,-.3,3.7,2.9,3.7,paper,.16);shell(b,1.3,2.15,.5,2.5,3.8,3.25,paper,.13);box(b,1.3,2.2,2.16,1.95,2.6,.055,dark);for(let i=0;i<4;i++)box(b,1.3,1.2+i*.66,2.2,1.6,.085,.04,glow);shell(b,1.3,4.1,.5,2.7,.18,3.5,accent);const slide=moving(group(b,-.65,2,1.64));shell(slide,0,0,0,2.5,1.7,.14,accent);animations.push(t=>slide.position.x=-.65+Math.sin(t*.18)*.1);vents(b,-.7,1.2,-2.2,2.7,1.1,12);
  }else{
   box(b,0,.2,0,6,.4,5,dark);for(const x of [-2.5,2.5])for(const z of [-2,2]){rod(b,[x,.4,z],[x,4.6,z],.12);rod(b,[x,.4,z],[x,4.6,-z],.06);}for(const x of [-1.3,0,1.3])rack(b,x,1.8,0,1.05,2.9,3.1);for(const z of [-1.7,1.7])rod(b,[-2.7,4.5,z],[2.7,4.5,z],.13);for(const x of [-1.35,1.35])fan(b,x,3.7,1.67,.75,metal,animations,'z',2);tube(b,[[-2.7,.5,-1.8],[-2.7,3.5,-1.8],[2.7,3.5,-1.8],[2.7,.5,-1.8]],.16,accent);box(b,0,4.65,0,5.8,.1,4.5,metal);
  }
 }else if(kind==='grid'){
  if(faction==='misanthropic'){
   for(let i=0;i<7;i++){const q=(i-3)*.38,heliostat=moving(group(root,Math.sin(q)*5,.6,-2.5-Math.cos(q)*2));cyl(heliostat,0,.5,0,.075,1,metal,12);const plate=petal(group(heliostat,0,1.2,0),1.6,2.3,metal);plate.rotation.x=-Math.PI/2+.3;animations.push(t=>heliostat.rotation.y=q+Math.sin(t*.06)*.08);}for(const side of [-1,1]){cyl(root,side*3.5,1.05,1.5,.72,2,paper,32);ring(root,side*3.5,2.08,1.5,.78,.08,accent,true);}cyl(root,0,1.6,-3,.6,3.2,paper,32);sphere(root,0,3.25,-3,.48,glow);
  }else if(faction==='closed'){
   for(const x of [-3.6,0,3.6]){shell(root,x,1.35,-2,2.25,2.7,2.5,paper);shell(root,x,2.85,-2,2.7,.25,2.95,accent);box(root,x,1.6,-.71,1.5,.2,.04,glow);vents(root,x,.8,-.7,1.7,.8);const roof=moving(box(root,x,3.05,-2,2.55,.10,2.65,metal));roof.rotation.x=-.12;animations.push(t=>roof.rotation.x=-.12+Math.sin(t*.06)*.025);}for(const x of [-1.2,1.2])shell(root,x,.7,1.3,1.85,1.3,1.3,paper);tube(root,[[-4,.25,1.7],[-4,.6,2],[4,.6,2],[4,.25,1.7]],.09,accent);
  }else{
   for(const x of [-3.4,0,3.4]){box(root,x,.3,-2,2.8,.6,3.2,dark);for(const side of [-1,1])rod(root,[x+side*1.2,.5,-2],[x+side*1.2,3.8,-2],.12);const rotor=moving(group(root,x,2.1,-2));ring(rotor,0,0,0,1.3,.17,metal);cyl(rotor,0,0,0,.45,.75,accent,24).rotation.x=Math.PI/2;for(let i=0;i<8;i++){const q=i*Math.PI/4;rod(rotor,[0,0,0],[Math.cos(q)*1.2,Math.sin(q)*1.2,0],.08);shell(rotor,Math.cos(q)*1.2,Math.sin(q)*1.2,0,.38,.48,.65,dark,.06).rotation.z=q;}animations.push(t=>rotor.rotation.z=t*.65);}tube(root,[[-5,.7,1],[-5,1.4,1],[5,1.4,1],[5,.7,1]],.15,metal);
  }
 }else if(kind==='gate'){
  if(faction==='misanthropic'){
   cyl(root,0,.15,-2,3.3,.3,paper,48);const arch=ring(root,0,2.5,-2,2.2,.32,paper);arch.scale.x=1.13;ring(root,0,2.5,-2,1.9,.10,accent);for(const x of [-2.3,2.3])cyl(root,x,1.1,-2,.39,2.1,paper,24);const iris=moving(group(root,0,2.5,-2));for(let i=0;i<5;i++){const q=i*Math.PI*2/5,o=petal(iris,.5,1.2,accent);o.position.set(Math.cos(q)*1.9,Math.sin(q)*1.9,0);o.rotation.z=q-Math.PI/2;}animations.push(t=>iris.rotation.z=Math.sin(t*.2)*.10);
  }else if(faction==='closed'){
   shell(root,0,.18,-2,5.7,.36,2.7,paper);for(const side of [-1,1]){const p=group(root,side*1.85,2.3,-2);shell(p,0,0,0,.8,4.4,1.6,paper);p.rotation.z=-side*.14;box(p,side*.43,0,0,.06,3.5,1.2,glow);}shell(root,0,4.55,-2,4.7,.47,1.9,accent);for(const side of [-1,1]){const slide=moving(group(root,side*.8,4.6,-2));shell(slide,0,0,0,.7,.25,2.1,metal);animations.push(t=>slide.position.x=side*(.8+Math.sin(t*.3)*.06));}
  }else{
   box(root,0,.2,-2,6.3,.4,3.2,dark);for(const side of [-1,1]){for(const z of [-3,-1])rod(root,[side*2.5,.4,z],[side*2.5,5,z],.12);rod(root,[side*2.5,.4,-3],[side*2.5,5,-1],.075);fan(root,side*2.55,2.65,-2,.95,metal,animations,'x',1.3);}for(const z of [-3,-1])rod(root,[-2.7,5,z],[2.7,5,z],.13);for(let i=0;i<5;i++){box(root,(i-2)*.9,4.85,-2,.6,.36,1.3,metal);box(root,(i-2)*.9,4.62,-1.28,.28,.07,.05,glow);}tube(root,[[-2.8,.6,-3],[-2.8,5.3,-3],[2.8,5.3,-3],[2.8,.6,-3]],.11,accent);
  }
 }else if(kind==='intake'){
  if(faction==='misanthropic'){
   cyl(root,0,.25,0,3,.5,paper,48);for(const side of [-1,1]){cyl(root,side*1.35,1.3,0,1,2.1,paper,40);ring(root,side*1.35,2.35,0,1.03,.12,accent,true);fan(root,side*1.35,2.39,0,.84,metal,animations,'y',1.3);tube(root,[[side*1.35,1,1],[side*1.35,.3,2.5],[side*1.35,-.3,3.8]],.18,metal);}
  }else if(faction==='closed'){
   shell(root,0,.25,0,5.9,.5,4.2,paper);for(const x of [-1.65,1.65]){shell(root,x,1.45,0,1.85,2.4,2.8,paper);shell(root,x,2.72,0,2.1,.15,3,accent);for(const z of [-.75,.75])fan(root,x,2.82,z,.58,metal,animations,'y',1.6);}tube(root,[[-2.6,.5,2.4],[-2.6,2,2.4],[2.6,2,2.4],[2.6,.5,2.4]],.17,metal);
  }else{
   box(root,0,.2,0,6.2,.4,4.3,dark);for(const x of [-1.7,1.7]){cyl(root,x,1.6,0,1.08,2.8,metal,40).rotation.x=Math.PI/2;fan(root,x,1.6,1.48,.95,metal,animations,'z',2.2);for(const side of [-1,1])rod(root,[x+side*.95,.4,-1.7],[x+side*.95,2.9,-1.7],.08);tube(root,[[x,1.6,-1.6],[x,2.5,-2.1],[x,2.5,-2.8],[x,.2,-2.8]],.2,accent);}rod(root,[-3,3,-1.7],[3,3,-1.7],.1);
  }
 }else if(kind==='dock'){
  if(faction==='misanthropic'){cyl(root,0,0,-1.8,3.7,.35,paper,48);for(const side of [-1,1]){shell(root,side*2.3,.08,1,1.1,.3,6.4,paper,.35);for(const z of [-1,2.8])cyl(root,side*2.3,-.5,z,.2,1.4,metal,12);ring(root,side*2.3,.3,3.8,.25,.05,accent,true);}}
  else if(faction==='closed'){shell(root,0,.05,-1.5,7,.45,2.1,paper);for(const x of [-2.5,0,2.5]){shell(root,x,.05,1.3,1.3,.3,5.7,paper);box(root,x,.24,1.3,.8,.025,4.5,accent);shell(root,x,.8,-1.4,1.4,1.5,1.6,paper);}rod(root,[-3.4,.48,-2.3],[3.4,.48,-2.3],.055,metal);}
  else{for(const x of [-2.6,0,2.6]){box(root,x,0,.5,1.3,.28,6.5,dark);for(let i=0;i<13;i++)box(root,x,.18,-2.4+i*.5,1.35,.05,.15,metal);for(const side of [-1,1]){rod(root,[x+side*.55,.22,-2.6],[x+side*.55,.22,3.6],.045);for(const z of [-2,2.8])rod(root,[x+side*.55,-1.2,z],[x+side*.55,.6,z],.1);}}box(root,0,.05,-2.7,7.1,.3,1.25,metal);}
 }
 return root;
}

// Gear shares the paid human's skeleton, rather than floating over its motion.
// Attach at the neutral pose; the bone owns all subsequent articulation.
export function outfitFactionPerson({faction,role,body,human,materials,kit,animations}){
 const a=toolkit(kit,materials,animations),{T,box,cyl,sphere,tube,group,paper,accent,dark,metal,glow,moving,shell,ring,rod,petal}=a;
 const chest=group(body),head=group(body);chest.userData.factionDesign=FACTION_DESIGN[faction].name;
 if(faction==='misanthropic'){
  for(const side of [-1,1]){const shoulder=petal(group(chest,side*.35,2.02,-.2),.42,.85,role==='agent'?accent:paper);shoulder.rotation.set(.2,0,-side*.35);shell(chest,side*.29,1.5,-.29,.25,.8,.24,paper,.12);ring(chest,side*.3,1.88,-.3,.14,.03,metal,true);}shell(chest,0,1.64,-.43,.59,.65,.24,accent,.15);shell(head,0,2.65,-.04,.46,.08,.38,paper,.12);if(role==='agent'){const hood=sphere(head,0,2.45,-.12,.36,paper);hood.scale.set(1,1.06,.75);box(head,0,2.4,.30,.49,.13,.06,accent);}
 }else if(faction==='closed'){
  shell(chest,0,1.7,-.41,.63,1.0,.38,paper,.08);box(chest,0,1.7,-.62,.43,.7,.055,accent);for(const side of [-1,1])shell(chest,side*.32,1.96,-.03,.25,.24,.4,paper,.07);shell(head,0,2.53,.12,.45,.22,.35,paper,.09);box(head,0,2.52,.31,.35,.12,.04,dark);if(role==='agent'){shell(chest,0,1.45,.34,.59,.55,.22,accent,.06);for(const side of [-1,1])box(chest,side*.5,1.1,0,.16,.55,.20,metal);}
 }else{
  for(const side of [-1,1]){cyl(chest,side*.39,1.65,-.34,.14,.94,metal,24);ring(chest,side*.39,2.05,-.34,.16,.025,dark,true);rod(chest,[side*.43,1.04,-.15],[side*.56,2.18,-.16],.055);shell(chest,side*.43,2.07,-.05,.25,.17,.4,dark,.06);}rackGear();sphere(head,0,2.65,0,.24,metal).scale.set(1,.35,1);box(head,0,2.54,.26,.39,.10,.05,dark);if(role==='agent'){rod(chest,[.4,1.7,-.4],[.4,3.18,-.4],.03);sphere(chest,.4,3.18,-.4,.085,glow);}
 }
 function rackGear(){shell(chest,0,1.62,-.48,.55,.65,.23,dark,.06);for(let i=0;i<4;i++)box(chest,0,1.4+i*.14,-.61,.4,.035,.025,metal);}
 if(human){
  body.updateMatrixWorld(true);let spine=null,skull=null;human.traverse(o=>{if(o.isBone&&/(?:Spine0?2|Spine_?0?3|chest|UpperChest)$/i.test(o.name))spine=o;if(o.isBone&&/(?:Head)$/i.test(o.name))skull=o;});
  const inverseBody=new T.Matrix4().copy(body.matrixWorld).invert();
  const anchor=(part,bone,y)=>{if(!bone)return;const position=new T.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inverseBody);part.position.set(position.x,position.y-y,position.z);part.updateMatrixWorld(true);};anchor(chest,spine,1.85);anchor(head,skull,2.42);
  const bind=(part,bone)=>{if(!bone)return;const transform=new T.Matrix4().copy(bone.matrixWorld).invert().multiply(part.matrixWorld);bone.add(part);transform.decompose(part.position,part.quaternion,part.scale);part.userData.dynamic=true;};
  bind(chest,spine);bind(head,skull);
 }
 return {chest,head};
}
