import {romScenarios} from './rom_scenarios.js';
import {referenceRanges} from './rom_ranges.js';
const names={neck:'คอ',spine:'ลำตัว',shoulder:'ไหล่',elbow:'ศอก',forearm:'ท่อนแขน',wrist:'ข้อมือ',hip:'สะโพก',knee:'เข่า',ankle:'ข้อเท้า',
 elevation:'ยกแขน',flexion:'พับงอ',lateral:'เอียง',rotation:'หมุน',extension:'ไปด้านหลัง',crossBody:'หุบข้ามลำตัว',axial:'บิด (ค่าประมาณ)',offPlane:'ออกนอกแกนริก',pronation:'คว่ำ/หงาย (ค่าประมาณ)',radial:'เบี่ยงข้อมือ',abduction:'กาง',dorsiflexion:'กระดกขึ้น'};
const label=key=>key.split('.').map(k=>k==='L'?'ซ้าย':k==='R'?'ขวา':names[k]||k).join(' · ');
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function renderRomReport(target,report){
 target.replaceChildren();target.hidden=false;
 target.append(node('h2','Anatomical RoM — ตรวจทุกขั้นจำลอง'));
 target.append(node('p',`${report.scenarioCount} สถานการณ์ · ${report.steps.toLocaleString()} ขั้น × ${report.stepMs} ms · ${report.revision}`));
 target.append(node('p','ค่าที่แจ้งด้านล่างยังต้องตรวจและปรับต่อ ไม่ใช่ผลผ่านทั้งหมด มุมไหล่และคว่ำ/หงายเป็นค่าประมาณจากริกซึ่งไม่มีหมุดกายวิภาคครบ ส่วน “ออกนอกแกนริก” ใช้ตรวจระนาบพับของกระดูก'));
 const choose=node('select');choose.setAttribute('aria-label','เลือกสถานการณ์ RoM');
 for(const r of report.reports)choose.add(new Option(romScenarios.find(p=>p.name===r.name)?.label||r.name,r.name));
 target.append(choose);const section=node('div');target.append(section);
 function show(){
  section.replaceChildren();const r=report.reports.find(r=>r.name===choose.value),flags=Object.entries(r.referenceFlags).sort((a,b)=>b[1].worstExcess-a[1].worstExcess);
  section.append(node('p',`${r.steps.toLocaleString()} ขั้น · ตัวเลขผิดรูปแบบ ${r.nonFinite} · รายการเกินกรอบอ้างอิง ${flags.length}`));
  const table=node('table'),head=node('tr');for(const title of ['ข้อต่อ / การเคลื่อนไหว','ค่าสูงสุดที่ถูกแจ้ง','กรอบอ้างอิง','จำนวนขั้น','เปิดภาพใกล้จุดนี้'])head.append(node('th',title));table.append(head);
  for(const [key,f] of flags){const row=node('tr');row.append(node('td',label(key)),node('td',`${f.value.toFixed(1)}°`),node('td',`${f.range[0]} ถึง ${f.range[1]}°`),node('td',`${f.samples}`));
   const cell=node('td'),a=node('a',`${f.at.t} ms${f.at.actionMs!==null?' · ท่า '+Math.round(f.at.actionMs)+' ms':''}`);a.href=`?mode=romframe&scenario=${encodeURIComponent(r.name)}&at=${f.at.t}&bones=1&v=${encodeURIComponent(report.revision)}`;a.target='_blank';a.rel='noopener';cell.append(a);row.append(cell);table.append(row);}
  if(!flags.length)section.append(node('p','ไม่พบค่าเกินกรอบที่ตั้งไว้ในสถานการณ์นี้'));else section.append(table);
 }
 choose.onchange=show;show();
}
export function renderFrameAngles(target,meta){
 target.replaceChildren();if(!meta?.anatomy){target.hidden=true;return;}target.hidden=false;
 const table=node('table'),head=node('tr');for(const t of ['มุมโดยประมาณ','ซ้าย','ขวา'])head.append(node('th',t));table.append(head);
 for(const key of ['shoulder.elevation','elbow.flexion','wrist.flexion','wrist.radial','hip.flexion','knee.flexion','ankle.dorsiflexion']){
  const row=node('tr');row.append(node('td',label(key)));
  for(const side of ['L','R']){const value=meta.anatomy.values[side+'.'+key],range=referenceRanges[key],cell=node('td',Number.isFinite(value)?value.toFixed(1)+'°':'—');if(range&&(value<range[0]-.5||value>range[1]+.5))cell.className='rom-flag';row.append(cell);}table.append(row);
 }
 target.append(table);
}
