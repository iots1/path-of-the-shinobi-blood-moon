export const romScenarios=[
  {name:'idle',label:'ยืน',mode:'idle',until:1200,runMs:0},
  {name:'walk-stop',label:'เดิน → หยุด',mode:'walk',until:5000,runMs:3600,shift:true},
  {name:'run-stop',label:'วิ่ง → หยุด',mode:'stop',until:3600,runMs:2000},
  {name:'run-turn',label:'วิ่งเปลี่ยนทิศ',mode:'run',until:4800,route:['a','w','d','s']},
  {name:'combo',label:'J J J',mode:'combo',until:2800,runMs:0,presses:[0,420,860]},
  {name:'thrust',label:'K แทงสองมือ',mode:'thrust',until:2400,runMs:0,presses:[0],fn:'pressK'},
  {name:'dual',label:'K K',mode:'dual',until:4400,runMs:0,presses:[0,340],fn:'pressK'},
  {name:'dual-delayed',label:'K K เว้นจังหวะ',mode:'dual',until:4400,runMs:0,presses:[0,848],fn:'pressK'},
  {name:'dual-repeat',label:'K K ซ้ำสองชุด',mode:'dual',until:7000,runMs:0,presses:[0,340,3500,3840],fn:'pressK'},
  {name:'run-dual',label:'วิ่ง → K K',mode:'dual',until:5600,runMs:1200,presses:[1200,1540],fn:'pressK'},
  {name:'run-combo',label:'วิ่ง → J J J',mode:'combo',until:4400,runMs:1200,presses:[1200,1620,2060]},
  {name:'issen',label:'L',mode:'issen',until:3000,runMs:0,presses:[0],fn:'pressL'},
  {name:'blink',label:'พุ่ง Space',mode:'idle',until:1800,runMs:0,presses:[0],fn:'blink'}
];

export async function romFrames(m){
 const params=new URLSearchParams(parent.location.search),plan=romScenarios.find(p=>p.name===params.get('scenario'))||romScenarios[0];
 const requested=Number(params.get('at'))||600,at=Math.max(4,Math.min(plan.until,Math.round(requested/4)*4));
 const times=[...new Set([-40,-20,0,20,40].map(d=>Math.max(4,Math.min(plan.until,at+d))))];
 return m.views({mode:plan.mode,runMs:plan.runMs||0,shift:!!plan.shift,presses:plan.presses||[],fn:plan.fn||'press',route:plan.route,
  inPlace:false,times,tag:`rom-${plan.name}-${at}`,zoom:1.05,fy:.95,width:.75,saveFrames:true});
}
