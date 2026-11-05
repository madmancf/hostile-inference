// Loaded only by the localhost server's explicit ?cpuProfile diagnostic route.
// Nothing is uploaded. Results remain in this page until the developer saves them.
const began=performance.now();
const button=document.createElement('button');button.textContent='Capture CPU · 20 seconds';Object.assign(button.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:'10001',padding:'12px',fontSize:'17px',background:'#f6f2e9'});document.body.append(button);
let capturing=false;
function capture(){
  if(capturing)return;capturing=true;button.disabled=true;button.textContent='CPU recording…';
  try{const profiler=new Profiler({sampleInterval:1,maxBufferSize:30000}),start=performance.now();window.hostileCPUTrace={state:'recording',sampleInterval:profiler.sampleInterval};setTimeout(async()=>{try{window.hostileCPUTrace={state:'complete',sampleInterval:profiler.sampleInterval,wallMs:performance.now()-start,trace:await profiler.stop()};button.textContent='CPU trace ready';}catch(error){window.hostileCPUTrace={error:error.message};button.textContent='CPU capture failed';}capturing=false;button.disabled=false;},20000);}catch(error){window.hostileCPUTrace={error:error.message};capturing=false;button.disabled=false;button.textContent='CPU capture unavailable';}
}
button.onclick=capture;
const waiting=setInterval(()=>{
  const ready=document.body.classList.contains('operation')&&!document.getElementById('briefing').open&&document.getElementById('pause-overlay').hidden;
  if(!ready){if(performance.now()-began>90000){clearInterval(waiting);window.hostileCPUTrace={error:'No active operation before profiling deadline.'};}return;}
  clearInterval(waiting);
  capture();
},250);
