import {tasks,numericModes,legacyModes} from './frame_tasks.js';
import {renderRomReport,renderFrameAngles} from './rom_report.js';
const $=id=>document.getElementById(id),frame=$('game'),image=$('frameImage'),viewport=$('viewport');
const params=new URLSearchParams(location.search),mode=params.get('mode')||'run',numeric=numericModes.has(mode),legacy=legacyModes.has(mode);
const names={front:'ด้านหน้า',right:'ด้านขวา',back:'ด้านหลัง',left:'ด้านซ้าย'};
const modes=$('mode');
if(![...modes.options].some(o=>o.value===mode))modes.add(new Option(mode==='romframe'?'RoM · เฟรมรอบจุดที่แจ้ง':mode==='romcombo'?'วิ่งเข้าคอมโบ (ระยะใกล้)':mode,mode));
modes.value=mode;$('scenario').textContent=modes.selectedOptions[0].textContent;
$('bones').checked=params.get('bones')==='1';
document.body.classList.toggle('numeric',numeric);document.body.classList.toggle('legacy',legacy);$('report').open=numeric;
if(legacy)viewport.append(frame);
let captureId,times=[],angles=[],shots=new Map(),urls=[],sheetUrl,index=0,angle='front',overview=false,complete=false;
let scale=1,panX=0,panY=0,fitMode=true,loaded=false,displayUrl='';
const pointers=new Map();let gesture,restoreView;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function transform(){image.style.transform=`translate(${panX}px, ${panY}px) scale(${scale})`;$('zoom').textContent=`${Math.round(scale*100)}%`;}
function fit(){if(!loaded)return;fitMode=true;scale=Math.min((viewport.clientWidth-24)/image.naturalWidth,(viewport.clientHeight-24)/image.naturalHeight);panX=(viewport.clientWidth-image.naturalWidth*scale)/2;panY=(viewport.clientHeight-image.naturalHeight*scale)/2;transform();}
function zoomTo(value,x=viewport.clientWidth/2,y=viewport.clientHeight/2){if(!loaded)return;const next=Math.max(.05,Math.min(8,value));panX=x-(x-panX)*next/scale;panY=y-(y-panY)*next/scale;scale=next;fitMode=false;transform();}
function blobUrl(blob){const url=URL.createObjectURL(blob);urls.push(url);return url;}
function activeShot(){return shots.get(`${index}:${angle}`);}
function show(){
 const shot=activeShot(),url=overview?sheetUrl:shot?.url;
 $('previous').disabled=index===0;$('next').disabled=index>=times.length-1;
 $('timeline').value=index;$('timeline').setAttribute('aria-valuetext',`${times[index]??0} ms`);
 $('frameCount').textContent=times.length?`${index+1} / ${times.length}`:'—';
 for(const b of $('angles').children)b.setAttribute('aria-pressed',String(b.dataset.angle===angle));
 for(const b of $('thumbnails').children)b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index));
 $('single').setAttribute('aria-pressed',String(!overview));$('overview').setAttribute('aria-pressed',String(overview));
 const meta=shot?.meta;
 renderFrameAngles($('jointReadout'),meta);
 $('time').textContent=`${meta?.simulatedTimeMs??times[index]??'—'} ms`;
 $('actionTime').textContent=meta?.actionTimeMs!=null?`${meta.actionLabel} ผ่านไป ${meta.actionTimeMs} ms`:'เวลาของท่า —';
 $('phase').textContent=meta?.stage||'กำลังบันทึกเฟรม';
 $('resolution').textContent=meta?`${meta.width} × ${meta.height} px${meta.skeleton?' · เส้นกระดูก':''}`:'ภาพรายเฟรมความละเอียดเต็ม';
 $('viewLabel').textContent=overview?'ภาพรวมทุกมุมและเวลา':`${names[angle]||angle} / ${meta?.simulatedTimeMs??times[index]??'—'} ms`;
 if(url){if(displayUrl!==url){displayUrl=url;image.src=url;}image.hidden=false;$('empty').hidden=true;image.alt=overview?'ภาพรวมท่าและมุมมอง':`${names[angle]||angle} เวลารวม ${meta.simulatedTimeMs} ms ${meta.stage}`;$('download').href=url;$('download').download=overview?`${mode}-overview.png`:`${mode}-${angle}-${meta.simulatedTimeMs}ms.png`;$('download').setAttribute('aria-disabled','false');}
 else{image.hidden=true;$('empty').hidden=false;$('empty').textContent='กำลังบันทึกเฟรมที่เลือก…';$('download').removeAttribute('href');$('download').setAttribute('aria-disabled','true');}
}
function rebuildThumbs(){
 $('thumbnails').replaceChildren();
 times.forEach((t,i)=>{const b=document.createElement('button');b.className='thumb';b.dataset.index=i;b.setAttribute('aria-label',`เลือกเฟรม ${t} ms`);const shot=shots.get(`${i}:${angle}`);if(shot){const im=document.createElement('img');im.src=shot.url;im.alt='';b.append(im);}b.append(document.createTextNode(`${t} ms`));b.addEventListener('click',()=>select(i));$('thumbnails').append(b);});
}
function select(i){index=Math.max(0,Math.min(times.length-1,i));overview=false;show();}
function setAngle(a){angle=a;overview=false;rebuildThumbs();show();}
image.addEventListener('load',()=>{loaded=true;if(fitMode)fit();else transform();});
image.addEventListener('error',()=>status('เปิดภาพไม่สำเร็จ ลองโหลดหน้าใหม่',true));
$('previous').onclick=()=>select(index-1);$('next').onclick=()=>select(index+1);
$('timeline').oninput=e=>select(Number(e.target.value));
$('zoomIn').onclick=()=>zoomTo(scale*1.25);$('zoomOut').onclick=()=>zoomTo(scale/1.25);
$('actual').onclick=()=>zoomTo(1);$('fit').onclick=fit;
$('single').onclick=()=>{overview=false;fitMode=true;show();fit();};
$('overview').onclick=()=>{overview=true;fitMode=true;show();};
viewport.addEventListener('wheel',e=>{if(!loaded)return;e.preventDefault();const r=viewport.getBoundingClientRect();zoomTo(scale*Math.exp(-Math.max(-120,Math.min(120,e.deltaY))*.004),e.clientX-r.left,e.clientY-r.top);},{passive:false});
viewport.addEventListener('pointerdown',e=>{if(e.button!==0||!loaded)return;viewport.focus({preventScroll:true});viewport.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=null;viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){panX+=e.clientX-old.x;panY+=e.clientY-old.y;fitMode=false;transform();return;}
 const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),r=viewport.getBoundingClientRect(),x=(a.x+b.x)/2-r.left,y=(a.y+b.y)/2-r.top;
 if(gesture)zoomTo(scale*distance/gesture.distance,x,y);gesture={distance};
});
function pointerEnd(e){pointers.delete(e.pointerId);gesture=null;if(!pointers.size)viewport.classList.remove('dragging');}
viewport.addEventListener('pointerup',pointerEnd);viewport.addEventListener('pointercancel',pointerEnd);viewport.addEventListener('lostpointercapture',pointerEnd);
window.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='ArrowLeft'){e.preventDefault();select(index-1);}else if(e.key==='ArrowRight'){e.preventDefault();select(index+1);}else if(e.key==='+'||e.key==='='){e.preventDefault();zoomTo(scale*1.25);}else if(e.key==='-'||e.key==='_'){e.preventDefault();zoomTo(scale/1.25);}else if(e.key==='0'){e.preventDefault();fit();}});
new ResizeObserver(()=>{if(fitMode)fit();}).observe(viewport);
function clear(){$('jointReadout').hidden=true;$('jointReadout').replaceChildren();for(const url of urls)URL.revokeObjectURL(url);urls=[];shots.clear();times=[];angles=[];sheetUrl=null;captureId=null;index=0;complete=false;overview=false;loaded=false;displayUrl='';fitMode=true;image.hidden=true;image.removeAttribute('src');$('empty').hidden=false;$('empty').textContent='กำลังโหลดตัวละครและบันทึกภาพ…';$('thumbnails').replaceChildren();$('angles').replaceChildren();$('overview').disabled=true;$('timeline').disabled=true;$('previous').disabled=true;$('next').disabled=true;$('download').removeAttribute('href');$('download').setAttribute('aria-disabled','true');}
window.addEventListener('message',e=>{
 if(e.source!==frame.contentWindow||e.origin!==location.origin)return;const d=e.data;if(!d||typeof d!=='object')return;
 if(d.type==='motion-capture-start'){
  clear();captureId=d.captureId;times=d.times;angles=d.angles;angle=angles.includes(angle)?angle:angles[0];if(restoreView){index=Math.min(times.length-1,restoreView.index);scale=restoreView.scale;panX=restoreView.panX;panY=restoreView.panY;fitMode=restoreView.fitMode;restoreView=null;}$('timeline').max=times.length-1;$('timeline').disabled=false;
  for(const a of angles){const b=document.createElement('button');b.textContent=names[a]||a;b.dataset.angle=a;b.onclick=()=>setAngle(a);$('angles').append(b);}rebuildThumbs();show();
 }else if(d.type==='motion-capture-frame'&&d.captureId===captureId){
  shots.set(`${d.index}:${d.angle}`,{url:blobUrl(d.blob),meta:d.meta});
  status(`กำลังบันทึก ${shots.size} / ${times.length*angles.length} ภาพ`);
  if(d.angle===angle)rebuildThumbs();show();
 }else if(d.type==='motion-capture-complete'&&d.captureId===captureId){
  complete=true;sheetUrl=blobUrl(d.blob);$('overview').disabled=false;
  const c=d.data.capture,unchanged=c.maxPoseDriftDegrees<.001&&c.maxPosePositionDriftM<1e-8;
  status(`${shots.size} ภาพพร้อมตรวจ · ${c.width} × ${c.height} px${unchanged?' · ทุกมุมใช้ท่ากระดูกเดียวกัน':' · พบการเปลี่ยนท่าระหว่างมุมกล้อง'}`,!unchanged);
  $('result').textContent=JSON.stringify(d.data,null,2);show();
 }else if(d.type==='motion-rom-report'){
  try{localStorage.setItem('last-rom-audit',JSON.stringify(d.report));}catch{}
 }else if(d.type==='motion-task-progress'){
  status(d.message);
 }else if(d.type==='motion-task-result'){
  if(mode==='romaudit'){try{const report=JSON.parse(d.result);renderRomReport($('romSummary'),report);document.body.classList.add('rom');$('report').open=false;}catch(error){status(error.message,true);}}
  if(numeric||legacy){$('result').textContent=d.result;status('ตรวจเสร็จแล้ว');if(legacy)$('empty').hidden=true;}
  else if(!complete){$('result').textContent=d.result;status('ดูผลตรวจในรายงานด้านล่าง');$('report').open=true;$('empty').textContent='ผลตรวจอยู่ในรายงานด้านล่าง';}
 }else if(d.type==='motion-task-error'){status('บันทึกภาพไม่สำเร็จ: '+d.message,true);$('result').textContent=d.message;$('report').open=true;$('empty').textContent='บันทึกภาพไม่สำเร็จ ลองโหลดหน้าใหม่';}
});
function start(){
 clear();status('กำลังโหลดเกม…');
 const task=Object.hasOwn(tasks,mode)?tasks[mode]:`m.views({mode:${JSON.stringify(mode)}})`;
 frame.onload=()=>{const s=frame.contentDocument.createElement('script');s.type='module';s.textContent=`window.__motionCaptureFrames=${!numeric&&!legacy};window.__motionSkeletonOverride=${$('bones').checked};try{const m=await import('/debug/motion_check.js?'+Date.now());const result=await ${task};parent.postMessage({type:'motion-task-result',result:typeof result==='string'?result:JSON.stringify(result)},location.origin)}catch(e){parent.postMessage({type:'motion-task-error',message:e.stack||String(e)},location.origin)}`;frame.contentDocument.body.append(s);};
 frame.src='/?anatomical-regression='+Date.now();
}
modes.onchange=()=>{params.set('mode',modes.value);location.search=params.toString();};
$('bones').onchange=()=>{restoreView={index,scale,panX,panY,fitMode};params.set('bones',$('bones').checked?'1':'0');history.replaceState(null,'','?'+params);start();};
if(mode==='romsaved'){
 let report;try{report=JSON.parse(localStorage.getItem('last-rom-audit'));}catch{}
 if(report&&(!params.get('revision')||report.revision===params.get('revision'))){renderRomReport($('romSummary'),report);document.body.classList.add('rom');$('report').open=false;$('result').textContent=JSON.stringify(report,null,2);status(`ผลตรวจที่บันทึกไว้ · ${report.revision}`);}
 else{params.set('mode','romaudit');location.search=params.toString();}
}else start();
