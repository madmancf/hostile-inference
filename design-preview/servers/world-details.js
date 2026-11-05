// The district kit is built as geometry so it receives the same light and depth as the actors.
export function decorateWorld({T, root, server, nodes, outline, animations, base, factionBuilding, box, cyl, torus, tube, group, mesh, mat, geo, fan, inside, lineDistance, edges}) {
  const ivory = mat(server === 'broke' ? '#424c50' : '#e9e0ca', .12, .48);
  const metal = mat('#879c99', .82, .25);
  const trim = mat(server === 'misanthropic' ? '#bd6848' : server === 'closed' ? '#1d6b59' : '#707c80', .4, .35);
  const dark = mat('#243e3e', .35, .35);
  const roof = mat(server === 'broke' ? '#2d373f' : '#b4bbaa', .2, .64);
  const concrete = mat('#b9b29a', .02, .93);
  const light = mat(server === 'broke' ? '#bf5a4c' : '#9bbfba', .18, .2, server === 'broke' ? '#bf5a4c' : '#9bbfba');

  function hall(x, z, w=3.2, d=4.5, h=1.65) {
    const g = group(root, x, base, z);
    if(factionBuilding){factionBuilding(g);return g;}
    box(g, 0, .12, 0, w+.5, .24, d+.5, concrete);
    box(g, 0, h/2, 0, w, h, d, ivory);
    box(g, 0, h+.1, 0, w+.24, .25, d+.24, roof);
    for (const side of [-1,1]) {
      box(g, side*(w/2+.02), h*.57, 0, .05, h*.46, d-.6, dark);
      for (let k=0;k<6;k++) box(g, side*(w/2+.06), h*.57, (k-2.5)*(d-.6)/6, .12, h*.54, .075, ivory);
    }
    for (let k=0;k<3;k++) {
      box(g, 0, h+.4, (k-1)*d*.25, w*.55, .42, d*.2, metal);
      for(let q=0;q<7;q++) box(g, (q-3)*w*.064, h+.625, (k-1)*d*.25, .03, .025, d*.2, dark);
    }
    tube(g, [[-w*.35,h+.25,-d*.6],[-w*.35,h+.65,-d*.6],[-w*.35,h+.65,d*.6],[-w*.35,.3,d*.6]], .1, trim);
    box(g, 0, .6, d/2+.02, .8, 1.1, .08, dark);
    box(g, 0, 1.22, d/2+.08, 1.0, .14, .18, trim);
    return g;
  }

  const c=nodes.campus;
  const cluster=server==='misanthropic' ? [[-8,-6,3.0,5.0],[8,-4,3.2,4.4],[-8,-12,3.0,3.2]] : server==='closed' ? [[-9,-7,3.6,5.0],[9,-7,3.6,5.0],[9,-1,3.6,3.2],[-9,-1,3.6,3.2]] : [[-9,-7,3.4,7],[9,-7,3.4,7],[-10,-1,3,4.0]];
  for(const [x,z,w,d] of cluster) if(inside({x:c.x+x,y:c.y+z},outline)) hall(c.x+x,c.y+z,w,d,server==='broke'?2.0:1.7);
  const l=nodes.lab;
  for(const side of [-1,1]) if(inside({x:l.x+side*5,y:l.y-4},outline)) hall(l.x+side*5,l.y-4,2.1,3.4,1.2);

  // Resource-processing hardware gives every district a physical job.
  const p=nodes.grid;
  for(let i=0;i<4;i++) {
    const x=p.x+(i-1.5)*1.6,z=p.y+3.2;
    box(root,x,base+.6,z,1.2,1.2,.9,ivory);
    box(root,x,base+1.22,z,1.35,.12,1.05,trim);
    for(let k=0;k<6;k++) box(root,x-.45+k*.18,base+.65,z+.46,.045,.7,.05,dark);
    for(const side of [-1,1]) cyl(root,x+side*.34,base+1.65,z,.09,.7,metal,8);
  }
  tube(root,[[p.x-3,base+.3,p.y+3.2],[p.x-3,base+.6,p.y+4.1],[p.x+3,base+.6,p.y+4.1],[p.x+3,base+.3,p.y+3.2]],.11,trim);

  // Service pipes, inlaid cable conduits, lamps and guardrail details follow real routes.
  for(const [a,b] of edges) {
    const p=nodes[a],q=nodes[b],dx=q.x-p.x,dz=q.y-p.y,len=Math.hypot(dx,dz);
    const route=group(root,(p.x+q.x)/2,base+.15,(p.y+q.y)/2);
    route.rotation.y=Math.atan2(dx,dz);
    for(const side of [-1,1]) {
      box(route,side*1.15,.16,0,.19,.16,len,concrete);
      box(route,side*1.15,.25,0,.04,.055,len,trim);
      for(let z=-len/2+.9;z<len/2;z+=3) {
        box(route,side*1.14,.52,z,.10,.64,.10,metal);
        box(route,side*1.14,.86,z,.26,.13,.26,ivory);
        box(route,side*1.14,.9,z,.20,.045,.20,light);
      }
    }
  }

  // Small planted terraces add density without covering the traversable routes.
  let seed=server==='misanthropic'?398:server==='closed'?817:129;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const leaves=mat(server==='broke'?'#767f6c':'#4d7145',0,.94);
  const pine=geo('district-cypress',()=>new T.SphereGeometry(.43,12,8));
  for(let i=0;i<200;i++) {
    const p={x:random()*70-35,y:random()*42-21};
    if(!inside(p,outline)||server==='broke'&&p.x>-9&&p.x<-2||server==='misanthropic'&&p.x>-5.7&&p.x<-1.3&&p.y>-6.5&&p.y<7.5)continue;
    if(Object.entries(nodes).some(([id,q])=>Math.hypot(p.x-q.x,p.y-q.y)<(id==='campus'?14:id==='lab'||id==='grid'?8:3)))continue;
    if(edges.some(([a,b])=>lineDistance(p,nodes[a],nodes[b])<2))continue;
    const shrub=mesh(root,pine,leaves,p.x,base+.32,p.y);shrub.scale.set(1,.7,1);
    if(i%5===0){box(root,p.x,base+.07,p.y,1.55,.14,1.55,concrete);const crown=mesh(root,pine,leaves,p.x,base+1.18,p.y);crown.scale.set(.6,2.4,.6);}
  }

  // A working cable harbour crane; the gantry is anchored and only its jib turns.
  const g=nodes.gate, crane=group(root,g.x-4,base,g.y-3);
  box(crane,0,.25,0,2,.5,2,concrete);box(crane,0,2.5,0,.45,4.6,.45,metal);
  const jib=group(crane,0,4.7,0);jib.userData.dynamic=true;
  box(jib,1.5,0,0,4.5,.25,.35,trim);tube(jib,[[0,1,0],[0,.2,0],[3.4,.2,0]],.035,metal);
  cyl(jib,3.4,-.7,0,.025,1.5,metal,6);box(jib,3.4,-1.5,0,.35,.35,.35,dark);
  animations.push(t=>jib.rotation.y=Math.sin(t*.11)*.18-.5);

  if(server==='misanthropic') {
    // Inset water gardens and raised planter masonry around the archive court.
    for(const [x,z] of [[l.x-4,l.y+4],[c.x-9,c.y-5]]) {
      box(root,x,base+.11,z,2.8,.22,2.3,ivory);
      box(root,x,base+.24,z,2.4,.04,1.9,mat('#438e89',.55,.16));
      for(const side of [-1,1]) tube(root,[[x+side*1.2,base+.4,z-.7],[x+side*1.2,base+.9,z-.7],[x+side*1.2,base+.9,z+.7]],.06,trim);
    }
  } else if(server==='closed') {
    for(const [x,z] of [[c.x-6.5,c.y+2],[c.x+6.5,c.y+2]]) {
      box(root,x,base+.1,z,1.3,.2,8,ivory);
      box(root,x,base+.23,z,.9,.035,7.5,mat('#226e68',.65,.12));
      for(let k=0;k<4;k++) box(root,x,base+.28,z-3+k*2,.9,.03,.06,metal);
    }
  } else {
    for(const [x,z] of [[c.x-8,c.y+3],[l.x+5,l.y+3]]) {
      const frame=group(root,x,base,z);
      for(const side of [-1,1])box(frame,side*1.2,1.2,0,.2,2.4,.2,metal);
      box(frame,0,2.35,0,2.6,.2,.2,metal);
      for(let k=0;k<8;k++)box(frame,-.9+k*.26,1.45,0,.13,1.55,.38,dark);
      box(frame,0,2.5,0,2.8,.05,.5,trim);
    }
  }
}

export function groundMaterial(T,material) {
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 terrainPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nterrainPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 terrainPosition;
float hashGround(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashGround(i),hashGround(i+vec2(1,0)),f.x),mix(hashGround(i+vec2(0,1)),hashGround(i+vec2(1,1)),f.x),f.y);}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float broad=groundNoise(terrainPosition.xz*.20)*.65+groundNoise(terrainPosition.xz*.70)*.25+groundNoise(terrainPosition.xz*4.0)*.1;
diffuseColor.rgb*=.72+broad*.54;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.15,1.06,.87),smoothstep(.61,.83,broad)*.45);`);
  };
  material.customProgramCacheKey=()=> 'landscape-granular-v1';
  return material;
}
