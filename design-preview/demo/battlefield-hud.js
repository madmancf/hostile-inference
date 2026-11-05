// Battlefield labels are intentionally sparse. Ownership and health carry the
// fight; individual names belong to selection, tutorials and hover inspection.
export function unitCallouts(units, selected, lessonRole = null) {
  const friendly=units.filter(u=>u.team==='player'&&!u.transit);
  if(lessonRole){const unit=friendly.find(u=>u.role===lessonRole&&selected.has(u.id))||friendly.find(u=>u.role===lessonRole);return unit?[unit]:[];}
  if(selected.size!==1)return [];
  const unit=friendly.find(u=>selected.has(u.id));return unit?[unit]:[];
}
export function buildingHealth(server, {attacked=false, inspected=false}={}) {
  if(!server||!Number.isFinite(server.integrity)||!Number.isFinite(server.maxIntegrity)||server.maxIntegrity<=0)return null;
  const hp=Math.max(0,Math.min(server.maxIntegrity,server.integrity)),maxHp=server.maxIntegrity,ratio=hp/maxHp;
  if(hp===maxHp&&!attacked&&!inspected)return null;
  return {hp,maxHp,ratio,attacked,tone:ratio>.5?'#a8d5a6':ratio>.25?'#edc878':'#ef846c'};
}
export function placeBuildingHealth(anchor, viewport) {
  const width=240,height=57,gap=8,blocked=viewport.blocked||[];
  const clamp=(x,y)=>({x:Math.max(gap,Math.min(viewport.width-width-gap,x)),y:Math.max(gap,Math.min(viewport.height-height-gap,y)),width,height});
  const preferred=clamp(anchor.x-width/2,anchor.y-height),candidates=[preferred,clamp(preferred.x,anchor.y+gap)];
  for(const b of blocked)candidates.push(clamp(preferred.x,b.y+b.height+gap),clamp(preferred.x,b.y-height-gap),clamp(b.x-width-gap,preferred.y),clamp(b.x+b.width+gap,preferred.y));
  const score=r=>blocked.reduce((sum,b)=>sum+Math.max(0,Math.min(r.x+width,b.x+b.width+gap)-Math.max(r.x,b.x-gap))*Math.max(0,Math.min(r.y+height,b.y+b.height+gap)-Math.max(r.y,b.y-gap)),0)*1e6+Math.hypot(r.x-preferred.x,r.y-preferred.y);
  return candidates.reduce((best,r)=>score(r)<score(best)?r:best,preferred);
}
export function drawBuildingHealth(ctx, name, health, anchor, viewport) {
  const box=placeBuildingHealth(anchor,viewport),w=box.width,h=box.height;
  ctx.save();ctx.translate(box.x,box.y);ctx.fillStyle='#20352ff2';ctx.fillRect(0,0,w,h);ctx.strokeStyle=health.attacked?'#ed957c':'#b8c9b0';ctx.lineWidth=1;ctx.strokeRect(.5,.5,w-1,h-1);
  ctx.font='14px Arial,Helvetica,sans-serif';ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillStyle='#f6f2e9';ctx.fillText(name,12,18);
  ctx.textAlign='right';ctx.fillStyle=health.tone;ctx.fillText(Math.ceil(health.ratio*100)+'%',w-12,18);
  ctx.fillStyle='#526359';ctx.fillRect(12,25,w-24,6);ctx.fillStyle=health.tone;ctx.fillRect(12,25,(w-24)*health.ratio,6);
  ctx.textAlign='left';ctx.fillStyle=health.attacked?'#f5a68c':'#c4d0c0';ctx.fillText(health.hp<=0?'OFFLINE':health.attacked?'UNDER ATTACK':'INTEGRITY',12,48);
  ctx.textAlign='right';ctx.fillStyle='#f6f2e9';ctx.fillText(Math.ceil(health.hp).toLocaleString('en-US')+' / '+Math.ceil(health.maxHp).toLocaleString('en-US'),w-12,48);ctx.restore();return box;
}
