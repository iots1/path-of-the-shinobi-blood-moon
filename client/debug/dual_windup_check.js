import * as THREE from 'three';
import {shoulderTrace,armAngles} from './motion_check.js';
export async function dualWindupCheck(){
 while(!window.__iso?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));const I=window.__iso,R=I.rig.real,reports=[];
 for(const [name,options] of [['quick',{until:3300,runMs:0,presses:[0,340]}],['delayed',{until:3900,runMs:0,presses:[0,848]}],['run',{until:4700,runMs:1200,presses:[1200,1540]}]]){
  const frames=[];
  await shoulderTrace({...options,fn:'pressK',onSample(t){
   if(I.S.act?.def!==I.DUAL)return;const at=I.S.act.t;if(at<1200||at>1700)return;
   const a=R.arm.R,sh=a.up.getWorldPosition(new THREE.Vector3()),q=a.ha.getWorldQuaternion(new THREE.Quaternion()),wr=a.ha.getWorldPosition(new THREE.Vector3()),inv=I.rig.chest.getWorldQuaternion(new THREE.Quaternion()).invert(),palm=wr.clone().add(R.grip.R.pt.clone().applyQuaternion(q)),rel=palm.clone().sub(sh).applyQuaternion(inv),blade=new THREE.Vector3(0,1,0).applyQuaternion(I.rig.katana.quaternion).applyQuaternion(inv);
   frames.push({t,at,palmOutM:-rel.x,palmHeightM:rel.y,bladeUp:blade.y,gripErrorM:palm.distanceTo(I.rig.katana.position),angles:armAngles('R')});
  }});
  const wind=frames.filter(f=>f.at>=1280&&f.at<=1530),cut=frames.filter(f=>f.at>=1580&&f.at<=1680),peak=wind.reduce((a,b)=>a.palmOutM>b.palmOutM?a:b),high=wind.reduce((a,b)=>a.palmHeightM>b.palmHeightM?a:b),low=cut.reduce((a,b)=>a.palmHeightM<b.palmHeightM?a:b);
  reports.push({name,peakOut:peak,high,low,dropM:high.palmHeightM-low.palmHeightM,maxGripErrorM:Math.max(...frames.map(f=>f.gripErrorM)),frames});
 }
 const result={revision:I.runtimeRevision,reports,shaderErrors:I.shaderErrors};await fetch('/debug/save?name=dual-windup-check.json',{method:'POST',body:JSON.stringify(result)});return JSON.stringify({...result,reports:reports.map(({frames,...r})=>r)},null,2);
}
