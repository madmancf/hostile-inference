// Nine authored structures. Shared opaque materials preserve native batching;
// construction, damage and research change prebuilt meshes, never allocate in combat.
export function buildResearchFacility({faction,index,root,materials:m,kit:k}){
 const {T,group,box,cyl,sphere,torus,tube,fan,mesh,geo}=k,{paper,accent,dark,metal,glow}=m,animations=[];
 const moving=o=>{o.userData.dynamic=true;return o;};
 const base=group(root),body=moving(group(root)),scaffold=moving(group(root)),ruin=moving(group(root)),tier=moving(group(root));
 box(base,0,.15,0,7.8,.3,7.3,paper);for(const x of [-3.6,3.6])for(const z of [-3.3,3.3])box(base,x,.4,z,.25,.4,.25,accent);
 for(const x of [-3.5,3.5])for(const z of [-3.2,3.2]){box(scaffold,x,2.6,z,.09,5,.09,metal);box(scaffold,0,5.1,z,7,.09,.09,metal);}
 const crane=moving(group(scaffold,0,5.3,0));box(crane,0,0,0,7,.12,.2,metal);box(crane,2,-1.2,0,.06,2.4,.06,metal);animations.push(t=>crane.rotation.y=t*.18);
 for(let i=0;i<7;i++){const rubble=box(ruin,Math.cos(i*2.4)*2.5,.4,Math.sin(i*2.4)*2.1,1+i%2,.45+i%3*.2,1.2,dark);rubble.rotation.y=i*.71;rubble.rotation.z=(i%3-1)*.2;}
 const crown=moving(group(tier,0,6.5,0));
 if(faction==='misanthropic'){
  cyl(body,0,.4,0,3.45,.6,paper,48);
  if(index===0){
   cyl(body,0,1.6,0,2.8,2.3,paper,48);cyl(body,0,2.9,0,3.2,.25,accent,48);sphere(body,0,3,0,2.7,glow).scale.y=.5;
   for(let i=0;i<12;i++){const q=i*Math.PI/6;const arch=torus(body,Math.cos(q)*2.85,1.8,Math.sin(q)*2.85,.52,.10,paper);arch.rotation.y=Math.PI/2-q;box(body,Math.cos(q)*2.9,1.1,Math.sin(q)*2.9,.2,1.9,.2,metal);}
   const petals=moving(group(body,0,4,0));for(let i=0;i<6;i++){const q=i*Math.PI/3,o=box(petals,Math.cos(q)*1.65,0,Math.sin(q)*1.65,.65,.18,1.8,accent);o.rotation.y=-q;}animations.push(t=>petals.rotation.y=t*.09);
  }else if(index===1){
   for(let i=0;i<4;i++){cyl(body,0,1+i*1.15,0,2.7-i*.45,.8,paper,40);cyl(body,0,1.5+i*1.15,0,2.9-i*.45,.15,accent,40);}
   const lens=moving(mesh(body,geo('audit-lens',()=>new T.OctahedronGeometry(.75)),glow,0,5.9,0));animations.push(t=>lens.rotation.y=t*.35);
   for(const x of [-2.7,2.7])tube(body,[[x,.5,0],[x,3,0],[x*.4,4.5,0],[0,5,0]],.12,metal);
  }else{
   for(const x of [-1.65,1.65]){cyl(body,x,2,0,1.25,3.5,paper,40);torus(body,x,3.7,0,1.3,.15,accent).rotation.x=Math.PI/2;fan(body,x,3.9,0,1.05,metal,animations,'y',1.2);tube(body,[[x,1,1.3],[x,.6,2.7],[0,.6,2.7]],.17,metal);}
   box(body,0,1,-2.4,4.8,1.8,1.1,paper);for(let i=0;i<8;i++)box(body,-2+i*.57,1.1,-3,.23,1.15,.07,dark);
  }
  const ring=torus(crown,0,0,0,1.1,.09,accent);ring.rotation.x=Math.PI/2;sphere(crown,0,0,0,.3,glow);
 }else if(faction==='closed'){
  if(index===0){
   for(const x of [-2.4,2.4]){box(body,x,2.8,0,1.25,5.2,2.6,paper);box(body,x,3,1.33,.7,3.7,.08,glow);}box(body,0,5.4,0,6.2,.6,3,paper);box(body,0,.7,0,5.5,.5,3.8,accent);
   const iris=moving(group(body,0,2.7,0));for(const z of [-.5,.5]){const ring=torus(iris,0,0,z,1.6,.12,metal);ring.scale.y=.8;}animations.push(t=>iris.rotation.z=t*.2);
  }else if(index===1){
   for(let i=0;i<3;i++){box(body,-.9+i*.9,1.1+i*1.3,-.8+i*.5,4.8-i,1.8,4.2-i*.6,paper);box(body,-.9+i*.9,2.1+i*1.3,-.8+i*.5,5-i,.17,4.4-i*.6,accent);for(let n=0;n<5;n++)box(body,-2.5+n*.7+i*.6,1.1+i*1.3,1.34+i*.2,.34,.75,.06,dark);}
   const seal=moving(group(body,1,5.3,.2));box(seal,0,0,0,1.3,.15,1.3,metal);animations.push(t=>seal.rotation.y=t*.12);
  }else{
   for(const x of [-1.65,1.65])for(const z of [-1.6,1.6]){box(body,x,2,z,2.6,3.5,2.45,paper);box(body,x,3.9,z,2.75,.3,2.6,accent);fan(body,x,4.1,z,.75,metal,animations,'y',1.6);box(body,x,2,z+1.25,1.7,2.3,.06,dark);for(let i=0;i<4;i++)box(body,x,1+i*.6,z+1.3,1.25,.055,.07,glow);}box(body,0,4.9,0,4.8,.25,1,metal);
  }
  for(const x of [-.7,.7])box(crown,x,0,0,.16,1.4,1.2,accent);box(crown,0,.7,0,1.5,.16,1.2,accent);
 }else{
  if(index===0){
   for(const x of [-2.5,2.5]){box(body,x,2.4,0,.2,4.4,5.3,metal);for(const z of [-2.6,2.6])box(body,x,2.7,z,.28,5,.28,dark);}box(body,0,5.1,0,5.5,.25,5.5,metal);
   for(const x of [-1.4,0,1.4]){box(body,x,1.4,0,1.05,2.25,4,dark);for(let i=0;i<7;i++)box(body,x,.55+i*.28,2.1,.8,.07,.2,metal);fan(body,x,3.2,1.8,.6,metal,animations,'z',2.6);}
   const arm=moving(group(body,-2,4.4,0));box(arm,1,0,0,2.5,.2,.2,accent);box(arm,2,-.6,0,.2,1.4,.2,metal);animations.push(t=>arm.rotation.y=Math.sin(t*.7)*.55);
  }else if(index===1){
   cyl(body,0,2.3,0,2,4,metal,12);for(let i=0;i<4;i++){const q=i*Math.PI/2;box(body,Math.cos(q)*2.6,1.2,Math.sin(q)*2.6,1.1,2.1,1.1,dark);tube(body,[[Math.cos(q)*2.6,1.2,Math.sin(q)*2.6],[Math.cos(q)*2.6,4.4,Math.sin(q)*2.6],[0,4.4,0]],.15,accent);}
   const flywheel=moving(group(body,0,4.7,0));torus(flywheel,0,0,0,1.65,.2,metal).rotation.x=Math.PI/2;for(let i=0;i<8;i++){const q=i*Math.PI/4,o=box(flywheel,Math.cos(q),0,Math.sin(q),1.8,.1,.17,accent);o.rotation.y=-q;}animations.push(t=>flywheel.rotation.y=t*.8);
  }else{
   for(const x of [-1.6,1.6]){cyl(body,x,2.5,0,1.3,4.3,metal,24);fan(body,x,4.8,0,1.1,metal,animations,'y',2.2);for(let i=0;i<6;i++)torus(body,x,.6+i*.7,0,1.34,.065,dark).rotation.x=Math.PI/2;tube(body,[[x,1.1,1.2],[x,.7,2.8],[0,.7,2.8]],.22,accent);}box(body,0,2.7,-2.2,5,.25,.6,metal);
  }
  const a=box(crown,0,0,0,2,.22,.22,metal);a.rotation.z=Math.PI/4;const b=box(crown,0,0,0,2,.22,.22,accent);b.rotation.z=-Math.PI/4;
 }
 animations.push(t=>crown.rotation.y=t*.16);
 return {body,scaffold,ruin,tier,animations,clock:0,lastPhase:null};
}
