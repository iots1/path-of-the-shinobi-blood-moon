import * as THREE from 'three';
import {views,armAngles} from './motion_check.js';
export async function thrustSupportCheck(){
 const I=window.__iso;while(!I?.rig.real?.loco)await new Promise(r=>setTimeout(r,100));const R=I.rig.real,rows=[];
 for(const time of [100,170,220,260,320,400,500,650]){
  await views({mode:'thrust',times:[time],save:false,captureFrames:false});
  const a=R.arm.L,q=a.ha.getWorldQuaternion(new THREE.Quaternion()),p=a.ha.getWorldPosition(new THREE.Vector3()).add(R.grip.L2.pt.clone().applyQuaternion(q)),axis=new THREE.Vector3(0,1,0).applyQuaternion(I.rig.katana.quaternion),delta=p.sub(I.rig.katana.position),along=delta.dot(axis);
  rows.push({time,anatomical:I.S.anatomicalArms,evaluation:a.gripEvaluation,twoEff:I.S.twoEff,gripOn:I.S.gripOn,along,perpendicularM:delta.addScaledVector(axis,-along).length(),angles:armAngles('L'),solution:a.gripSolution});
 }
 const report={revision:I.runtimeRevision,pullDistance:I.DUAL.pullDistance,rows};await fetch('/debug/save?name=thrust-support.json',{method:'POST',body:JSON.stringify(report,null,2)});return JSON.stringify(report);
}
