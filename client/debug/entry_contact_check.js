import * as THREE from 'three';
import {shoulderTrace} from './motion_check.js';
export async function entryContactCheck(){
 while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));
 const I=window.__iso,R=I.rig.real,reports=[];
 for(const enabled of [false,true]){
  const samples=[],frame=I.frame;
  if(!enabled)I.frame=(...args)=>{if(I.COMBO.includes(I.S.act?.def))I.S.act.armEntry=null;frame(...args);};
  try{await shoulderTrace({until:4400,runMs:1200,presses:[1200,1620,2060],onSample(t){
   if(!I.COMBO.includes(I.S.act?.def)||(I.S.twoEff||0)<.8||I.S.act.t<180)return;
   const a=R.arm.L,palm=a.ha.getWorldPosition(new THREE.Vector3()).add(R.grip.L2.pt.clone().applyQuaternion(a.ha.getWorldQuaternion(new THREE.Quaternion()))),axis=new THREE.Vector3(0,1,0).applyQuaternion(I.rig.katana.quaternion),along=palm.clone().sub(I.rig.katana.position).dot(axis),seat=I.rig.katana.position.clone().addScaledVector(axis,THREE.MathUtils.clamp(along,-.17,-.06));
   samples.push({t,actionMs:I.S.act.t,combo:I.S.combo,weight:I.S.twoEff,gapM:palm.distanceTo(seat)});
  }});}finally{I.frame=frame;}
  const sorted=[...samples].sort((a,b)=>a.gapM-b.gapM),held=samples.filter(s=>s.weight>.95),heldSorted=[...held].sort((a,b)=>a.gapM-b.gapM);
  reports.push({entryBlend:enabled,samples:samples.length,p95:sorted[Math.floor(sorted.length*.95)],worst:sorted.at(-1),fullyEngaged:{threshold:.95,samples:held.length,first:held[0],worst:heldSorted.at(-1)},frames:samples});
 }
 const result={revision:I.runtimeRevision,reports,shaderErrors:I.shaderErrors};await fetch('/debug/save?name=entry-contact-check.json',{method:'POST',body:JSON.stringify(result)});
 return JSON.stringify({...result,reports:reports.map(({frames,...r})=>r)},null,2);
}
