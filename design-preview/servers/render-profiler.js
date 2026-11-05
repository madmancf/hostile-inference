// Optional diagnostics. Timer results are read asynchronously; no gl.finish().
import { SkinnedMesh, Box3, Skeleton, BufferGeometry } from '../vendor/three/three.module.js';
export class RenderProfiler {
 constructor(renderer,{detail=new URL(globalThis.location?.href||'http://localhost').searchParams.has('detail')}={}){
  this.gl=renderer.getContext();this.ext=this.gl.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.gpu={};this.cpu={};this.frame=0;this.commands={};this.originals=[];this.passOriginals=[];this.gpuRecords=[];this.context={};this.disposed=false;this.disjointEpoch=0;
  if(detail)for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','clear','blitFramebuffer','invalidateFramebuffer','readPixels','generateMipmap','getError','getQueryParameter','copyTexSubImage2D','drawBuffers','viewport','scissor','finish','flush','fenceSync','clientWaitSync','deleteQuery','texSubImage2D','texImage2D','bufferSubData','bufferData','getProgramParameter','getShaderParameter','compileShader','linkProgram','checkFramebufferStatus','getParameter','bindFramebuffer','useProgram','uniform1f','uniform1i','uniform2f','uniform3f','uniform4f','uniform3fv','uniformMatrix3fv','uniformMatrix4fv','vertexAttribPointer','bindTexture','enable','disable','pixelStorei','getUniformLocation','getActiveUniform','getVertexAttrib','getActiveAttrib','bindBuffer','vertexAttribDivisor','activeTexture']){if(typeof this.gl[name]!=='function')continue;const original=this.gl[name];this.originals.push([this.gl,name,original]);this.gl[name]=(...args)=>{const start=performance.now();try{return original.apply(this.gl,args);}finally{const stat=this.commands[name]||(this.commands[name]={calls:0,ms:0,maxMs:0});const ms=performance.now()-start;stat.calls++;stat.ms+=ms;stat.maxMs=Math.max(stat.maxMs,ms);}};}
  if(detail){const multi=this.gl.getExtension('WEBGL_multi_draw');if(multi)for(const name of ['multiDrawElementsWEBGL','multiDrawArraysWEBGL']){if(typeof multi[name]!=='function')continue;const original=multi[name];this.originals.push([multi,name,original]);multi[name]=(...args)=>{const start=performance.now();try{return original.apply(multi,args);}finally{const stat=this.commands[name]||(this.commands[name]={calls:0,ms:0});stat.calls++;stat.ms+=performance.now()-start;}};}}
  this.cpuOps={};this.cpuOriginals=[];if(detail)for(const [prototype,names]of [[SkinnedMesh.prototype,['computeBoundingSphere','computeBoundingBox']],[Box3.prototype,['setFromObject']],[Skeleton.prototype,['update']],[BufferGeometry.prototype,['computeBoundingSphere','computeBoundingBox']]])for(const name of names){const original=prototype[name],owner=this,key=prototype.constructor.name+'.'+name;this.cpuOriginals.push([prototype,name,original]);prototype[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const stat=owner.cpuOps[key]||(owner.cpuOps[key]={calls:0,ms:0,maxMs:0});const ms=performance.now()-start;stat.calls++;stat.ms+=ms;stat.maxMs=Math.max(stat.maxMs,ms);}};}
 }
 attach(pass,name){
  const render=pass.render;
  this.passOriginals.push([pass,render]);
  pass.render=(...args)=>{const start=performance.now();let query=null;
   if(this.ext&&this.sample&&this.pending.length<128){query=this.gl.createQuery();this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,query);}
   try{return render.apply(pass,args);}finally{const end=performance.now();if(query){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push({name,query,frameId:this.frame,issuedAt:start,...this.context});}this.cpu[name]=end-start;const label=`hi-pass/${this.frame}/${name}`;performance.measure(label,{start,end});performance.clearMeasures(label);}
  };
 }
 beginFrame(context={}){
  // Resolve older queries before resetting submission counters. Query polling
  // stays asynchronous and carries the originating frame through completion.
  if(this.ext){const gl=this.gl,disjoint=gl.getParameter(this.ext.GPU_DISJOINT_EXT),waiting=[];
   if(disjoint){this.gpu={};this.disjointEpoch++;}
   for(const item of this.pending){if(disjoint||gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE)){
    const resolvedAt=performance.now(),elapsedNs=disjoint?null:gl.getQueryParameter(item.query,gl.QUERY_RESULT);
    this.gpuRecords.push({...item,query:undefined,stage:item.name,resolvedAt,queryLagMs:resolvedAt-item.issuedAt,elapsedNs,disjoint,epoch:this.disjointEpoch});
    if(!disjoint){const values=this.gpu[item.name]||(this.gpu[item.name]=[]);values.push(elapsedNs/1e6);if(values.length>90)values.shift();}
    gl.deleteQuery(item.query);
   }else waiting.push(item);}this.pending=waiting;
   if(this.gpuRecords.length>512)this.gpuRecords.splice(0,this.gpuRecords.length-512);
  }
  this.context={...context};this.commands={};this.cpuOps={};this.cpu={};this.sample=++this.frame%4===0;
 }
 stats(){return {frameId:this.frame,gpuTimerSupported:!!this.ext,cpuStagesMs:{...this.cpu},commands:{...this.commands},cpuOperations:{...this.cpuOps},gpuStagesMs:Object.fromEntries(Object.entries(this.gpu).map(([name,v])=>[name,v.reduce((a,b)=>a+b,0)/v.length])),gpuRecords:this.gpuRecords.map(v=>({...v})),pendingQueries:this.pending.length,disjointEpoch:this.disjointEpoch};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const p of this.pending)this.gl.deleteQuery(p.query);this.pending=[];for(const [target,name,original]of this.originals)target[name]=original;for(const [prototype,name,original]of this.cpuOriginals)prototype[name]=original;for(const [pass,render]of this.passOriginals)pass.render=render;this.originals=[];this.cpuOriginals=[];this.passOriginals=[];}
}
